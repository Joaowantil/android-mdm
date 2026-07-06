package com.mdm.agent.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.mdm.agent.R
import com.mdm.agent.services.FloatingHomeService
import com.mdm.agent.services.HeartbeatService
import com.mdm.agent.services.HeartbeatWorker
import com.mdm.agent.services.MdmRemover

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

        maybeRequestOverlayPermission()
    }

    /**
     * The floating "return to kiosk" button must draw over other apps. This permission can't
     * be granted silently (not even by a Device Owner), so prompt the admin to enable it once.
     */
    private fun maybeRequestOverlayPermission() {
        if (FloatingHomeService.canDrawOverlays(this)) return
        AlertDialog.Builder(this)
            .setTitle("Permitir botão de voltar ao kiosk")
            .setMessage(
                "Para mostrar o botão flutuante que volta ao kiosk por cima de outros apps, " +
                    "ative \"Permitir sobreposição a outros apps\" para o MDM Agent."
            )
            .setPositiveButton("Abrir") { _, _ ->
                try {
                    startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:$packageName")
                        )
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Cannot open overlay settings", e)
                }
            }
            .setNegativeButton("Agora não", null)
            .show()
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
        // Make sure we're not pinned before running the shared teardown.
        try {
            stopLockTask()
        } catch (e: Exception) {
            Log.w(TAG, "Not in lock task", e)
        }

        val released = MdmRemover.release(this)

        if (!released) {
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
