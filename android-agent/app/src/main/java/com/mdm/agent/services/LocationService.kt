package com.mdm.agent.services

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object LocationService {
    private const val TAG = "LocationService"

    fun requestLocationUpdate(context: Context) {
        if (ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "Location permission not granted")
            return
        }

        val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
        val cancellationToken = CancellationTokenSource()

        fusedLocationClient.getCurrentLocation(
            Priority.PRIORITY_HIGH_ACCURACY,
            cancellationToken.token
        ).addOnSuccessListener { location ->
            if (location != null) {
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val prefs = context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
                        val deviceId = prefs.getString("device_id", null) ?: return@launch

                        ApiClient.api.updateLocation(
                            LocationUpdate(
                                device_id = deviceId,
                                latitude = location.latitude,
                                longitude = location.longitude
                            )
                        )
                        Log.d(TAG, "Location updated: ${location.latitude}, ${location.longitude}")
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to send location", e)
                    }
                }
            }
        }
    }
}
