package com.mdm.agent.ui

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.mdm.agent.R

/**
 * Kiosk launcher. When kiosk mode is enabled the device is pinned to this activity, which
 * only exposes the allowlisted apps. Exiting requires kiosk mode to be disabled from the
 * dashboard (which broadcasts [ACTION_EXIT_KIOSK]).
 */
class KioskActivity : AppCompatActivity() {

    companion object {
        const val ACTION_EXIT_KIOSK = "com.mdm.agent.EXIT_KIOSK"
        const val EXTRA_APPS = "apps"
    }

    private val exitReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            stopLockTaskSafely()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk)

        ContextCompat.registerReceiver(
            this,
            exitReceiver,
            IntentFilter(ACTION_EXIT_KIOSK),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        renderApps()
        startLockTaskSafely()
    }

    override fun onResume() {
        super.onResume()
        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("kiosk_enabled", false)) {
            stopLockTaskSafely()
            finish()
        }
    }

    private fun renderApps() {
        val container = findViewById<LinearLayout>(R.id.kioskAppsContainer)
        container.removeAllViews()

        val apps = intent.getStringArrayListExtra(EXTRA_APPS)
            ?: getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
                .getString("kiosk_apps", "")
                ?.split(",")
                ?.map { it.trim() }
                ?.filter { it.isNotEmpty() }
            ?: emptyList()

        val pm = packageManager
        if (apps.isEmpty()) {
            val empty = TextView(this).apply {
                text = "Nenhum app permitido configurado"
                setTextColor(0xFFB0BEC5.toInt())
            }
            container.addView(empty)
            return
        }

        apps.forEach { pkg ->
            val label = try {
                pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (e: Exception) {
                pkg
            }
            val button = Button(this).apply {
                text = label
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
                setOnClickListener { launchApp(pkg) }
            }
            container.addView(button)
        }
    }

    private fun launchApp(pkg: String) {
        val launch = packageManager.getLaunchIntentForPackage(pkg)
        if (launch != null) {
            startActivity(launch)
        } else {
            Toast.makeText(this, "App não encontrado: $pkg", Toast.LENGTH_SHORT).show()
        }
    }

    private fun startLockTaskSafely() {
        try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask()
            }
        } catch (_: Exception) {
        }
    }

    private fun stopLockTaskSafely() {
        try {
            stopLockTask()
        } catch (_: Exception) {
        }
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(exitReceiver)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    @Deprecated("Blocked on purpose while in kiosk mode")
    override fun onBackPressed() {
        // Do nothing: cannot leave kiosk with the back button.
    }
}
