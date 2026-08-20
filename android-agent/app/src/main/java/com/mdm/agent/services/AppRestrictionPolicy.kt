package com.mdm.agent.services

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.util.Log
import com.mdm.agent.receivers.MDMDeviceAdminReceiver

/**
 * Enforces "app_allowlist" / "app_blocklist" policies using Device Owner package
 * suspension (setPackagesSuspended). A suspended app can't be opened - the system shows
 * its own "app isn't available" screen - and the data stays intact (no uninstall/hide).
 *
 * Allowlist: every installed user (non-system) app that is NOT in the list gets suspended.
 * Blocklist: only the packages present in the list get suspended.
 *
 * State is persisted in SharedPreferences so it survives reboots (see BootReceiver) and
 * so newly installed apps get evaluated immediately (see PackageChangeReceiver), instead
 * of waiting for the next apply_policy command from the server.
 */
object AppRestrictionPolicy {
    private const val TAG = "AppRestrictionPolicy"
    private const val PREFS = "mdm_prefs"
    private const val KEY_MODE = "app_policy_mode"           // "app_allowlist" | "app_blocklist" | ""
    private const val KEY_LIST = "app_policy_list"            // comma-separated packages
    private const val KEY_SUSPENDED = "app_policy_suspended"  // comma-separated packages we suspended

    private fun dpm(context: Context) =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private fun admin(context: Context) =
        ComponentName(context, MDMDeviceAdminReceiver::class.java)

    fun isDeviceOwner(context: Context): Boolean =
        dpm(context).isDeviceOwnerApp(context.packageName)

    /** Applies (and persists) an allowlist/blocklist. Called from a fresh apply_policy command. */
    fun apply(context: Context, mode: String, packages: List<String>) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_MODE, mode)
            .putString(KEY_LIST, packages.joinToString(","))
            .apply()
        enforce(context)
    }

    /** Clears any active allowlist/blocklist, releasing every package we had suspended. */
    fun clear(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_MODE, "").putString(KEY_LIST, "").apply()
        enforce(context)
    }

    /**
     * Re-applies whatever policy was last saved, without needing a new command. Used on
     * boot (state must survive a reboot) and when a new app is installed (a freshly
     * sideloaded app must be evaluated right away, not just at the next heartbeat).
     */
    fun reapplyFromPrefs(context: Context) {
        enforce(context)
    }

    private fun enforce(context: Context) {
        if (!isDeviceOwner(context)) {
            Log.w(TAG, "Not device owner: cannot suspend packages, skipping enforcement")
            return
        }
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val mode = prefs.getString(KEY_MODE, "") ?: ""
        val list = (prefs.getString(KEY_LIST, "") ?: "")
            .split(",")
            .filter { it.isNotBlank() }
            .toSet()
        val previouslySuspended = (prefs.getString(KEY_SUSPENDED, "") ?: "")
            .split(",")
            .filter { it.isNotBlank() }
            .toSet()

        val target: Set<String> = when (mode) {
            "app_allowlist" -> installedUserPackages(context)
                .filterNot { it == context.packageName || it in list }
                .toSet()
            "app_blocklist" -> list.filter { isInstalled(context, it) }.toSet()
            else -> emptySet()
        }

        // Release anything we suspended before that no longer belongs in the target set
        // (policy changed, mode switched, or the policy was cleared/unassigned).
        val toRelease = previouslySuspended - target
        if (toRelease.isNotEmpty()) {
            suspend(context, toRelease.toTypedArray(), false)
        }
        if (target.isNotEmpty()) {
            suspend(context, target.toTypedArray(), true)
        }

        prefs.edit().putString(KEY_SUSPENDED, target.joinToString(",")).apply()
        Log.i(TAG, "Applied '$mode' policy: ${target.size} package(s) suspended, ${toRelease.size} released")
    }

    private fun suspend(context: Context, packages: Array<String>, suspended: Boolean) {
        if (packages.isEmpty()) return
        try {
            // Returns the subset of packages the system refused to touch (e.g. the active
            // launcher, a permission controller, other packages Android protects). We log
            // that but don't fail the whole command over it.
            val failed = dpm(context).setPackagesSuspended(admin(context), packages, suspended)
            if (failed.isNotEmpty()) {
                Log.w(
                    TAG,
                    "System refused to ${if (suspended) "suspend" else "unsuspend"}: ${failed.joinToString()}"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "setPackagesSuspended failed", e)
        }
    }

    private fun isInstalled(context: Context, packageName: String): Boolean =
        try {
            context.packageManager.getApplicationInfo(packageName, 0)
            true
        } catch (e: Exception) {
            false
        }

    /** Non-system installed packages - i.e. apps a person could actually open. */
    private fun installedUserPackages(context: Context): List<String> =
        context.packageManager.getInstalledApplications(0)
            .filter { it.flags and ApplicationInfo.FLAG_SYSTEM == 0 }
            .map { it.packageName }
}
