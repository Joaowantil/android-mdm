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
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Bundle
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

    private val exitReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // Dashboard turned kiosk off entirely.
            getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("kiosk_enabled", false)
                .putBoolean("kiosk_paused", false)
                .apply()
            KioskPolicy.disable(this@KioskActivity)
            cancelResumeNotification(this@KioskActivity)
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
        findViewById<Button>(R.id.kioskExitButton).setOnClickListener { promptPinToExit() }
        startLockTaskSafely()
    }

    override fun onResume() {
        super.onResume()
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean("kiosk_enabled", false)) {
            stopLockTaskSafely()
            finish()
            return
        }
        // Re-assert lock task in case the user returned here from an allowlisted app.
        startLockTaskSafely()
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
        val view = findViewById<TextView>(R.id.kioskAssetId)
        if (!assetId.isNullOrBlank()) {
            view.text = "ID: $assetId"
            view.visibility = android.view.View.VISIBLE
        } else {
            view.visibility = android.view.View.GONE
        }
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
