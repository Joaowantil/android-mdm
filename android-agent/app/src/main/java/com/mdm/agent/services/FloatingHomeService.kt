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
 * apps" permission and the window session may not be ready yet. A watchdog then probes that
 * the button is *still being painted*, because neither `addView` succeeding nor the view's
 * visibility flags prove it: on some collectors the boot-time window ends up without a
 * surface (visible in `dumpsys window windows` as a window with no `mSurface`) while still
 * reporting `isAttachedToWindow`/`isShown`. Recreating the window is what brings the button
 * back — the same thing leaving and re-entering the kiosk used to do by hand.
 */
class FloatingHomeService : Service() {

    private var windowManager: WindowManager? = null
    private var floatingView: HomeButton? = null
    private val handler = Handler(Looper.getMainLooper())
    private var attempts = 0
    private var addedAt = 0L
    private var recreates = 0
    private var lastRecreateAt = 0L
    private var ticks = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (isButtonVisible()) return START_STICKY
        attempts = 0
        handler.removeCallbacksAndMessages(null)
        Log.i(
            TAG,
            "onStartCommand: canDrawOverlays=${canDrawOverlays(this)} view=${describeView()}"
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
     * Whether the button is on screen *right now*. A window whose surface the system dropped
     * keeps reporting itself as attached, visible and shown, and having been painted once at
     * boot says nothing about the present. The watchdog therefore asks the view to repaint on
     * every tick and this checks that the repaint actually happened.
     */
    private fun isButtonVisible(): Boolean {
        val v = floatingView ?: return false
        if (withinGrace()) return true
        if (!v.isAttachedToWindow || v.windowVisibility != View.VISIBLE || !v.isShown) return false
        return SystemClock.elapsedRealtime() - v.lastDrawAt <= DRAW_TIMEOUT_MS
    }

    private fun describeView(): String {
        val v = floatingView ?: return "none"
        return "attached=${v.isAttachedToWindow} windowVisibility=${v.windowVisibility} " +
            "isShown=${v.isShown} size=${v.width}x${v.height} " +
            "lastDrawAgeMs=${if (v.lastDrawAt == 0L) -1 else SystemClock.elapsedRealtime() - v.lastDrawAt}"
    }

    private fun withinGrace(): Boolean =
        SystemClock.elapsedRealtime() - addedAt < ATTACH_GRACE_MS

    /** Tears down the current window so a fresh one can be created in its place. */
    private fun dropView(reason: String) {
        val v = floatingView ?: return
        Log.w(TAG, "$reason (${describeView()}); recreating the overlay")
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
            // Ask for a repaint so the next tick can tell a live window from a dead one.
            floatingView?.invalidate()
        }
        ticks++
        if (ticks % STATUS_LOG_EVERY_TICKS == 0L) {
            Log.i(TAG, "status: view=${describeView()} recreates=$recreates")
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
        val size = (56 * density).toInt()
        val button = HomeButton(this).apply {
            text = "⌂"
            textSize = 26f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = roundBackground()
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        // A fixed window size keeps the system from ever ending up with a zero-sized window,
        // which would get no surface and therefore never be drawn.
        val params = WindowManager.LayoutParams(
            size,
            size,
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
        private const val DRAW_TIMEOUT_MS = 12_000L
        private const val STATUS_LOG_EVERY_TICKS = 12L

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
 * Records when the button was last painted. A window without a surface is never drawn, so a
 * stale timestamp after an [View.invalidate] is what distinguishes "on screen" from
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
