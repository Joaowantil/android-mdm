package com.mdm.agent.services

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.mdm.agent.receivers.MDMDeviceAdminReceiver

/**
 * Encapsulates the Device Owner policy needed for a real kiosk:
 *  - allowlist the kiosk apps so they can run inside lock task,
 *  - make [KioskActivity] the HOME launcher so the Home button returns to the kiosk,
 *  - enable lock-task features (Home/Global actions/Keyguard).
 *
 * When the app is only Device Admin (not Owner) these calls are skipped; kiosk then runs
 * as best-effort screen pinning.
 */
object KioskPolicy {
    private const val TAG = "KioskPolicy"
    private const val HOME_ALIAS = "com.mdm.agent.ui.KioskHomeAlias"

    private fun homeAlias(context: Context) = ComponentName(context.packageName, HOME_ALIAS)

    private fun setHomeAliasEnabled(context: Context, enabled: Boolean) {
        val state = if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        context.packageManager.setComponentEnabledSetting(
            homeAlias(context),
            state,
            PackageManager.DONT_KILL_APP
        )
    }

    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    fun enable(context: Context, apps: List<String>) {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (!dpm.isDeviceOwnerApp(context.packageName)) {
            Log.w(TAG, "Not device owner: kiosk runs in best-effort screen pinning mode")
            return
        }
        val admin = ComponentName(context, MDMDeviceAdminReceiver::class.java)

        // Allowlist our own package plus the kiosk apps so they stay in lock task.
        val packages = (listOf(context.packageName) + apps).distinct().toTypedArray()
        try {
            dpm.setLockTaskPackages(admin, packages)
        } catch (e: Exception) {
            Log.e(TAG, "setLockTaskPackages failed", e)
        }

        // Make the kiosk launcher the Home activity so Home returns to it.
        try {
            setHomeAliasEnabled(context, true)
            val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(admin, filter, homeAlias(context))
        } catch (e: Exception) {
            Log.e(TAG, "addPersistentPreferredActivity failed", e)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                dpm.setLockTaskFeatures(
                    admin,
                    DevicePolicyManager.LOCK_TASK_FEATURE_HOME or
                        DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS or
                        DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD or
                        DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
                )
            } catch (e: Exception) {
                Log.e(TAG, "setLockTaskFeatures failed", e)
            }
        }
    }

    fun disable(context: Context) {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (!dpm.isDeviceOwnerApp(context.packageName)) return
        val admin = ComponentName(context, MDMDeviceAdminReceiver::class.java)
        try {
            dpm.clearPackagePersistentPreferredActivities(admin, context.packageName)
        } catch (e: Exception) {
            Log.e(TAG, "clearPackagePersistentPreferredActivities failed", e)
        }
        // Disable the HOME alias so the real launcher takes over again.
        try {
            setHomeAliasEnabled(context, false)
        } catch (e: Exception) {
            Log.e(TAG, "setHomeAliasEnabled(false) failed", e)
        }
        try {
            dpm.setLockTaskPackages(admin, emptyArray())
        } catch (e: Exception) {
            Log.e(TAG, "clear setLockTaskPackages failed", e)
        }
    }
}
