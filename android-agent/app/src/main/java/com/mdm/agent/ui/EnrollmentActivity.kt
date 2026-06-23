package com.mdm.agent.ui

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.mdm.agent.R
import com.mdm.agent.receivers.MDMDeviceAdminReceiver
import com.mdm.agent.services.ApiClient
import com.mdm.agent.services.EnrollRequest
import com.mdm.agent.services.HeartbeatService
import com.mdm.agent.services.HeartbeatWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

class EnrollmentActivity : AppCompatActivity() {

    private lateinit var tokenInput: EditText
    private lateinit var enrollButton: Button
    private lateinit var statusText: TextView

    companion object {
        private const val REQUEST_CODE_ENABLE_ADMIN = 1001
        private const val REQUEST_CODE_PERMISSIONS = 1002
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check if already enrolled
        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        if (prefs.getBoolean("enrolled", false)) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_enrollment)

        tokenInput = findViewById(R.id.tokenInput)
        enrollButton = findViewById(R.id.enrollButton)
        statusText = findViewById(R.id.statusText)

        enrollButton.setOnClickListener {
            val token = tokenInput.text.toString().trim()
            if (token.isEmpty()) {
                Toast.makeText(this, "Insira o token de enrollment", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            enrollDevice(token)
        }

        // Request device admin
        requestDeviceAdmin()

        // Request runtime permissions (location for "locate", notifications for the service)
        requestRuntimePermissions()
    }

    private fun requestRuntimePermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val toRequest = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (toRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this, toRequest.toTypedArray(), REQUEST_CODE_PERMISSIONS
            )
        }
    }

    private fun requestDeviceAdmin() {
        val componentName = ComponentName(this, MDMDeviceAdminReceiver::class.java)
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

        if (!dpm.isAdminActive(componentName)) {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName)
                putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "O MDM Agent precisa de permissão de administrador para gerenciar este dispositivo."
                )
            }
            startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN)
        }
    }

    private fun enrollDevice(token: String) {
        enrollButton.isEnabled = false
        statusText.text = "Registrando dispositivo..."

        val deviceId = UUID.randomUUID().toString()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = ApiClient.api.enroll(
                    EnrollRequest(
                        enrollment_token = token,
                        device_id = deviceId,
                        model = Build.MODEL,
                        manufacturer = Build.MANUFACTURER,
                        os_version = "Android ${Build.VERSION.RELEASE}",
                        serial_number = Build.SERIAL,
                        imei = null,
                        fcm_token = null
                    )
                )

                withContext(Dispatchers.Main) {
                    if (response.isSuccessful && response.body()?.success == true) {
                        // Save enrollment
                        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
                        prefs.edit()
                            .putBoolean("enrolled", true)
                            .putString("device_id", deviceId)
                            .putString("asset_id", response.body()?.asset_id)
                            .apply()

                        // Start fast command polling + periodic background fallback
                        HeartbeatService.start(this@EnrollmentActivity)
                        HeartbeatWorker.schedule(this@EnrollmentActivity)

                        statusText.text = "Dispositivo registrado com sucesso!"
                        Toast.makeText(
                            this@EnrollmentActivity,
                            "Enrollment concluído!",
                            Toast.LENGTH_LONG
                        ).show()

                        // Go to main
                        startActivity(Intent(this@EnrollmentActivity, MainActivity::class.java))
                        finish()
                    } else {
                        statusText.text = "Falha: ${response.body()?.message ?: "Erro desconhecido"}"
                        enrollButton.isEnabled = true
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    statusText.text = "Erro: ${e.message}"
                    enrollButton.isEnabled = true
                }
            }
        }
    }
}
