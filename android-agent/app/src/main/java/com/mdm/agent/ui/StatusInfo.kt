package com.mdm.agent.ui

import android.content.Context
import android.net.ConnectivityManager
import android.net.wifi.WifiManager
import android.os.BatteryManager

/**
 * Shared helpers to read the current Wi-Fi signal and battery level. Used to draw the
 * custom status strip (clock/wifi/battery) inside the kiosk and the embedded browser on
 * Android < 9, where the system status bar is stripped inside lock task.
 */
object StatusInfo {

    /** @return connected flag and signal level (0..3). */
    fun wifiState(context: Context): Pair<Boolean, Int> {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            @Suppress("DEPRECATION")
            val activeWifi = cm.activeNetworkInfo?.type == ConnectivityManager.TYPE_WIFI &&
                cm.activeNetworkInfo?.isConnected == true
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            val rssi = wm.connectionInfo?.rssi ?: -127
            @Suppress("DEPRECATION")
            val bars = WifiManager.calculateSignalLevel(rssi, 4) // 0..3
            (activeWifi && wm.isWifiEnabled) to bars
        } catch (e: Exception) {
            false to 0
        }
    }

    fun batteryPercent(context: Context): Int {
        return try {
            val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) {
            0
        }
    }
}
