package com.mdm.agent.services

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen message popup pushed from the dashboard - "seu turno acaba em 10 minutos",
 * "leve o aparelho para carregar", um aviso de manutenção, etc.
 *
 * Built as a WindowManager overlay (not a normal Activity/Dialog) because a plain dialog is
 * not reliably shown on top of a locked-task kiosk app on every ROM - this is the exact same
 * technique already proven for the kiosk floating home button (see HomeButtonOverlay's doc
 * comment for the history behind that choice). Only one message shows at a time; a new one
 * replaces whatever is currently on screen.
 */
object MessagePopupOverlay {
    private const val TAG = "MessagePopupOverlay"
    private var windowManager: WindowManager? = null
    private var view: View? = null

    fun show(context: Context, title: String, message: String) {
        dismiss()

        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm

        val density = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(20), dp(24), dp(20))
            background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                setColor(0xFF2B2B2B.toInt())
            }
            // Swallow taps so tapping the card itself doesn't fall through to the scrim's
            // dismiss-on-tap-outside handler below.
            isClickable = true
        }
        card.addView(TextView(context).apply {
            text = title
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        })
        card.addView(TextView(context).apply {
            text = message
            setTextColor(Color.WHITE)
            textSize = 15f
            setPadding(0, dp(12), 0, dp(16))
        })
        card.addView(Button(context).apply {
            text = "OK"
            setOnClickListener { dismiss() }
        })

        val container = FrameLayout(context).apply {
            setBackgroundColor(0x99000000.toInt())
            isClickable = true
            setOnClickListener { dismiss() } // tap outside the card also dismisses
            addView(
                card,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.CENTER
                    marginStart = dp(32)
                    marginEnd = dp(32)
                }
            )
        }

        val windowType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            windowType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        )

        try {
            wm.addView(container, params)
            view = container
        } catch (e: Exception) {
            Log.w(TAG, "Could not show message popup: ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    fun dismiss() {
        val v = view ?: return
        try {
            windowManager?.removeView(v)
        } catch (_: Exception) {
        }
        view = null
    }
}
