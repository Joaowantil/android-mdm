package com.mdm.agent.services

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.mdm.agent.ui.KioskActivity
import kotlin.math.abs

/**
 * The draggable "⌂" window itself, independent of what keeps it alive. It is used both as a
 * plain app overlay ([WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY], which needs the
 * "draw over other apps" permission) and as an accessibility overlay, which some collectors
 * are the only way to get an actually rendered window on top of a kiosk app.
 */
internal class HomeButtonOverlay(
    private val context: Context,
    private val windowType: Int,
    private val tag: String
) {

    private var windowManager: WindowManager? = null
    private var view: HomeButton? = null

    val isAdded: Boolean
        get() = view != null

    /** When the button was last painted, or 0 if it never was. */
    val lastDrawAt: Long
        get() = view?.lastDrawAt ?: 0L

    val isAttachedToWindow: Boolean
        get() = view?.isAttachedToWindow == true

    fun describe(): String {
        val v = view ?: return "none"
        return "attached=${v.isAttachedToWindow} windowVisibility=${v.windowVisibility} " +
            "isShown=${v.isShown} size=${v.width}x${v.height} " +
            "lastDrawAgeMs=${if (v.lastDrawAt == 0L) -1 else SystemClock.elapsedRealtime() - v.lastDrawAt}"
    }

    /** Whether the window is currently painting, i.e. the system gave it a surface. */
    fun isPainting(drawTimeoutMs: Long): Boolean {
        val v = view ?: return false
        if (!v.isAttachedToWindow || v.windowVisibility != View.VISIBLE || !v.isShown) return false
        return SystemClock.elapsedRealtime() - v.lastDrawAt <= drawTimeoutMs
    }

    /** Asks for a repaint so [isPainting] can tell a live window from a dead one. */
    fun requestRedraw() = view?.invalidate()

    fun add(): Boolean {
        if (view != null) return true
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm

        val density = context.resources.displayMetrics.density
        val size = (56 * density).toInt()
        val button = HomeButton(context).apply {
            text = "⌂"
            textSize = 26f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = roundBackground(density)
        }

        // A fixed window size keeps the system from ever ending up with a zero-sized window,
        // which would get no surface and therefore never be drawn.
        val params = WindowManager.LayoutParams(
            size,
            size,
            windowType,
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
                        try {
                            wm.updateViewLayout(button, params)
                        } catch (_: Exception) {
                        }
                        return true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (!dragging) KioskActivity.enter(context)
                        return true
                    }
                }
                return false
            }
        })

        return try {
            wm.addView(button, params)
            view = button
            true
        } catch (e: Exception) {
            Log.w(tag, "addView failed: ${e.javaClass.simpleName}: ${e.message}")
            false
        }
    }

    fun remove() {
        val v = view ?: return
        try {
            windowManager?.removeView(v)
        } catch (_: Exception) {
        }
        view = null
    }

    private fun roundBackground(density: Float): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(0x99555555.toInt())
            setStroke((2 * density).toInt(), 0xCCFFFFFF.toInt())
        }
}

/**
 * Records when the button was last painted. A window without a surface is never drawn, so a
 * stale timestamp after a [View.invalidate] is what distinguishes "on screen" from
 * "registered but invisible".
 */
private class HomeButton(context: Context) : TextView(context) {

    var lastDrawAt = 0L
        private set

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        lastDrawAt = SystemClock.elapsedRealtime()
    }
}
