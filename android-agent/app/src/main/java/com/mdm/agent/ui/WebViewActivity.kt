package com.mdm.agent.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.mdm.agent.R

/**
 * Full-screen embedded browser for a kiosk web link. There is no address bar, so the user
 * stays inside the configured web system. It runs inside the kiosk lock task because it
 * belongs to the (allowlisted) agent package, and the Home button still returns to the kiosk.
 * Cookies/DOM storage persist, so site logins survive across visits.
 */
class WebViewActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
    }

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_webview)

        title = intent.getStringExtra(EXTRA_TITLE) ?: getString(R.string.app_name)
        val url = intent.getStringExtra(EXTRA_URL)

        webView = findViewById(R.id.webView)
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

        if (url.isNullOrBlank()) {
            finish()
            return
        }
        webView.loadUrl(url)
    }

    @Deprecated("Navigate within the embedded site instead of leaving it")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        }
        // Otherwise stay on the site; the Home button returns to the kiosk.
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }
}
