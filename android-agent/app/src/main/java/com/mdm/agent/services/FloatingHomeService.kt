package com.mdm.agent.services

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.mdm.agent.ui.KioskActivity
import kotlin.math.abs

/**
 * Shows a small draggable "⌂" button floating on top of every app while the kiosk is armed.
 * Tapping it brings the kiosk launcher back to the front — essential on rugged collectors
 * that have no hardware Home button.
 *
 * Adding the overlay is retried for a while because right after boot the "draw over other
 * apps" permission and the window session may not be ready yet; a single attempt would
 * silently fail, which is why the button used to appear only after leaving and re-entering
 * the kiosk.
 */
class FloatingHomeService : Service() {

    private var windowManager: WindowManager? = null
    private var floatingView: View? = null
    private val handler = Handler(Looper.getMainLooper())
    private var attempts = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        attempts = 0
        handler.removeCallbacksAndMessages(null)
        tryAddFloatingButton()
        return START_STICKY
    }

    /**
     * Adds the overlay button, retrying up to [MAX_ATTEMPTS] (once per second). Keeps
     * retrying even while the overlay permission still reads as "not granted", because that
     * check is unreliable for a few seconds right after boot.
     */
    private fun tryAddFloatingButton() {
        if (floatingView != null) return
        val added = if (canDrawOverlays(this)) addFloatingButton() else false
        if (!added) {
            attempts++
            if (attempts < MAX_ATTEMPTS) {
                handler.postDelayed({ tryAddFloatingButton() }, 1000)
            } else {
                // Permission likely never granted; nothing more we can do.
                stopSelf()
            }
        }
    }

    private fun addFloatingButton(): Boolean {
        if (floatingView != null) return true
        if (!canDrawOverlays(this)) return false
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

        return try {
            wm.addView(button, params)
            floatingView = button
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun roundBackground(): android.graphics.drawable.GradientDrawable =
        android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.OVAL
            setColor(0x99555555.toInt())
            setStroke((2 * resources.displayMetrics.density).toInt(), 0xCCFFFFFF.toInt())
        }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
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
        private const val MAX_ATTEMPTS = 60

        fun canDrawOverlays(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

        /**
         * Starts the service. We deliberately do NOT gate on [canDrawOverlays] here: right
         * after boot that check can transiently return false, and gating would prevent the
         * service from ever starting. The service retries adding the overlay internally.
         */
        fun start(context: Context) {
            try {
                context.startService(Intent(context, FloatingHomeService::class.java))
            } catch (e: Exception) {
                // startService can be refused if called while in the background (Android O+);
                // KioskActivity re-invokes this from the foreground, so it's safe to ignore.
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, FloatingHomeService::class.java))
        }
    }
}
