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
import androidx.work.*
import com.mdm.agent.receivers.MDMDeviceAdminReceiver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class HeartbeatWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        const val TAG = "HeartbeatWorker"
        const val WORK_NAME = "mdm_heartbeat"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<HeartbeatWorker>(
                15, TimeUnit.MINUTES
            ).setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            ).build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val prefs = applicationContext.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
            val deviceId = prefs.getString("device_id", null) ?: return@withContext Result.failure()

            val batteryLevel = getBatteryLevel()
            val storageInfo = getStorageInfo()

            val response = ApiClient.api.heartbeat(
                HeartbeatRequest(
                    device_id = deviceId,
                    battery_level = batteryLevel,
                    storage_free = storageInfo.first,
                    storage_total = storageInfo.second,
                    is_online = true,
                    installed_apps = getInstalledApps(),
                    fcm_token = null
                )
            )

            if (response.isSuccessful) {
                val body = response.body()
                body?.commands?.forEach { command ->
                    executeCommand(command)
                }
                Result.success()
            } else {
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat failed", e)
            Result.retry()
        }
    }

    private fun getBatteryLevel(): Int {
        val batteryStatus = applicationContext.registerReceiver(
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

    private fun getInstalledApps(): List<String> {
        return applicationContext.packageManager.getInstalledApplications(0)
            .map { it.packageName }
    }

    private fun executeCommand(command: PendingCommand) {
        Log.d(TAG, "Executing command: ${command.command_type}")
        val dpm = applicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(applicationContext, MDMDeviceAdminReceiver::class.java)

        when (command.command_type) {
            "lock" -> {
                dpm.lockNow()
            }
            "wipe" -> {
                dpm.wipeData(0)
            }
            "locate" -> {
                LocationService.requestLocationUpdate(applicationContext)
            }
            "apply_policy" -> {
                // Apply policy restrictions
                val payload = command.payload ?: return
                val cameraDisabled = (payload["restrictions"] as? Map<*, *>)?.get("camera_disabled") as? Boolean ?: false
                dpm.setCameraDisabled(adminComponent, cameraDisabled)
            }
        }
    }
}
