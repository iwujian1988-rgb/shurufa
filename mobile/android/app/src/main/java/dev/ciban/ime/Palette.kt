package dev.ciban.ime

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.widget.TextView

class Palette(context: Context) {
    val french = BuildConfig.LEARNING_LANGUAGE == "fr"
    val language = if (french) "法语" else "英语"
    val code = if (french) "FR" else "EN"
    val dark = when (context.getSharedPreferences("settings", 0).getString("theme", "auto")) {
        "dark" -> true
        "light" -> false
        else -> context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    }
    val accent = Color.parseColor(if (french) { if (dark) "#79D7BA" else "#147B61" } else { if (dark) "#A3BCFF" else "#315DCC" })
    val canvas = Color.parseColor(if (dark) "#141923" else "#F3F5FA")
    val surface = Color.parseColor(if (dark) "#202735" else "#FFFFFF")
    val text = Color.parseColor(if (dark) "#EFF2F8" else "#182235")
    val muted = Color.parseColor(if (dark) "#A6B1C5" else "#65718A")
    val tint = Color.parseColor(if (dark) "#2C374D" else { if (french) "#E3F2EC" else "#E8EEFC" })
    val border = Color.parseColor(if (dark) "#354052" else "#DFE5EF")
}

fun Context.dp(value: Int) = (value * resources.displayMetrics.density + .5f).toInt()
fun shape(color: Int, radius: Float = 18f, border: Int? = null): GradientDrawable = GradientDrawable().apply {
    setColor(color); cornerRadius = radius
    if (border != null) setStroke(1, border)
}
fun TextView.style(color: Int, size: Float, bold: Boolean = false) {
    setTextColor(color); textSize = size
    typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
}
