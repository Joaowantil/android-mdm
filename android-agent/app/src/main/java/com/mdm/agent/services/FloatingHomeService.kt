package com.mdm.agent.services

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.mdm.agent.ui.KioskActivity
import kotlin.math.abs

/**
 * Shows a small draggable "⌂" button that floats on top of every app while the kiosk is
 * armed. Tapping it brings the kiosk launcher back to the front — essential on rugged
 * collectors that have no hardware Home button. Requires the "draw over other apps"
 * permission; if it isn't granted the service just stops (the button simply won't appear).
 */
class FloatingHomeService : Service() {

    private var windowManager: WindowManager? = null
    private var floatingView: View? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        addFloatingButton()
        return START_STICKY
    }

    private fun addFloatingButton() {
        if (floatingView != null) return
        if (!canDrawOverlays(this)) {
            stopSelf()
            return
        }
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm

        val density = resources.displayMetrics.density
        val pad = (12 * density).toInt()
        val button = TextView(this).apply {
            text = "⌂"
            textSize = 26f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
            background = roundBackground()
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (16 * density).toInt()
            y = (140 * density).toInt()
        }

        button.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var touchX = 0f
            private var touchY = 0f
            private var dragging = false

            override fun onTouch(v: View, event: MotionEvent): Boolean {
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        touchX = event.rawX
                        touchY = event.rawY
                        dragging = false
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.rawX - touchX).toInt()
                        val dy = (event.rawY - touchY).toInt()
                        if (abs(dx) > 10 || abs(dy) > 10) dragging = true
                        params.x = initialX + dx
                        params.y = initialY + dy
                        wm.updateViewLayout(button, params)
                        return true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (!dragging) {
                            KioskActivity.enter(this@FloatingHomeService)
                        }
                        return true
                    }
                }
                return false
            }
        })

        try {
            wm.addView(button, params)
            floatingView = button
        } catch (e: Exception) {
            stopSelf()
        }
    }

    private fun roundBackground(): android.graphics.drawable.GradientDrawable =
        android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.OVAL
            setColor(0x99555555.toInt())
            setStroke((2 * resources.displayMetrics.density).toInt(), 0xCCFFFFFF.toInt())
        }

    override fun onDestroy() {
        floatingView?.let { v ->
            try {
                windowManager?.removeView(v)
            } catch (_: Exception) {
            }
        }
        floatingView = null
        super.onDestroy()
    }

    companion object {
        fun canDrawOverlays(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

        fun start(context: Context) {
            if (!canDrawOverlays(context)) return
            context.startService(Intent(context, FloatingHomeService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, FloatingHomeService::class.java))
        }
    }
}
