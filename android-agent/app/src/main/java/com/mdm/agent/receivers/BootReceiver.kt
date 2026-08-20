package com.mdm.agent.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mdm.agent.services.AppRestrictionPolicy
import com.mdm.agent.services.HeartbeatService
import com.mdm.agent.services.HeartbeatWorker
import com.mdm.agent.ui.KioskActivity

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Device booted, starting heartbeat service")
            val prefs = context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
            if (prefs.getBoolean("enrolled", false)) {
                HeartbeatService.start(context)
            }
            HeartbeatWorker.schedule(context)

            // Pausing the kiosk with the PIN disables our Home alias, so a reboot while paused
            // would leave the collector outside the kiosk. The pause is only for the current
            // boot: bring the kiosk back.
            if (prefs.getBoolean("kiosk_enabled", false) && prefs.getBoolean("kiosk_paused", false)) {
                Log.i("BootReceiver", "kiosk was paused before the reboot; re-arming it")
                prefs.edit().putBoolean("kiosk_paused", false).apply()
                KioskActivity.enter(context)
            }

            // The system itself persists package suspension across reboots, but we
            // re-apply from our saved state as a self-heal safety net (same idea used
            // for the kiosk retries) in case anything drifted.
            AppRestrictionPolicy.reapplyFromPrefs(context)
        }
    }
}
