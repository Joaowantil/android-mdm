package com.mdm.agent.ui

import android.app.ActivityManager
import android.app.AlertDialog
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.net.ConnectivityManager
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.FrameLayout
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.math.abs
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.mdm.agent.R
import com.mdm.agent.services.FloatingHomeService
import com.mdm.agent.services.KioskPolicy
import org.json.JSONArray

/**
 * Kiosk launcher. When kiosk mode is enabled the device is pinned to this activity, which
 * only exposes the allowlisted apps.
 *
 * As Device Owner the allowlisted apps run inside the lock task and the Home button returns
 * here. Entering the kiosk PIN does NOT turn the kiosk off; it *pauses* it so an admin can
 * use the device normally and come back (via the "return to kiosk" notification or the
 * "Entrar no Modo Kiosk" button in the app). Disabling kiosk from the dashboard turns it off
 * completely (broadcasts [ACTION_EXIT_KIOSK]).
 */
class KioskActivity : AppCompatActivity() {

    companion object {
        const val ACTION_EXIT_KIOSK = "com.mdm.agent.EXIT_KIOSK"
        const val EXTRA_APPS = "apps"
        const val PREFS = "mdm_prefs"
        private const val CHANNEL_ID = "mdm_agent_control"
        private const val RESUME_NOTIFICATION_ID = 102

        /** Launches (or returns to) the kiosk. Used on enable and when an admin resumes it. */
        fun enter(context: Context) {
            val intent = Intent(context, KioskActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            context.startActivity(intent)
        }

        fun cancelResumeNotification(context: Context) {
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(RESUME_NOTIFICATION_ID)
        }
    }

    private val statusHandler = Handler(Looper.getMainLooper())
    private var wifiView: WifiSignalView? = null
    private val statusTick = object : Runnable {
        override fun run() {
            updateStatusStrip()
            statusHandler.postDelayed(this, 10_000)
        }
    }

    private val exitReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // Dashboard turned kiosk off entirely.
            getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("kiosk_enabled", false)
                .putBoolean("kiosk_paused", false)
                .apply()
            KioskPolicy.disable(this@KioskActivity)
            cancelResumeNotification(this@KioskActivity)
            FloatingHomeService.stop(this@KioskActivity)
            stopLockTaskSafely()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // On Android < 9 the system status bar is stripped (empty) inside lock task, so hide it
        // and draw our own strip with clock/wifi/battery instead.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
            )
        }
        setContentView(R.layout.activity_kiosk)
        styleBars()
        setupStatusStrip()

        ContextCompat.registerReceiver(
            this,
            exitReceiver,
            IntentFilter(ACTION_EXIT_KIOSK),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        // Entering this activity (re)arms the kiosk and re-applies the device-owner policy.
        val apps = resolveApps()
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("kiosk_enabled", true)
            .putBoolean("kiosk_paused", false)
            .apply()
        KioskPolicy.enable(this, apps)
        cancelResumeNotification(this)

        renderEntries(apps, resolveWebLinks())
        showAssetId()
        updateStatusStrip()
        findViewById<Button>(R.id.kioskExitButton).setOnClickListener { promptPinToExit() }
        startLockTaskSafely()
        // Floating "return to kiosk" button on top of launched apps (needs overlay permission).
        FloatingHomeService.start(this)
    }

    override fun onResume() {
        super.onResume()
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean("kiosk_enabled", false)) {
            FloatingHomeService.stop(this)
            stopLockTaskSafely()
            finish()
            return
        }
        // Re-assert lock task in case the user returned here from an allowlisted app.
        startLockTaskSafely()
        FloatingHomeService.start(this)
        statusHandler.removeCallbacks(statusTick)
        statusHandler.post(statusTick)
    }

    override fun onPause() {
        super.onPause()
        statusHandler.removeCallbacks(statusTick)
    }

    /** Gray, more-transparent kiosk header and exit button. */
    private fun styleBars() {
        // Use our own gray title bar in the layout instead of the blue action bar.
        supportActionBar?.hide()
        findViewById<Button>(R.id.kioskExitButton).apply {
            backgroundTintList = ColorStateList.valueOf(0x66555555.toInt())
            setTextColor(Color.WHITE)
        }
    }

    private fun setupStatusStrip() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return
        val strip = findViewById<LinearLayout>(R.id.kioskStatusStrip)
        strip.visibility = View.VISIBLE
        val container = findViewById<FrameLayout>(R.id.kioskWifiContainer)
        val view = WifiSignalView(this)
        wifiView = view
        container.addView(view)
    }

    private fun updateStatusStrip() {
        val strip = findViewById<LinearLayout>(R.id.kioskStatusStrip) ?: return
        if (strip.visibility != View.VISIBLE) return

        val now = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
            .format(java.util.Date())
        findViewById<TextView>(R.id.kioskClock).text = now

        val (connected, level) = wifiState()
        wifiView?.connected = connected
        wifiView?.level = level

        findViewById<TextView>(R.id.kioskBattery).text = "${batteryPercent()}%"
    }

    private fun wifiState(): Pair<Boolean, Int> {
        return try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            @Suppress("DEPRECATION")
            val activeWifi = cm.activeNetworkInfo?.type == ConnectivityManager.TYPE_WIFI &&
                cm.activeNetworkInfo?.isConnected == true
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            val rssi = wm.connectionInfo?.rssi ?: -127
            @Suppress("DEPRECATION")
            val bars = WifiManager.calculateSignalLevel(rssi, 4) // 0..3
            (activeWifi && wm.isWifiEnabled) to bars
        } catch (e: Exception) {
            false to 0
        }
    }

    private fun batteryPercent(): Int {
        return try {
            val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) {
            0
        }
    }

    private fun resolveApps(): List<String> =
        intent.getStringArrayListExtra(EXTRA_APPS)
            ?: getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString("kiosk_apps", "")
                ?.split(",")
                ?.map { it.trim() }
                ?.filter { it.isNotEmpty() }
            ?: emptyList()

    private fun resolveWebLinks(): List<Pair<String, String>> {
        val raw = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("kiosk_web_links", null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val obj = arr.optJSONObject(i) ?: return@mapNotNull null
                val url = obj.optString("url").trim()
                if (url.isEmpty()) return@mapNotNull null
                val label = obj.optString("label").ifBlank { url }
                label to url
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun renderEntries(apps: List<String>, webLinks: List<Pair<String, String>>) {
        val container = findViewById<LinearLayout>(R.id.kioskAppsContainer)
        container.removeAllViews()

        if (apps.isEmpty() && webLinks.isEmpty()) {
            val empty = TextView(this).apply {
                text = "Nenhum app ou site configurado"
                setTextColor(0xFFB0BEC5.toInt())
            }
            container.addView(empty)
            return
        }

        val columns = 4
        val grid = GridLayout(this).apply {
            columnCount = columns
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val pm = packageManager
        apps.forEach { pkg ->
            val label = try {
                pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (e: Exception) {
                pkg
            }
            val icon = try {
                pm.getApplicationIcon(pkg)
            } catch (e: Exception) {
                letterIcon(label)
            }
            grid.addView(makeIconItem(label, icon) { launchApp(pkg) })
        }

        webLinks.forEach { (label, url) ->
            grid.addView(makeIconItem(label, webLinkIcon(label)) { launchWebLink(label, url) })
        }

        container.addView(grid)
    }

    private fun dp(value: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics
    ).toInt()

    /** A single launcher-style cell: real icon on top, label underneath. */
    private fun makeIconItem(label: String, icon: Drawable, onClick: () -> Unit): View {
        val cell = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(8), dp(12), dp(8), dp(12))
            isClickable = true
            isFocusable = true
            layoutParams = GridLayout.LayoutParams().apply {
                width = 0
                columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1, 1f)
            }
            setOnClickListener { onClick() }
        }

        val image = ImageView(this).apply {
            setImageDrawable(icon)
            layoutParams = LinearLayout.LayoutParams(dp(56), dp(56))
        }
        cell.addView(image)

        val text = TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 12f
            gravity = Gravity.CENTER
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
            val lp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = dp(6)
            layoutParams = lp
        }
        cell.addView(text)
        return cell
    }

    /** Globe-style icon for a web link: colored rounded square with a "🌐"/initial. */
    private fun webLinkIcon(label: String): Drawable = letterIcon(label, web = true)

    private fun letterIcon(label: String, web: Boolean = false): Drawable {
        val size = dp(56)
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)

        val palette = intArrayOf(
            0xFF1976D2.toInt(), 0xFF388E3C.toInt(), 0xFFD32F2F.toInt(),
            0xFF7B1FA2.toInt(), 0xFFF57C00.toInt(), 0xFF00838F.toInt(),
        )
        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette[abs(label.hashCode()) % palette.size]
        }
        val radius = size * 0.22f
        canvas.drawRoundRect(0f, 0f, size.toFloat(), size.toFloat(), radius, radius, bg)

        val glyph = if (web) "\uD83C\uDF10" else label.trim().take(1).uppercase().ifBlank { "?" }
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
            textSize = if (web) size * 0.5f else size * 0.45f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val y = size / 2f - (textPaint.descent() + textPaint.ascent()) / 2f
        canvas.drawText(glyph, size / 2f, y, textPaint)
        return BitmapDrawable(resources, bmp)
    }

    private fun launchApp(pkg: String) {
        val launch = packageManager.getLaunchIntentForPackage(pkg)
        if (launch != null) {
            startActivity(launch)
        } else {
            Toast.makeText(this, "App não encontrado: $pkg", Toast.LENGTH_SHORT).show()
        }
    }

    private fun launchWebLink(label: String, url: String) {
        startActivity(
            Intent(this, WebViewActivity::class.java)
                .putExtra(WebViewActivity.EXTRA_URL, url)
                .putExtra(WebViewActivity.EXTRA_TITLE, label)
        )
    }

    private fun showAssetId() {
        val assetId = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("asset_id", null)
        val label = if (!assetId.isNullOrBlank()) "MDM Agent · $assetId" else "MDM Agent"
        title = label
        findViewById<TextView>(R.id.kioskTitle).text = label
    }

    private fun promptPinToExit() {
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val expected = prefs.getString("kiosk_pin", null)
            ?: prefs.getString("lock_pin", null)
        if (expected.isNullOrBlank()) {
            Toast.makeText(this, "Nenhum PIN configurado. Desative o kiosk pelo painel.", Toast.LENGTH_LONG).show()
            return
        }

        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "PIN"
        }
        AlertDialog.Builder(this)
            .setTitle("Sair do Kiosk")
            .setMessage("Digite o PIN para pausar o kiosk (modo administrador)")
            .setView(input)
            .setPositiveButton("Sair") { _, _ ->
                if (input.text.toString().trim() == expected) {
                    pauseKiosk()
                } else {
                    Toast.makeText(this, "PIN incorreto", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    /**
     * Temporarily leaves the kiosk for admin use. The kiosk stays armed (kiosk_enabled = true)
     * so the device returns to it after a reboot, and a notification lets the admin come back.
     */
    private fun pauseKiosk() {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("kiosk_paused", true)
            .apply()
        KioskPolicy.disable(this)
        FloatingHomeService.stop(this)
        stopLockTaskSafely()
        postResumeNotification()
        // Send the admin to the home launcher.
        startActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }

    private fun postResumeNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "MDM Controle", NotificationManager.IMPORTANCE_HIGH)
            )
        }
        val pending = PendingIntent.getActivity(
            this,
            RESUME_NOTIFICATION_ID,
            Intent(this, KioskActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Modo Kiosk pausado")
            .setContentText("Toque para voltar ao Modo Kiosk")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pending)
            .build()
        manager.notify(RESUME_NOTIFICATION_ID, notification)
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
        statusHandler.removeCallbacks(statusTick)
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
