package dev.ciban.ime

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Build
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

class MainActivity : Activity() {
    lateinit var editor: EditText
        private set
    lateinit var keyboard: KeyboardView
        private set
    private lateinit var gateway: EngineGateway
    private lateinit var palette: Palette
    private lateinit var enableButton: Button
    private var english = false
    private var systemTest = false
    private var practiceComposing = false
    private var loading = true
    private var readyState = JSONObject()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        palette = Palette(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(palette.canvas)
            setOnApplyWindowInsetsListener { view, insets ->
                if (Build.VERSION.SDK_INT >= 30) {
                    val bars = insets.getInsets(WindowInsets.Type.systemBars())
                    val ime = insets.getInsets(WindowInsets.Type.ime())
                    view.setPadding(bars.left, bars.top, bars.right, if (systemTest) maxOf(bars.bottom, ime.bottom) else bars.bottom)
                    if (systemTest && ime.bottom > 0 && ::editor.isInitialized) editor.post {
                        editor.requestRectangleOnScreen(android.graphics.Rect(0, 0, editor.width, editor.height), true)
                    }
                } else {
                    @Suppress("DEPRECATION")
                    view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                        insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
                }
                insets
            }
        }
        val scroll = ScrollView(this).apply { isFillViewport = true; isVerticalScrollBarEnabled = false }
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(20), dp(22), dp(12)) }
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val badge = TextView(this).apply {
            text = palette.code; style(palette.accent, 16f, true); gravity = Gravity.CENTER
            background = shape(palette.tint, dp(16).toFloat())
        }
        header.addView(badge, LinearLayout.LayoutParams(dp(48), dp(48)))
        val brand = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12), 0, 0, 0) }
        brand.addView(label("词伴 · ${palette.language}", 23f, true))
        brand.addView(label("输入，也是一点积累", 12f, muted = true))
        header.addView(brand)
        content.addView(header)
        content.addView(label("让每次打字，\n多遇见一个词。", 27f, true).apply { setPadding(0, dp(24), 0, dp(9)) })
        content.addView(label("中文照常输入，${palette.language}释义就在候选旁。\n离线可用，点击候选仍然输入中文。", 14f, muted = true).apply { setLineSpacing(dp(3).toFloat(), 1f) })
        val setup = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(15), dp(13), dp(15), dp(13)); background = shape(palette.surface, dp(18).toFloat()) }
        setup.addView(label("带到你常用的应用里", 15f, true))
        setup.addView(label("1 启用词伴    2 选择键盘    3 开始输入", 12f, muted = true).apply { setPadding(0, dp(6), 0, dp(11)) })
        val steps = LinearLayout(this)
        enableButton = button("1  启用键盘", true) { startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)) }
        steps.addView(enableButton, LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginEnd = dp(8) })
        steps.addView(button("2  选择键盘") {
            val manager = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            if (manager.enabledInputMethodList.none { it.packageName == packageName }) {
                Toast.makeText(this, "请先在系统列表中启用词伴 · ${palette.language}", Toast.LENGTH_LONG).show()
                startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
            } else manager.showInputMethodPicker()
        }, LinearLayout.LayoutParams(0, dp(46), 1f))
        setup.addView(steps)
        content.addView(setup, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(20); bottomMargin = dp(17) })
        val testHeading = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        testHeading.addView(label("先在这里试打", 17f, true), LinearLayout.LayoutParams(0, -2, 1f))
        testHeading.addView(button("系统键盘测试") { toggleSystemTest() }, LinearLayout.LayoutParams(dp(128), dp(40)))
        content.addView(testHeading)
        content.addView(label("试试 nihao、xuexi、pengyou、kafei", 12f, muted = true).apply { setPadding(0, dp(5), 0, dp(9)) })
        editor = EditText(this).apply {
            id = EDITOR_ID
            hint = "从一句“你好”开始…"
            style(palette.text, 18f)
            setHintTextColor(palette.muted)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            showSoftInputOnFocus = false
            minLines = 2; gravity = Gravity.TOP
            setPadding(dp(14), dp(13), dp(14), dp(13))
            background = shape(palette.surface, dp(14).toFloat(), palette.border)
        }
        content.addView(editor, LinearLayout.LayoutParams(-1, dp(93)))
        val settings = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(6), 0, 0) }
        val theme = button("外观") {
            val choices = arrayOf("跟随系统", "浅色", "深色")
            android.app.AlertDialog.Builder(this).setTitle("键盘外观").setItems(choices) { _, index ->
                getSharedPreferences("settings", 0).edit().putString("theme", arrayOf("auto", "light", "dark")[index]).apply()
                recreate()
            }.show()
        }
        settings.addView(theme, LinearLayout.LayoutParams(0, dp(42), 1f))
        val haptic = Switch(this).apply {
            text = "按键震动"; style(palette.muted, 12f)
            isChecked = getSharedPreferences("settings", 0).getBoolean("haptic", true)
            setOnCheckedChangeListener { _, enabled -> getSharedPreferences("settings", 0).edit().putBoolean("haptic", enabled).apply() }
        }
        settings.addView(haptic, LinearLayout.LayoutParams(0, dp(42), 1f))
        settings.addView(button("关于") { showAbout() }, LinearLayout.LayoutParams(dp(62), dp(42)))
        content.addView(settings)
        val heightValues = arrayOf("compact", "comfortable", "large")
        val heightNames = arrayOf("紧凑", "舒适", "加大")
        val selectedHeight = heightValues.indexOf(getSharedPreferences("settings", 0).getString("t9-height", "comfortable")).coerceAtLeast(0)
        content.addView(button("九宫格高度 · ${heightNames[selectedHeight]}") {
            android.app.AlertDialog.Builder(this).setTitle("九宫格高度")
                .setSingleChoiceItems(heightNames, selectedHeight) { dialog, index ->
                    getSharedPreferences("settings", 0).edit().putString("t9-height", heightValues[index]).apply()
                    dialog.dismiss(); recreate()
                }.setNegativeButton("取消", null).show()
        }, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(4); bottomMargin = dp(6) })
        content.addView(label("长按候选看词性、原形与用法。学习整理内容尚未独立语言校审。", 11f, muted = true))
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        keyboard = KeyboardView(this) { op, text, index, revision -> handleKey(op, text, index, revision) }
        root.addView(keyboard, LinearLayout.LayoutParams(-1, -2))
        setContentView(root)
        editor.requestFocus()
        root.post {
            if (Build.VERSION.SDK_INT >= 30) {
                val flags = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                root.windowInsetsController?.setSystemBarsAppearance(if (palette.dark) 0 else flags, flags)
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = if (palette.dark) 0 else View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            if (!systemTest) (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(editor.windowToken, 0)
            val manager = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            if (manager.enabledInputMethodList.any { it.packageName == packageName }) {
                editor.requestRectangleOnScreen(android.graphics.Rect(0, 0, editor.width, editor.height), true)
            } else {
                setup.requestRectangleOnScreen(android.graphics.Rect(0, 0, setup.width, setup.height), true)
            }
        }
        gateway = EngineGateway(this) { state ->
            loading = false; readyState = state
            if (!systemTest) applyPracticeState(state)
            keyboard.render(state)
        }
        gateway.send("reset", privateInput = true)
        if (BuildConfig.DEBUG && intent.getBooleanExtra("ciban-perf", false)) {
            KeyboardBenchmark(this).start()
        }
    }

    internal fun benchmarkReset() { gateway.send("reset", privateInput = true) }

    override fun onResume() {
        super.onResume()
        if (::enableButton.isInitialized) {
            val manager = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            val enabled = manager.enabledInputMethodList.any { it.packageName == packageName }
            enableButton.text = if (enabled) "✓  已启用" else "1  启用键盘"
            if (::gateway.isInitialized) gateway.send("layout", getSharedPreferences("settings", 0).getString("layout", "qwerty") ?: "qwerty")
            if (!systemTest) editor.post { manager.hideSoftInputFromWindow(editor.windowToken, 0) }
        }
    }

    private fun handleKey(op: String, text: String, index: Int, revision: Long) {
        when (op) {
            "switch" -> Toast.makeText(this, "试打页使用内置键盘；点“系统键盘测试”可切换输入法", Toast.LENGTH_SHORT).show()
            "choose" -> gateway.send("choose", index = index, revision = revision)
            "syllable" -> gateway.send("syllable", text, revision = revision)
            "mode" -> { english = text == "en"; gateway.send("mode", english = english) }
            "literal" -> gateway.send("raw", after = text)
            "enter" -> gateway.send("raw", after = "\n")
            else -> gateway.send(op, text)
        }
    }

    private fun applyPracticeState(state: JSONObject) {
        if (state.has("error")) return
        if (!practiceComposing && state.optString("commit").isEmpty() && !state.optBoolean("delete") &&
            state.optString("after").isEmpty() && state.optString("raw").isEmpty()) return
        val connection = editor.onCreateInputConnection(EditorInfo()) ?: return
        connection.beginBatchEdit()
        val commit = state.optString("commit")
        if (commit.isNotEmpty()) connection.commitText(commit, 1)
        if (state.optBoolean("delete")) connection.deleteSurroundingTextInCodePoints(1, 0)
        val after = state.optString("after")
        if (after.isNotEmpty()) connection.commitText(after, 1)
        val raw = state.optString("raw")
        if (raw.isNotEmpty()) connection.setComposingText(raw, 1)
        else { if (practiceComposing && commit.isEmpty() && after.isEmpty()) connection.setComposingText("", 1); connection.finishComposingText() }
        practiceComposing = raw.isNotEmpty()
        connection.endBatchEdit()
    }

    private fun toggleSystemTest() {
        systemTest = !systemTest
        gateway.send("reset", privateInput = true, english = english)
        editor.onCreateInputConnection(EditorInfo())?.finishComposingText()
        practiceComposing = false
        keyboard.visibility = if (systemTest) View.GONE else View.VISIBLE
        keyboard.rootView.requestApplyInsets()
        editor.showSoftInputOnFocus = systemTest
        editor.requestFocus()
        val manager = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        if (systemTest) manager.showSoftInput(editor, InputMethodManager.SHOW_IMPLICIT)
        else manager.hideSoftInputFromWindow(editor.windowToken, 0)
    }

    private fun showAbout() {
        val text = assets.open("NOTICE.txt").bufferedReader().use { it.readText() }
        android.app.AlertDialog.Builder(this).setTitle("词伴 ${BuildConfig.VERSION_NAME} · ${palette.language}")
            .setMessage(text).setPositiveButton("知道了", null).show()
    }

    private fun label(value: String, size: Float, bold: Boolean = false, muted: Boolean = false) = TextView(this).apply {
        text = value; style(if (muted) palette.muted else palette.text, size, bold)
    }
    private fun button(value: String, primary: Boolean = false, click: () -> Unit) = Button(this).apply {
        text = value; isAllCaps = false; textSize = 13f
        setTextColor(if (primary) palette.surface else palette.accent)
        setPadding(dp(5), 0, dp(5), 0); minWidth = 0; minimumWidth = 0
        stateListAnimator = null
        background = shape(if (primary) palette.accent else palette.tint, dp(11).toFloat())
        setOnClickListener { click() }
    }

    override fun onDestroy() { if (::gateway.isInitialized) gateway.close(); super.onDestroy() }
    companion object { const val EDITOR_ID = 0xC1BA }
}
