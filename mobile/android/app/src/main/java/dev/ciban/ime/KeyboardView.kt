package dev.ciban.ime

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

class KeyboardView(context: Context, private val action: (String, String, Int, Long) -> Unit) : LinearLayout(context) {
    constructor(context: Context) : this(context, { _, _, _, _ -> })
    private val palette = Palette(context)
    private val landscape = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
    private val handler = Handler(Looper.getMainLooper())
    private val status = TextView(context)
    private val candidates = LinearLayout(context)
    private val candidatePool = mutableListOf<CandidateCard>()
    private val candidateHint = TextView(context)
    private var displayedCandidates = 0
    private var renderingCandidates = false
    private val candidateScroll = HorizontalScrollView(context)
    private val expandedScroll = ScrollView(context)
    private val expandedRows = LinearLayout(context)
    private val keys = LinearLayout(context)
    private val syllableScroll = HorizontalScrollView(context)
    private val syllableChoices = LinearLayout(context)
    private val layoutButton = TextView(context)
    private var nine = context.getSharedPreferences("settings", 0).getString("layout", "qwerty") == "t9"
    private var expanded = false
    private var english = false
    private var symbols = false
    private var shift = false
    private var disabled = true
    private var sensitive = false
    private var revision = 0L
    private var snapshot = JSONObject()
    internal val benchmarkRaw: String get() = snapshot.optString("raw")
    internal val benchmarkReady: Boolean get() = !disabled
    private var repeating = false
    private var showingDetails = false

    init {
        orientation = VERTICAL
        setBackgroundColor(palette.canvas)
        setPadding(context.dp(5), context.dp(if (landscape) 2 else 4), context.dp(5), context.dp(if (landscape) 4 else 7))
        val top = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        status.style(palette.muted, 12f)
        status.text = "正在加载离线词库…"
        status.setPadding(context.dp(10), 0, 0, 0)
        top.addView(status, LayoutParams(0, context.dp(30), 1f))
        layoutButton.apply {
            style(palette.accent, 12f, true); gravity = Gravity.CENTER
            setOnClickListener {
                if (!disabled && !sensitive) {
                    nine = !nine
                    val layout = if (nine) "t9" else "qwerty"
                    context.getSharedPreferences("settings", 0).edit().putString("layout", layout).apply()
                    action("layout", layout, -1, revision)
                    feedback(); drawKeys(); updateLayoutLabel()
                }
            }
        }
        top.addView(layoutButton, LayoutParams(context.dp(66), context.dp(if (landscape) 32 else 36)))
        updateLayoutLabel()
        val expand = TextView(context).apply {
            text = "展开"; style(palette.accent, 12f, true); gravity = Gravity.CENTER
            contentDescription = "展开或收起全部候选"
            setOnClickListener { showingDetails = false; expanded = !expanded; render(snapshot); updateExpansion() }
        }
        top.addView(expand, LayoutParams(context.dp(52), context.dp(if (landscape) 32 else 36)))
        addView(top)
        candidates.orientation = HORIZONTAL
        candidateHint.apply { style(palette.muted, 13f); gravity = Gravity.CENTER_VERTICAL; setPadding(context.dp(12), 0, context.dp(12), 0) }
        candidates.addView(candidateHint, LayoutParams(-1, -1))
        candidateScroll.apply { isHorizontalScrollBarEnabled = false; addView(candidates) }
        candidateScroll.setOnScrollChangeListener { _, x, _, _, _ ->
            if (!renderingCandidates && x > 0 && x + candidateScroll.width * 2 >= candidates.width) {
                val list = snapshot.optJSONArray("candidates")
                if (list != null && displayedCandidates < list.length()) {
                    val end = minOf(displayedCandidates + 8, list.length())
                    for (i in displayedCandidates until end) bindCandidate(list, i)
                    displayedCandidates = end
                }
            }
        }
        val annotations = LinearLayout(context).apply { orientation = if (landscape) HORIZONTAL else VERTICAL }
        annotations.addView(candidateScroll, if (landscape) LayoutParams(0, context.dp(56), 2f) else LayoutParams(-1, context.dp(74)))
        syllableScroll.apply { isHorizontalScrollBarEnabled = false; addView(syllableChoices) }
        annotations.addView(syllableScroll, if (landscape) LayoutParams(0, context.dp(56), 1f) else LayoutParams(-1, context.dp(48)))
        addView(annotations, LayoutParams(-1, -2))
        expandedRows.orientation = VERTICAL
        expandedScroll.addView(expandedRows)
        expandedScroll.visibility = GONE
        addView(expandedScroll, LayoutParams(-1, context.dp(220)))
        keys.orientation = VERTICAL
        addView(keys)
        drawKeys()
    }

    fun setMode(ascii: Boolean, password: Boolean = false, numeric: Boolean = false) {
        english = ascii; sensitive = password; symbols = numeric; expanded = false
        updateExpansion(); drawKeys()
    }

    fun render(state: JSONObject) {
        if (showingDetails) { showingDetails = false; expanded = false; updateExpansion() }
        if (state.has("error")) { status.text = state.getString("error"); disabled = true; return }
        disabled = false
        snapshot = state
        revision = state.optLong("revision")
        val stateNine = state.optString("layout", if (nine) "t9" else "qwerty") == "t9"
        if (stateNine != nine) { nine = stateNine; drawKeys() }
        updateLayoutLabel()
        renderSyllables(state)
        val raw = state.optString("marked")
        status.text = when {
            sensitive -> "私密输入 · 不记录"
            raw.isNotEmpty() -> raw
            english -> "字母输入 · 空格确认"
            else -> "中文拼音 · 长按候选看用法"
        }
        expandedRows.removeAllViews()
        val list = state.optJSONArray("candidates")
        if (list == null || list.length() == 0 || sensitive) {
            candidateHint.text = if (sensitive) "字母和数字直接输入" else if (raw.isEmpty()) "打中文，顺手遇见${palette.language}。" else "空格或回车可确认原文"
            candidateHint.visibility = VISIBLE
            candidatePool.forEach { it.visibility = GONE }
            displayedCandidates = 0
            return
        }
        candidateHint.visibility = GONE
        renderingCandidates = true
        displayedCandidates = minOf(8, list.length())
        for (i in 0 until displayedCandidates) bindCandidate(list, i)
        for (i in displayedCandidates until candidatePool.size) candidatePool[i].visibility = GONE
        // The full list is built only when actually expanded. Horizontal scrolling
        // mounts the next page before the viewport reaches the current page's end.
        if (expanded) for (i in 0 until list.length()) {
            expandedRows.addView(CandidateCard(true, i == 0).apply { bind(list.getJSONObject(i), revision) }, LayoutParams(-1, context.dp(58)).apply { bottomMargin = context.dp(3) })
        }
        candidateScroll.scrollTo(0, 0)
        renderingCandidates = false
    }

    private fun bindCandidate(list: org.json.JSONArray, i: Int) {
        val candidate = list.getJSONObject(i)
        val width = context.dp(if (candidate.optString("gloss").length > 14) 152 else 112)
        if (i == candidatePool.size) {
            val item = CandidateCard(false, i == 0)
            candidatePool.add(item)
            candidates.addView(item, LayoutParams(width, -1).apply { setMargins(context.dp(3), context.dp(if (landscape) 2 else 3), context.dp(3), context.dp(if (landscape) 2 else 5)) })
        }
        val item = candidatePool[i]
        item.bind(candidate, revision)
        item.visibility = VISIBLE
        if (item.layoutParams.width != width) item.layoutParams = (item.layoutParams as LayoutParams).apply { this.width = width }
    }

    private inner class CandidateCard(private val full: Boolean, first: Boolean) : LinearLayout(context) {
        private var candidate = JSONObject()
        private var capturedRevision = 0L
        private var pressedCandidate: JSONObject? = null
        private var pressedRevision = 0L
        private val word = TextView(context).apply { style(palette.text, if (landscape) 18f else 20f, first); maxLines = 1 }
        private val gloss = TextView(context).apply {
            style(palette.muted, if (full) 14f else 12f)
            maxLines = if (full) 2 else 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        init {
            orientation = if (full) HORIZONTAL else VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(12), context.dp(if (landscape) 2 else 6), context.dp(12), context.dp(if (landscape) 2 else 6))
            background = shape(if (first) palette.tint else palette.surface, context.dp(12).toFloat())
            isClickable = true; isFocusable = true
            // A pooled card can be rebound between touch-down and touch-up. Preserve
            // the touched identity so a refresh can never commit the replacement word.
            setOnTouchListener { _, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> { pressedCandidate = candidate; pressedRevision = capturedRevision }
                    MotionEvent.ACTION_CANCEL -> pressedCandidate = null
                }
                false
            }
            setOnLongClickListener {
                val touched = pressedCandidate ?: candidate
                val touchedRevision = if (pressedCandidate != null) pressedRevision else capturedRevision
                if (!disabled && touchedRevision == revision && touched.optJSONObject("detail") != null) {
                    pressedCandidate = null; feedback(); showDetails(touched, touchedRevision); true
                } else false
            }
            setOnClickListener {
                val touched = pressedCandidate ?: candidate
                val touchedRevision = if (pressedCandidate != null) pressedRevision else capturedRevision
                pressedCandidate = null
                if (!disabled) {
                    feedback(); expanded = false; updateExpansion()
                    action("choose", "", touched.optInt("index"), touchedRevision)
                }
            }
            if (full) { addView(word, LayoutParams(context.dp(105), -2)); addView(gloss, LayoutParams(0, -2, 1f)) }
            else { addView(word); addView(gloss) }
        }
        fun bind(value: JSONObject, stateRevision: Long) {
            candidate = value; capturedRevision = stateRevision
            word.text = value.optString("text")
            gloss.text = value.optString("gloss").ifEmpty { "暂无释义" }
            contentDescription = "${word.text}，${gloss.text}，点击输入中文${if (value.optJSONObject("detail") != null) "，长按查看用法" else ""}"
            isLongClickable = value.optJSONObject("detail") != null
        }
    }

    private fun showDetails(candidate: JSONObject, capturedRevision: Long) {
        val detail = candidate.optJSONObject("detail") ?: return
        showingDetails = true; expanded = true; updateExpansion()
        expandedRows.removeAllViews()
        val header = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        val back = TextView(context).apply {
            text = "‹ 返回键盘"; style(palette.accent, 14f, true); gravity = Gravity.CENTER_VERTICAL
            setPadding(context.dp(12), 0, context.dp(12), 0)
            contentDescription = "关闭词语用法，返回键盘"
            setOnClickListener { showingDetails = false; expanded = false; render(snapshot); updateExpansion() }
        }
        header.addView(back, LayoutParams(0, context.dp(44), 1f))
        val insert = TextView(context).apply {
            text = "输入中文"; style(palette.accent, 14f, true); gravity = Gravity.CENTER
            contentDescription = "输入${candidate.optString("text")}"
            setOnClickListener {
                if (!disabled && revision == capturedRevision) action("choose", "", candidate.optInt("index"), capturedRevision)
            }
        }
        header.addView(insert, LayoutParams(context.dp(90), context.dp(44)))
        expandedRows.addView(header)
        fun line(text: String, size: Float = 14f, bold: Boolean = false, muted: Boolean = false) {
            expandedRows.addView(TextView(context).apply {
                this.text = text; style(if (muted) palette.muted else palette.text, size, bold)
                setPadding(context.dp(14), context.dp(5), context.dp(14), context.dp(5))
                setLineSpacing(context.dp(2).toFloat(), 1f)
            }, LayoutParams(-1, -2))
        }
        line(candidate.optString("text") + "  ·  " + candidate.optString("pinyin"), 20f, true)
        val senses = detail.optJSONArray("senses")
        if (senses != null) for (i in 0 until senses.length()) {
            val sense = senses.getJSONObject(i)
            line("${i + 1}. ${sense.optString("text")}", 16f, true)
            val information = mutableListOf<String>()
            if (sense.optString("pos").isNotEmpty()) information.add(sense.getString("pos"))
            if (sense.optString("gender").isNotEmpty()) information.add(sense.getString("gender"))
            if (information.isNotEmpty()) line(information.joinToString(" · "), 12f, muted = true)
            if (sense.optString("lemma").isNotEmpty()) line("原形：${sense.getString("lemma")}", 13f)
        }
        if (detail.optString("countability").isNotEmpty()) line("可数性：${detail.getString("countability")}", 13f)
        if (detail.optString("forms").isNotEmpty()) line("词形：${detail.getString("forms")}", 13f)
        if (detail.optString("note").isNotEmpty()) line(detail.getString("note"), 13f)
        if (detail.optString("example").isNotEmpty()) line("例句：${detail.getString("example")}", 14f)
        line(detail.optString("source") + " · " + detail.optString("review"), 11f, muted = true)
        if (detail.optString("sourceUrl").isNotEmpty()) line(detail.optString("sourceUrl") + " · " + detail.optString("license"), 11f, muted = true)
        expandedScroll.scrollTo(0, 0)
    }

    private fun updateExpansion() {
        if (expanded) {
            // Preserve the typing footprint when opening a lesson or candidate list.
            val typingHeight = keys.measuredHeight.takeIf { it > 0 } ?: context.dp(if (nine) nineRowHeight() * 3 + 58 else 196)
            expandedScroll.layoutParams = LayoutParams(-1, typingHeight + if (!landscape && nine && !english && !symbols && !sensitive) context.dp(48) else 0)
        }
        expandedScroll.visibility = if (expanded) VISIBLE else GONE
        keys.visibility = if (expanded) GONE else VISIBLE
        syllableScroll.visibility = if (nine && !english && !symbols && !sensitive && !expanded) VISIBLE else GONE
    }

    private fun updateLayoutLabel() {
        layoutButton.text = if (nine) "九宫格" else "全键盘"
        layoutButton.contentDescription = "切换中文键盘布局，当前${layoutButton.text}"
    }

    private fun renderSyllables(state: JSONObject) {
        syllableChoices.removeAllViews()
        val locked = state.optString("locked")
        val hint = TextView(context).apply {
            text = if (locked.isEmpty()) "选拼音" else "$locked ✓"
            style(if (locked.isEmpty()) palette.muted else palette.accent, 12f)
            gravity = Gravity.CENTER; setPadding(context.dp(10), 0, context.dp(10), 0)
            if (locked.isNotEmpty()) { contentDescription = "取消已选拼音"; setOnClickListener { action("unlock", "", -1, revision) } }
        }
        syllableChoices.addView(hint, LayoutParams(-2, -1))
        val options = state.optJSONArray("syllables")
        val capturedRevision = revision
        if (options != null) for (i in 0 until options.length()) {
            val spelling = options.getString(i)
            val choice = TextView(context).apply {
                text = spelling; style(palette.text, 14f); gravity = Gravity.CENTER
                setPadding(context.dp(12), 0, context.dp(12), 0); minimumWidth = context.dp(48)
                contentDescription = "选拼音 $spelling"
                background = shape(palette.surface, context.dp(8).toFloat())
                setOnClickListener { if (!disabled) { feedback(); action("syllable", spelling, -1, capturedRevision) } }
            }
            syllableChoices.addView(choice, LayoutParams(-2, -1).apply { setMargins(context.dp(2), context.dp(2), context.dp(2), context.dp(2)) })
        }
        syllableScroll.scrollTo(0, 0)
        updateExpansion()
    }

    private fun drawKeys() {
        keys.removeAllViews()
        val usingNine = nine && !english && !symbols && !sensitive
        val nineHeight = nineRowHeight()
        if (usingNine) {
            val body = LinearLayout(context)
            val grid = LinearLayout(context).apply { orientation = VERTICAL }
            val letters = listOf("标点", "ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ")
            for (rowIndex in 0..2) {
                val row = LinearLayout(context)
                for (column in 0..2) {
                    val number = rowIndex * 3 + column + 1
                    val label = letters[number - 1]
                    addKey(row, label, 1f) {
                        if (number == 1) { symbols = true; drawKeys() }
                        else action("digit", number.toString(), -1, revision)
                    }.apply {
                        textSize = if (number == 1) 18f else 24f
                        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                        contentDescription = "九宫格 $number ${letters[number - 1]}"
                    }
                }
                grid.addView(row, LayoutParams(-1, context.dp(nineHeight)))
            }
            body.addView(grid, LayoutParams(0, -2, 1f))
            val rail = LinearLayout(context).apply { orientation = VERTICAL }
            val deleteRow = LinearLayout(context); addDelete(deleteRow)
            rail.addView(deleteRow, LayoutParams(-1, context.dp(nineHeight)))
            val splitRow = LinearLayout(context)
            addKey(splitRow, "分词", 1f, utility = true) {
                val options = snapshot.optJSONArray("syllables")
                val next = options?.optString(0).orEmpty()
                if (next.isNotEmpty()) action("syllable", next, -1, revision)
            }
            rail.addView(splitRow, LayoutParams(-1, context.dp(nineHeight)))
            val resetRow = LinearLayout(context)
            addKey(resetRow, "重选", 1f, utility = true) { action("unlock", "", -1, revision) }
            rail.addView(resetRow, LayoutParams(-1, context.dp(nineHeight)))
            body.addView(rail, LayoutParams(context.dp(64), -2))
            keys.addView(body)
        } else {
        val rows = if (symbols) listOf("1234567890", "@#￥%&*()-", ",。？！:;/'\"") else listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")
        for ((rowIndex, letters) in rows.withIndex()) {
            val row = LinearLayout(context).apply { gravity = Gravity.CENTER }
            if (rowIndex == 1 && !symbols) row.setPadding(context.dp(15), 0, context.dp(15), 0)
            if (rowIndex == 2 && !symbols) addKey(row, "⇧", 1.35f) { shift = !shift; drawKeys() }
            for (char in letters) {
                val letter = if (shift && !symbols) char.uppercaseChar().toString() else char.toString()
                addKey(row, letter, 1f) {
                    if (symbols || sensitive) action("literal", letter, -1, revision)
                    else action("input", letter, -1, revision)
                    if (shift && !symbols) { shift = false; drawKeys() }
                }
            }
            if (rowIndex == 2 && !symbols) addDelete(row)
            keys.addView(row, LayoutParams(-1, context.dp(49)))
        }
        if (symbols) {
            val row = LinearLayout(context)
            for (letter in if (palette.french) listOf("é", "è", "ê", "à", "ç", "ù", "œ") else listOf("[", "]", "{", "}", "+", "=", "_")) {
                addKey(row, letter, 1f) { action("literal", letter, -1, revision) }
            }
            addDelete(row)
            keys.addView(row, LayoutParams(-1, context.dp(45)))
        }
        }
        val bottom = LinearLayout(context)
        addKey(bottom, if (symbols) "ABC" else "123", 1.35f, utility = true) { symbols = !symbols; drawKeys() }
        addKey(bottom, "◎", .9f, utility = true) { action("switch", "", -1, revision) }
        addKey(bottom, if (english) "EN" else "中", 1f, utility = true) {
            if (!sensitive) { english = !english; action("mode", if (english) "en" else "zh", -1, revision); drawKeys() }
        }
        addKey(bottom, if (english) "space" else "空格", 3.5f) { action("space", "", -1, revision) }
        addKey(bottom, if (english) "." else "。", .9f) { action("literal", if (english) "." else "。", -1, revision) }
        addKey(bottom, "↵", 1.4f, utility = true, primary = true) { action("enter", "", -1, revision) }
        keys.addView(bottom, LayoutParams(-1, context.dp(if (usingNine) { if (landscape) 54 else 58 } else 49)))
        updateExpansion()
    }

    private fun addKey(row: LinearLayout, label: String, weight: Float, utility: Boolean = false, primary: Boolean = false, click: () -> Unit): Button {
        val button = (if (label == "⌫") DeleteButton(context) {
            if (!disabled) { feedback(); action("delete", "", -1, revision) }
        } else Button(context)).apply {
            text = label; isAllCaps = false
            textSize = if (label.contains('\n')) 15f else if (label.length > 1) 13f else 20f
            if (label.contains('\n')) {
                val split = label.indexOf('\n')
                text = android.text.SpannableString(label).apply {
                    setSpan(android.text.style.RelativeSizeSpan(1.4f), 0, split, 0)
                    setSpan(android.text.style.RelativeSizeSpan(.85f), split + 1, length, 0)
                }
            }
            typeface = Typeface.create("sans-serif", Typeface.NORMAL)
            setTextColor(if (primary) palette.surface else if (utility) palette.accent else palette.text)
            setPadding(0, 0, 0, 0); minWidth = 0; minimumWidth = 0; minHeight = 0; minimumHeight = 0
            stateListAnimator = null
            background = android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(palette.tint),
                shape(if (primary) palette.accent else if (utility) palette.tint else palette.surface, context.dp(8).toFloat()), null)
            contentDescription = when (label) { "◎" -> "切换系统输入法"; "↵" -> "回车"; "⇧" -> "切换大写"; else -> label }
            setOnClickListener { if (!disabled || label == "◎") { feedback(); click() } }
        }
        row.addView(button, LayoutParams(0, -1, weight).apply { setMargins(context.dp(2), context.dp(3), context.dp(2), context.dp(3)) })
        return button
    }

    private fun addDelete(row: LinearLayout) {
        val button = addKey(row, "⌫", 1.35f, utility = true) {}
        button.contentDescription = "删除，长按连续删除"
    }

    private fun feedback() {
        if (context.getSharedPreferences("settings", 0).getBoolean("haptic", true)) performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }
    private fun nineRowHeight(): Int {
        val preset = context.getSharedPreferences("settings", 0).getString("t9-height", "comfortable")
        val height = when (preset) { "compact" -> 60; "large" -> 86; else -> 74 }
        // Use a compact side-by-side annotation area in landscape; keep the 3x3 keypad.
        val config = resources.configuration
        return if (landscape) 54
            else if (config.screenHeightDp in 1..600) minOf(height, 60) else height
    }
    override fun onDetachedFromWindow() { repeating = false; handler.removeCallbacksAndMessages(null); super.onDetachedFromWindow() }
}
