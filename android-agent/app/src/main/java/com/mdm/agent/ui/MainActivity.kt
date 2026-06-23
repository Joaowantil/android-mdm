package com.mdm.agent.ui

import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.mdm.agent.R
import com.mdm.agent.services.HeartbeatService
import com.mdm.agent.services.HeartbeatWorker

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
    }

    override fun onResume() {
        super.onResume()
        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        val kioskArmed = prefs.getBoolean("kiosk_enabled", false)
        findViewById<Button>(R.id.enterKioskButton).visibility =
            if (kioskArmed) android.view.View.VISIBLE else android.view.View.GONE
    }
}
