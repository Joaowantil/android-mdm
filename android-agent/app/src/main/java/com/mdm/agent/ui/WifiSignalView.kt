package com.mdm.agent.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.TypedValue
import android.view.View

/**
 * Draws a phone-style Wi-Fi fan (a center dot plus three arcs). [level] 0..3 controls how many
 * arcs are highlighted; the rest are drawn dimmed. When [connected] is false everything is dimmed.
 */
class WifiSignalView(context: Context) : View(context) {

    var level: Int = 0
        set(value) {
            field = value.coerceIn(0, 3)
            invalidate()
        }

    var connected: Boolean = false
        set(value) {
            field = value
            invalidate()
        }

    private val size = dp(18f)

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeWidth = dp(2f).toFloat()
    }
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(size, size)
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height * 0.92f
        val active = Color.WHITE
        val dim = 0x66FFFFFF

        // Three arcs, smallest (innermost) maps to bar level 1.
        for (i in 1..3) {
            val radius = i * (width * 0.27f)
            paint.color = if (connected && level >= i) active else dim
            val rect = RectF(cx - radius, cy - radius, cx + radius, cy + radius)
            canvas.drawArc(rect, 225f, 90f, false, paint)
        }
        dotPaint.color = if (connected) active else dim
        canvas.drawCircle(cx, cy, dp(1.6f).toFloat(), dotPaint)
    }

    private fun dp(value: Float): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics
    ).toInt()
}
