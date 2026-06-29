package com.mdm.agent.ui

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.UserManager
import android.util.Log
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.work.WorkManager
import com.mdm.agent.R
import com.mdm.agent.receivers.MDMDeviceAdminReceiver
import com.mdm.agent.services.HeartbeatService
import com.mdm.agent.services.HeartbeatWorker
import com.mdm.agent.services.KioskPolicy

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        val deviceId = prefs.getString("device_id", "N/A")
        val assetId = prefs.getString("asset_id", null)

        val statusText = findViewById<TextView>(R.id.mainStatusText)
        val idLine = if (assetId != null) "ID do Dispositivo: $assetId\n\n" else ""
        statusText.text = "MDM Agent Ativo\n\n${idLine}Device ID: $deviceId\n\nO agente está rodando em background e reportando ao servidor MDM."

        // Fast command polling + periodic background fallback
        HeartbeatService.start(this)
        HeartbeatWorker.schedule(this)

        // Allow an admin to re-enter the kiosk after pausing it with the PIN.
        val enterKioskButton = findViewById<Button>(R.id.enterKioskButton)
        enterKioskButton.setOnClickListener { KioskActivity.enter(this) }

        findViewById<Button>(R.id.removeMdmButton).setOnClickListener {
            confirmRemoveMdm()
        }
    }

    private fun confirmRemoveMdm() {
        AlertDialog.Builder(this)
            .setTitle("Remover MDM")
            .setMessage(
                "Isto vai desligar o kiosk, remover o MDM Agent como administrador/dono do " +
                    "dispositivo e abrir a tela de desinstalação. Continuar?"
            )
            .setPositiveButton("Remover") { _, _ -> removeMdm() }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun removeMdm() {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(this, MDMDeviceAdminReceiver::class.java)

        // 1) Leave kiosk / lock task so nothing blocks removal.
        try {
            KioskPolicy.disable(this)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to disable kiosk policy", e)
        }
        try {
            stopLockTask()
        } catch (e: Exception) {
            Log.w(TAG, "Not in lock task", e)
        }

        // 2) Stop background work.
        HeartbeatService.stop(this)
        WorkManager.getInstance(this).cancelUniqueWork(HeartbeatWorker.WORK_NAME)

        // 3) Drop any restrictions that could block uninstall, then release ownership.
        if (dpm.isDeviceOwnerApp(packageName)) {
            try {
                dpm.clearUserRestriction(admin, UserManager.DISALLOW_UNINSTALL_APPS)
                dpm.clearUserRestriction(admin, UserManager.DISALLOW_FACTORY_RESET)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to clear restrictions", e)
            }
            try {
                @Suppress("DEPRECATION")
                dpm.clearDeviceOwnerApp(packageName)
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
        getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE).edit().clear().apply()

        // 5) Launch the system uninstall flow.
        if (dpm.isDeviceOwnerApp(packageName) || dpm.isAdminActive(admin)) {
            Toast.makeText(
                this,
                "Não foi possível remover automaticamente. Use o adb: dpm remove-active-admin.",
                Toast.LENGTH_LONG
            ).show()
            return
        }
        Toast.makeText(this, "MDM removido. Confirme a desinstalação.", Toast.LENGTH_LONG).show()
        try {
            val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName"))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                intent.putExtra(Intent.EXTRA_RETURN_RESULT, true)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch uninstall", e)
        }
    }

    companion object {
        private const val TAG = "MainActivity"
    }

    override fun onResume() {
        super.onResume()
        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        val kioskArmed = prefs.getBoolean("kiosk_enabled", false)
        findViewById<Button>(R.id.enterKioskButton).visibility =
            if (kioskArmed) android.view.View.VISIBLE else android.view.View.GONE
    }
}
