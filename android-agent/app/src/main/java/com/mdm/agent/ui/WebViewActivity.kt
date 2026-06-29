package com.mdm.agent.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.mdm.agent.R

/**
 * Full-screen embedded browser for a kiosk web link. A small top bar exposes "Voltar"
 * (navigate back within the site) and "Início" (return to the kiosk launcher) so the user
 * never depends on a hardware Home button, which rugged collectors may not have.
 *
 * Declared as singleTask: opening a different link reuses this activity and [onNewIntent]
 * loads the freshly requested URL instead of showing the previous site.
 * Cookies/DOM storage persist, so site logins survive across visits.
 */
class WebViewActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
    }

    private lateinit var webView: WebView
    private lateinit var titleView: TextView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_webview)

        webView = findViewById(R.id.webView)
        titleView = findViewById(R.id.webTitle)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // Keep navigation inside the WebView (no jumping out to other apps/browsers).
        webView.webViewClient = WebViewClient()

        findViewById<Button>(R.id.webBackButton).setOnClickListener {
            if (webView.canGoBack()) webView.goBack()
        }
        findViewById<Button>(R.id.webHomeButton).setOnClickListener { returnToKiosk() }

        loadFromIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        loadFromIntent(intent)
    }

    private fun loadFromIntent(intent: Intent) {
        val pageTitle = intent.getStringExtra(EXTRA_TITLE) ?: getString(R.string.app_name)
        title = pageTitle
        titleView.text = pageTitle
        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            finish()
            return
        }
        webView.loadUrl(url)
    }

    private fun returnToKiosk() {
        KioskActivity.enter(this)
        finish()
    }

    @Deprecated("Navigate within the embedded site instead of leaving it")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        }
        // Otherwise stay on the site; use the "Início" button to return to the kiosk.
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }
}
