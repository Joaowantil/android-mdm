package com.mdm.agent.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.mdm.agent.services.AppRestrictionPolicy

/**
 * Re-evaluates the active app allowlist/blocklist whenever a new app is installed, so a
 * freshly sideloaded app can't slip through until the next apply_policy command or reboot.
 * Only matters for "app_allowlist" (a new app is a stranger by default) - a "app_blocklist"
 * re-check is a no-op unless the new package happens to be on the blocked list.
 */
class PackageChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_PACKAGE_ADDED) return
        // EXTRA_REPLACING is true for app updates (same package reinstalled); nothing new
        // to evaluate in that case.
        if (intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return
        Log.d("PackageChangeReceiver", "New package installed, re-checking app policy")
        AppRestrictionPolicy.reapplyFromPrefs(context)
    }
}
