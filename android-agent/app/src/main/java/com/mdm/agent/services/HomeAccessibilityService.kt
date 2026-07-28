package com.mdm.agent.services

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.provider.Settings
import android.util.Log
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent

/**
 * Draws the floating home button as an *accessibility* overlay.
 *
 * On some rugged collectors a regular app overlay is registered by the window manager but
 * never given a surface while a kiosk app is in the foreground, so the button simply never
 * shows up. [WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY] is drawn by the system on
 * behalf of an accessibility service, is not subject to the "draw over other apps" app-op and
 * is not suppressed in that situation.
 *
 * The service also knows which app is in the foreground, so the button is shown over any app
 * — including one opened by another app rather than from the kiosk grid — and hidden while
 * the kiosk itself is on screen.
 *
 * It has to be switched on once per device (it survives reboots, but not a reinstall):
 *
 * ```
 * adb shell settings put secure enabled_accessibility_services \
 *     com.mdm.agent/com.mdm.agent.services.HomeAccessibilityService
 * adb shell settings put secure accessibility_enabled 1
 * ```
 */
class HomeAccessibilityService : AccessibilityService() {

    private val overlay by lazy {
        HomeButtonOverlay(this, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, TAG)
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "accessibility home button service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return
        // Ignore transient system windows (status bar, IME, dialogs) so the button does not
        // flicker away while the user stays inside the same app.
        if (pkg == "android" || pkg.startsWith("com.android.systemui")) return
        if (pkg == packageName) {
            // Adding the button raises this event for our own package too; only our
            // activities mean the kiosk (or its browser) is actually back in front.
            val cls = event.className?.toString().orEmpty()
            if (!cls.startsWith("$packageName.ui.")) return
            hide(cls)
        } else {
            show(pkg)
        }
    }

    private fun show(foregroundPackage: String) {
        if (overlay.isAdded || !isKioskArmed()) return
        val added = overlay.add()
        Log.i(TAG, "showing home button over $foregroundPackage (added=$added)")
    }

    private fun hide(reason: String) {
        if (!overlay.isAdded) return
        overlay.remove()
        Log.i(TAG, "hiding home button ($reason is in front)")
    }

    private fun isKioskArmed(): Boolean {
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getBoolean("kiosk_enabled", false) && !prefs.getBoolean("kiosk_paused", false)
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        overlay.remove()
        return super.onUnbind(intent)
    }

    companion object {
        private const val TAG = "FloatingHome"
        private const val PREFS = "mdm_prefs"

        /**
         * Whether the user (or the provisioning script) switched this service on. When it is,
         * [FloatingHomeService] stands down so the two never draw two buttons.
         */
        fun isEnabled(context: Context): Boolean {
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: return false
            val component = "${context.packageName}/${HomeAccessibilityService::class.java.name}"
            return enabled.split(':').any { it.equals(component, ignoreCase = true) }
        }
    }
}
