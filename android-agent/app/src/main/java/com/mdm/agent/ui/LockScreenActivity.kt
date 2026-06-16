package com.mdm.agent.ui

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.mdm.agent.R

/**
 * Full-screen lock imposed by a remote "lock" command that carries a PIN. The screen can
 * only be dismissed by entering the correct PIN. Uses lock task (screen pinning) to keep
 * the user from leaving via Home/Recents.
 */
class LockScreenActivity : AppCompatActivity() {

    private lateinit var prefs: android.content.SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showWhenLockedAndTurnScreenOn()
        setContentView(R.layout.activity_lock_screen)

        prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)

        val pinInput = findViewById<EditText>(R.id.lockPinInput)
        val unlockButton = findViewById<Button>(R.id.unlockButton)
        val errorText = findViewById<TextView>(R.id.lockErrorText)

        unlockButton.setOnClickListener {
            val entered = pinInput.text.toString().trim()
            val expected = prefs.getString("lock_pin", null)
            if (expected != null && entered == expected) {
                clearLock()
                finish()
            } else {
                errorText.text = "PIN incorreto"
                pinInput.text.clear()
            }
        }

        startLockTaskSafely()
    }

    override fun onResume() {
        super.onResume()
        // If the lock was cleared remotely (e.g. via dashboard), allow exit.
        if (!prefs.getBoolean("locked", false)) {
            finish()
        }
    }

    @Suppress("DEPRECATION")
    private fun showWhenLockedAndTurnScreenOn() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
    }

    private fun startLockTaskSafely() {
        try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask()
            }
        } catch (_: Exception) {
            // Screen pinning may require user confirmation when not device owner; ignore.
        }
    }

    private fun clearLock() {
        prefs.edit().putBoolean("locked", false).remove("lock_pin").apply()
        try {
            stopLockTask()
        } catch (_: Exception) {
        }
    }

    @Deprecated("Blocked on purpose while locked")
    override fun onBackPressed() {
        // Do nothing: cannot leave the lock screen with the back button.
    }
}
