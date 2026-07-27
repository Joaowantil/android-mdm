package com.mdm.agent.services

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
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
 * apps" permission and the window session may not be ready yet. A watchdog then keeps
 * verifying that the button was really painted, not merely that `addView` succeeded: on some
 * collectors the boot-time window is registered without ever getting a surface, so it is
 * never rendered while still reporting itself as attached and shown. Recreating the window
 * is what brings the button back — the same thing that leaving and re-entering the kiosk
 * used to do by hand.
 */
class FloatingHomeService : Service() {

    private var windowManager: WindowManager? = null
    private var floatingView: HomeButton? = null
    private val handler = Handler(Looper.getMainLooper())
    private var attempts = 0
    private var addedAt = 0L
    private var recreates = 0
    private var lastRecreateAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (isButtonVisible()) return START_STICKY
        attempts = 0
        handler.removeCallbacksAndMessages(null)
        Log.i(
            TAG,
            "onStartCommand: canDrawOverlays=${canDrawOverlays(this)} " +
                "existingView=${floatingView != null}"
        )
        dropView("start requested while the button is not on screen")
        tryAddFloatingButton()
        scheduleWatchdog()
        return START_STICKY
    }

    /** Whether a window for the button currently exists, regardless of it being drawn. */
    private fun isButtonAttached(): Boolean {
        val v = floatingView ?: return false
        // addView() attaches on the next traversal, so treat a just-added view as attached.
        return v.isAttachedToWindow || withinGrace()
    }

    /**
     * Whether the button really made it to the screen. Neither `addView` succeeding nor the
     * view's own visibility flags prove that: a window can be registered and report
     * `isAttachedToWindow`/`isShown` while the system never gives it a surface, in which case
     * it is never painted. Having been painted at least once is the only reliable evidence.
     */
    private fun isButtonVisible(): Boolean {
        val v = floatingView ?: return false
        if (withinGrace()) return true
        return v.isAttachedToWindow && v.windowVisibility == View.VISIBLE && v.isShown &&
            v.wasDrawn
    }

    private fun withinGrace(): Boolean =
        SystemClock.elapsedRealtime() - addedAt < ATTACH_GRACE_MS

    /** Tears down the current window so a fresh one can be created in its place. */
    private fun dropView(reason: String) {
        val v = floatingView ?: return
        Log.w(
            TAG,
            "$reason (attached=${v.isAttachedToWindow} " +
                "windowVisibility=${v.windowVisibility} isShown=${v.isShown} " +
                "drawn=${v.wasDrawn}); recreating the overlay"
        )
        try {
            windowManager?.removeView(v)
        } catch (_: Exception) {
        }
        floatingView = null
    }

    private fun isScreenOn(): Boolean =
        (getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive

    /**
     * Re-checks periodically that the button is really on screen and recreates it otherwise,
     * so it recovers on its own without leaving the kiosk.
     */
    private val watchdog = Runnable { runWatchdog() }

    private fun runWatchdog() {
        // While the screen is off the window is legitimately not drawn; recreating it then
        // would churn every interval for no reason.
        if (isScreenOn()) {
            if (isButtonVisible()) {
                recreates = 0
            } else if (dueForRecreate()) {
                recreates++
                lastRecreateAt = SystemClock.elapsedRealtime()
                attempts = 0
                handler.removeCallbacksAndMessages(null)
                dropView("overlay window is not being drawn")
                tryAddFloatingButton()
            }
        }
        scheduleWatchdog()
    }

    /** Retries quickly at first, then slows down so a blocked overlay does not churn forever. */
    private fun dueForRecreate(): Boolean {
        val interval =
            if (recreates < FAST_RECREATES) WATCHDOG_INTERVAL_MS else SLOW_RECREATE_INTERVAL_MS
        return SystemClock.elapsedRealtime() - lastRecreateAt >= interval
    }

    private fun scheduleWatchdog() {
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, WATCHDOG_INTERVAL_MS)
    }

    /**
     * Adds the overlay button, retrying up to [MAX_ATTEMPTS] (once per second). Keeps
     * retrying even while the overlay permission still reads as "not granted", because that
     * check is unreliable for a few seconds right after boot.
     */
    private fun tryAddFloatingButton() {
        if (isButtonAttached()) return
        val added = if (canDrawOverlays(this)) addFloatingButton() else false
        if (!added) {
            attempts++
            if (attempts < MAX_ATTEMPTS) {
                handler.postDelayed({ tryAddFloatingButton() }, 1000)
            } else {
                Log.w(
                    TAG,
                    "giving up after $attempts attempts; canDrawOverlays=" +
                        "${canDrawOverlays(this)}. Grant \"draw over other apps\" to " +
                        "com.mdm.agent so the floating home button can be shown."
                )
                stopSelf()
            }
        }
    }

    private fun addFloatingButton(): Boolean {
        if (isButtonAttached()) return true
        if (!canDrawOverlays(this)) return false
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm

        val density = resources.displayMetrics.density
        val pad = (12 * density).toInt()
        val button = HomeButton(this).apply {
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
            addedAt = SystemClock.elapsedRealtime()
            Log.i(TAG, "floating home button attached after $attempts retries")
            scheduleWatchdog()
            true
        } catch (e: Exception) {
            Log.w(TAG, "addView failed (attempt $attempts): ${e.javaClass.simpleName}: ${e.message}")
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
        private const val TAG = "FloatingHome"
        private const val MAX_ATTEMPTS = 60
        private const val WATCHDOG_INTERVAL_MS = 5_000L
        private const val ATTACH_GRACE_MS = 3_000L
        private const val FAST_RECREATES = 12
        private const val SLOW_RECREATE_INTERVAL_MS = 30_000L

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
                Log.w(TAG, "startService refused: ${e.javaClass.simpleName}")
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, FloatingHomeService::class.java))
        }
    }
}

/**
 * Records whether the button was ever painted. A window without a surface is never drawn, so
 * this is what distinguishes "on screen" from "registered but invisible".
 */
private class HomeButton(context: Context) : TextView(context) {

    var wasDrawn = false
        private set

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        wasDrawn = true
    }
}
