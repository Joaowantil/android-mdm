package com.mdm.agent.services

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.view.WindowManager

/**
 * Shows a small draggable "⌂" button floating on top of every app while the kiosk is armed.
 * Tapping it brings the kiosk launcher back to the front — essential on rugged collectors
 * that have no hardware Home button.
 *
 * This is the fallback path, used when [HomeAccessibilityService] is not switched on. It
 * relies on the "draw over other apps" permission, which some collectors honour only
 * partially: the window is registered but never given a surface, so nothing is painted. The
 * service is therefore started when the kiosk launches an app (so the window is always freshly
 * built) and a watchdog probes that the button is *still being painted*, recreating it
 * otherwise — the same thing leaving and re-entering the kiosk used to do by hand.
 */
class FloatingHomeService : Service() {

    private val overlay by lazy {
        HomeButtonOverlay(this, overlayWindowType(), TAG)
    }
    private val handler = Handler(Looper.getMainLooper())
    private var attempts = 0
    private var addedAt = 0L
    private var recreates = 0
    private var lastRecreateAt = 0L
    private var ticks = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (HomeAccessibilityService.isEnabled(this)) {
            Log.i(TAG, "accessibility home button is enabled; standing down")
            stopSelf()
            return START_NOT_STICKY
        }
        if (isButtonVisible()) return START_STICKY
        attempts = 0
        handler.removeCallbacksAndMessages(null)
        Log.i(
            TAG,
            "onStartCommand: canDrawOverlays=${canDrawOverlays(this)} view=${overlay.describe()}"
        )
        dropView("start requested while the button is not on screen")
        tryAddFloatingButton()
        scheduleWatchdog()
        return START_STICKY
    }

    /** Whether a window for the button currently exists, regardless of it being drawn. */
    private fun isButtonAttached(): Boolean {
        if (!overlay.isAdded) return false
        // addView() attaches on the next traversal, so treat a just-added view as attached.
        return overlay.isAttachedToWindow || withinGrace()
    }

    /**
     * Whether the button is on screen *right now*. A window whose surface the system dropped
     * keeps reporting itself as attached, visible and shown, and having been painted once at
     * boot says nothing about the present.
     */
    private fun isButtonVisible(): Boolean {
        if (!overlay.isAdded) return false
        if (withinGrace()) return true
        return overlay.isPainting(DRAW_TIMEOUT_MS)
    }

    private fun withinGrace(): Boolean =
        SystemClock.elapsedRealtime() - addedAt < ATTACH_GRACE_MS

    /** Tears down the current window so a fresh one can be created in its place. */
    private fun dropView(reason: String) {
        if (!overlay.isAdded) return
        Log.w(TAG, "$reason (${overlay.describe()}); recreating the overlay")
        overlay.remove()
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
            overlay.requestRedraw()
        }
        ticks++
        if (ticks % STATUS_LOG_EVERY_TICKS == 0L) {
            Log.i(TAG, "status: view=${overlay.describe()} recreates=$recreates")
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
        if (!overlay.add()) return false
        addedAt = SystemClock.elapsedRealtime()
        Log.i(TAG, "floating home button attached after $attempts retries")
        scheduleWatchdog()
        return true
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        overlay.remove()
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

        private fun overlayWindowType(): Int =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

        fun canDrawOverlays(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

        /**
         * Starts the service. We deliberately do NOT gate on [canDrawOverlays] here: right
         * after boot that check can transiently return false, and gating would prevent the
         * service from ever starting. The service retries adding the overlay internally.
         */
        fun start(context: Context) {
            if (HomeAccessibilityService.isEnabled(context)) return
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

        /**
         * Tears the service down and starts it again so the overlay window is built from
         * scratch. Reusing a window created earlier (notably at boot) is unreliable on some
         * collectors, where it never gets a surface and is therefore never painted.
         */
        fun restart(context: Context) {
            stop(context)
            start(context)
        }
    }
}
