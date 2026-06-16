package com.mdm.agent.services

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import android.util.Log
import com.mdm.agent.receivers.MDMDeviceAdminReceiver

/**
 * Shared logic for sending a heartbeat, fetching pending commands and executing them.
 * Used by both [HeartbeatService] (fast foreground polling) and [HeartbeatWorker]
 * (periodic background fallback).
 */
object CommandProcessor {
    private const val TAG = "CommandProcessor"

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
                "lock" -> dpm.lockNow()
                "wipe" -> dpm.wipeData(0)
                "locate" -> LocationService.requestLocationUpdate(context)
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
