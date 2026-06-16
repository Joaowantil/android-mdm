package com.mdm.agent.ui

import android.content.Context
import android.os.Bundle
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

        val statusText = findViewById<TextView>(R.id.mainStatusText)
        statusText.text = "MDM Agent Ativo\n\nDevice ID: $deviceId\n\nO agente está rodando em background e reportando ao servidor MDM."

        // Fast command polling + periodic background fallback
        HeartbeatService.start(this)
        HeartbeatWorker.schedule(this)
    }
}
