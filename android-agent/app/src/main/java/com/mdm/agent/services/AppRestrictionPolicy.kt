package com.mdm.agent.services

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import com.mdm.agent.receivers.MDMDeviceAdminReceiver

/**
 * Enforces "app_allowlist" / "app_blocklist" policies using Device Owner package
 * suspension (setPackagesSuspended). A suspended app can't be opened - the system shows
 * its own "app isn't available" screen - and the data stays intact (no uninstall/hide).
 *
 * Allowlist: only installed packages that have a LAUNCHER activity - i.e. something with
 * an icon a person could actually tap - get suspended when not in the list. Background
 * services, content providers, and other invisible components are left alone entirely;
 * they were never something the person could "open" in the first place, so blocking them
 * doesn't belong in an app allowlist and previously caused things like the status bar,
 * IME, or other invisible-but-essential components to break when a first version of this
 * suspended literally every installed package.
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
            "app_allowlist" -> launchablePackages(context)
                .filterNot { it in list }
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

    /**
     * Packages that have at least one activity with CATEGORY_LAUNCHER - i.e. apps that show
     * up with an icon somewhere the person could tap to open them (app drawer, home screen,
     * kiosk grid). This is what "allowlist" should mean: only visible, openable apps are
     * candidates for suspension, never background services, providers, or other invisible
     * system components. A small explicit safety net is still excluded on top of that, as a
     * second line of defense beyond what setPackagesSuspended() itself already refuses to
     * touch (active launcher, current IME, the device owner).
     */
    private fun launchablePackages(context: Context): List<String> {
        val neverSuspend = mutableSetOf(
            context.packageName,
            "android",
            "com.android.systemui",
            "com.android.settings",
            "com.google.android.packageinstaller",
            "com.android.permissioncontroller",
        )
        defaultLauncherPackage(context)?.let { neverSuspend.add(it) }

        val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return context.packageManager
            .queryIntentActivities(launcherIntent, PackageManager.MATCH_DEFAULT_ONLY)
            .map { it.activityInfo.packageName }
            .distinct()
            .filterNot { it in neverSuspend }
    }

    private fun defaultLauncherPackage(context: Context): String? {
        val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        return context.packageManager
            .resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY)
            ?.activityInfo
            ?.packageName
    }
}
