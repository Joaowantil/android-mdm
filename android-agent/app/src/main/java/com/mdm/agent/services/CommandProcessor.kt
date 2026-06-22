package com.mdm.agent.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.util.Log
import androidx.core.app.NotificationCompat
import com.mdm.agent.R
import com.mdm.agent.receivers.MDMDeviceAdminReceiver
import com.mdm.agent.ui.KioskActivity
import com.mdm.agent.ui.LockScreenActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * Shared logic for sending a heartbeat, fetching pending commands and executing them.
 * Used by both [HeartbeatService] (fast foreground polling) and [HeartbeatWorker]
 * (periodic background fallback).
 */
object CommandProcessor {
    private const val TAG = "CommandProcessor"
    private const val CONTROL_CHANNEL_ID = "mdm_agent_control"

    /**
     * Sends a heartbeat and executes any pending commands returned by the server.
     * @return true on success, false if it should be retried.
     */
    suspend fun pollAndExecute(context: Context): Boolean {
        val prefs = context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        val deviceId = prefs.getString("device_id", null) ?: return false

        val storageInfo = getStorageInfo()
        val response = ApiClient.api.heartbeat(
            HeartbeatRequest(
                device_id = deviceId,
                battery_level = getBatteryLevel(context),
                storage_free = storageInfo.first,
                storage_total = storageInfo.second,
                is_online = true,
                installed_apps = getInstalledApps(context),
                fcm_token = null
            )
        )

        if (!response.isSuccessful) {
            return false
        }

        response.body()?.commands?.forEach { command ->
            executeCommand(context, command)
        }
        return true
    }

    private suspend fun executeCommand(context: Context, command: PendingCommand) {
        Log.d(TAG, "Executing command: ${command.command_type}")
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(context, MDMDeviceAdminReceiver::class.java)

        var success = true
        try {
            when (command.command_type) {
                "lock" -> lock(context, dpm, command.payload)
                "wipe" -> dpm.wipeData(0)
                "locate" -> LocationService.requestLocationUpdate(context)
                "set_kiosk" -> setKiosk(context, command.payload)
                "apply_policy" -> {
                    val payload = command.payload
                    if (payload != null) {
                        val cameraDisabled =
                            (payload["restrictions"] as? Map<*, *>)?.get("camera_disabled") as? Boolean ?: false
                        dpm.setCameraDisabled(adminComponent, cameraDisabled)
                    }
                }
                else -> {
                    Log.w(TAG, "Unknown command type: ${command.command_type}")
                    success = false
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to execute command ${command.command_type}", e)
            success = false
        }

        acknowledge(command.id, success)
    }

    private fun lock(context: Context, dpm: DevicePolicyManager, payload: Map<String, Any>?) {
        val pin = payload?.get("pin") as? String
        if (!pin.isNullOrBlank()) {
            context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("locked", true)
                .putString("lock_pin", pin)
                .apply()
            launchActivity(
                context,
                Intent(context, LockScreenActivity::class.java),
                notificationId = 100,
                title = "Dispositivo bloqueado",
                text = "Toque para inserir o PIN"
            )
        }
        dpm.lockNow()
    }

    private fun setKiosk(context: Context, payload: Map<String, Any>?) {
        val enabled = payload?.get("enabled") as? Boolean ?: false
        @Suppress("UNCHECKED_CAST")
        val apps = (payload?.get("apps") as? List<String>) ?: emptyList()
        @Suppress("UNCHECKED_CAST")
        val webLinks = (payload?.get("web_links") as? List<Map<String, Any>>) ?: emptyList()
        val pin = payload?.get("pin") as? String

        val webLinksJson = JSONArray().apply {
            webLinks.forEach { link ->
                val url = link["url"] as? String ?: ""
                if (url.isNotBlank()) {
                    put(JSONObject().put("label", link["label"] as? String ?: url).put("url", url))
                }
            }
        }.toString()

        val prefs = context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean("kiosk_enabled", enabled)
            .putBoolean("kiosk_paused", false)
            .putString("kiosk_apps", apps.joinToString(","))
            .putString("kiosk_web_links", webLinksJson)
            .apply()
        if (!pin.isNullOrBlank()) {
            prefs.edit().putString("kiosk_pin", pin).apply()
        }

        if (enabled) {
            KioskPolicy.enable(context, apps)
            val intent = Intent(context, KioskActivity::class.java)
                .putStringArrayListExtra(KioskActivity.EXTRA_APPS, ArrayList(apps))
            launchActivity(
                context,
                intent,
                notificationId = 101,
                title = "Modo Kiosk ativo",
                text = "Toque para abrir o modo kiosk"
            )
        } else {
            KioskPolicy.disable(context)
            KioskActivity.cancelResumeNotification(context)
            context.sendBroadcast(Intent(KioskActivity.ACTION_EXIT_KIOSK).setPackage(context.packageName))
        }
    }

    /**
     * Launches an activity from background. Uses a full-screen-intent notification, which is
     * the reliable way to bring up UI from a background/foreground service on Android 10+.
     */
    private fun launchActivity(
        context: Context,
        intent: Intent,
        notificationId: Int,
        title: String,
        text: String
    ) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CONTROL_CHANNEL_ID,
                "MDM Controle",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(channel)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CONTROL_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pendingIntent, true)
            .setAutoCancel(true)
            .setOngoing(true)
            .build()

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(notificationId, notification)

        // Also try a direct start (works when the app already has launch privileges).
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Direct activity start blocked, relying on full-screen intent", e)
        }
    }

    private suspend fun acknowledge(commandId: Int, success: Boolean) {
        try {
            ApiClient.api.ackCommand(
                commandId,
                CommandAck(status = if (success) "executed" else "failed")
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acknowledge command $commandId", e)
        }
    }

    private fun getBatteryLevel(context: Context): Int {
        val batteryStatus = context.registerReceiver(
            null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100 / scale) else -1
    }

    private fun getStorageInfo(): Pair<Int, Int> {
        val stat = StatFs(Environment.getDataDirectory().path)
        val free = (stat.availableBytes / (1024 * 1024)).toInt()
        val total = (stat.totalBytes / (1024 * 1024)).toInt()
        return Pair(free, total)
    }

    private fun getInstalledApps(context: Context): List<String> {
        return context.packageManager.getInstalledApplications(0)
            .map { it.packageName }
    }
}
