package com.mdm.agent.receivers

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import com.mdm.agent.services.HeartbeatService

/**
 * Self-heal watchdog for command delivery.
 *
 * [HeartbeatService] does the real work (polls every 15s), and [HeartbeatWorker] is a
 * WorkManager-based fallback - but WorkManager's minimum periodic interval is 15 MINUTES,
 * so if the OS kills the foreground service (aggressive background-process killers are
 * common on rugged/enterprise ROMs, and we've seen this device go in and out of Doze
 * frequently), the device can go up to 15 minutes without picking up commands even though
 * it still has internet.
 *
 * This watchdog closes that gap: it fires every [INTERVAL_MS] (much shorter than
 * WorkManager's floor) using an exact, Doze-resistant alarm, restarts the heartbeat
 * service if it isn't already running, and reschedules itself. HeartbeatService.start()
 * is safe to call even when the service is already alive (Service.onStartCommand no-ops
 * if the poll loop is already active), so this is a cheap, idempotent check.
 */
class WatchdogReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WatchdogReceiver"
        private const val ACTION_WATCHDOG_TICK = "com.mdm.agent.WATCHDOG_TICK"
        private const val INTERVAL_MS = 5 * 60 * 1000L // 5 minutes

        fun schedule(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pendingIntent = pendingIntent(context)
            val triggerAt = SystemClock.elapsedRealtime() + INTERVAL_MS
            try {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAt,
                    pendingIntent
                )
            } catch (e: SecurityException) {
                // Exact alarms require a permission grant on API 31+; fall back to an
                // inexact alarm rather than losing the watchdog entirely.
                Log.w(TAG, "Exact alarm not permitted, falling back to inexact", e)
                alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
            }
        }

        fun cancel(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.cancel(pendingIntent(context))
        }

        private fun pendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, WatchdogReceiver::class.java).apply {
                action = ACTION_WATCHDOG_TICK
            }
            return PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_WATCHDOG_TICK) return
        val prefs = context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        if (prefs.getBoolean("enrolled", false)) {
            Log.d(TAG, "Watchdog tick: ensuring heartbeat service is alive")
            HeartbeatService.start(context)
        }
        // Re-arm for the next tick - AlarmManager alarms are one-shot.
        schedule(context)
    }
}
