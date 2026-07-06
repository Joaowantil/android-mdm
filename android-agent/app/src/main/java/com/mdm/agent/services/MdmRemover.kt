package com.mdm.agent.services

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserManager
import android.util.Log
import androidx.work.WorkManager
import com.mdm.agent.receivers.MDMDeviceAdminReceiver
import com.mdm.agent.ui.KioskActivity

/**
 * Shared teardown used to unbind the MDM Agent from a device: leaves kiosk,
 * stops background work and releases Device Owner / device admin so the app can
 * be uninstalled and the device used normally again.
 *
 * Used both by the in-app "Remover MDM" button and by the remote `release`
 * command sent when a device is deleted from the dashboard.
 *
 * @return true if the app is no longer Device Owner nor active admin afterwards.
 */
object MdmRemover {
    private const val TAG = "MdmRemover"

    fun release(context: Context): Boolean {
        val app = context.applicationContext
        val dpm = app.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(app, MDMDeviceAdminReceiver::class.java)

        // 1) Leave kiosk / lock task so nothing blocks removal.
        try {
            KioskPolicy.disable(app)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to disable kiosk policy", e)
        }
        try {
            KioskActivity.cancelResumeNotification(app)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to cancel kiosk notification", e)
        }
        app.sendBroadcast(
            Intent(KioskActivity.ACTION_EXIT_KIOSK).setPackage(app.packageName)
        )

        // 2) Stop background work and the floating home button.
        try {
            FloatingHomeService.stop(app)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to stop floating home service", e)
        }
        HeartbeatService.stop(app)
        WorkManager.getInstance(app).cancelUniqueWork(HeartbeatWorker.WORK_NAME)

        // 3) Drop restrictions that could block uninstall, then release ownership.
        if (dpm.isDeviceOwnerApp(app.packageName)) {
            try {
                dpm.clearUserRestriction(admin, UserManager.DISALLOW_UNINSTALL_APPS)
                dpm.clearUserRestriction(admin, UserManager.DISALLOW_FACTORY_RESET)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to clear restrictions", e)
            }
            try {
                @Suppress("DEPRECATION")
                dpm.clearDeviceOwnerApp(app.packageName)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear device owner", e)
            }
        }
        if (dpm.isAdminActive(admin)) {
            try {
                dpm.removeActiveAdmin(admin)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to remove active admin", e)
            }
        }

        // 4) Forget enrollment locally.
        app.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE).edit().clear().apply()

        return !dpm.isDeviceOwnerApp(app.packageName) && !dpm.isAdminActive(admin)
    }
}
