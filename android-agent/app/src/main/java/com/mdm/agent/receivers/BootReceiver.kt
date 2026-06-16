package com.mdm.agent.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mdm.agent.services.HeartbeatService
import com.mdm.agent.services.HeartbeatWorker

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Device booted, starting heartbeat service")
            val prefs = context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
            if (prefs.getBoolean("enrolled", false)) {
                HeartbeatService.start(context)
            }
            HeartbeatWorker.schedule(context)
        }
    }
}
