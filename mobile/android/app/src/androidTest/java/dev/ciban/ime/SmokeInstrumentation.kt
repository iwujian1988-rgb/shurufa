package dev.ciban.ime

import android.app.Activity
import android.app.Instrumentation
import android.os.Bundle
import org.json.JSONObject
import java.io.File

/** 通过真实 JNI、随包词库和客户端运行，结果由 am instrument 返回。 */
class SmokeInstrumentation : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
    override fun onStart() {
        Thread {
            var handle = 0L
            val result = Bundle()
            try {
                val root = File(targetContext.cacheDir, "smoke-engine").apply { mkdirs() }
                val names = mutableListOf("dict.qj", "lm.qj", "glossary.qj", "english.tsv")
                if (BuildConfig.LEARNING_LANGUAGE == "fr") names.addAll(listOf("french-base.qj", "french-lessons.qj"))
                if (BuildConfig.LEARNING_LANGUAGE == "en") names.add("english-lessons.qj")
                for (name in names) {
                    targetContext.assets.open("data/$name").use { input -> File(root, name).outputStream().use { input.copyTo(it) } }
                }
                handle = NativeBridge.create(root.absolutePath, BuildConfig.LEARNING_LANGUAGE)
                fun call(op: String, text: String = "", index: Int = -1, revision: Long = -1): JSONObject =
                    JSONObject(NativeBridge.dispatch(handle, JSONObject().put("op", op).put("text", text)
                        .put("index", index).put("revision", revision).put("private", true).toString()))
                call("reset")
                for (letter in "nihao") call("input", letter.toString())
                check(call("state").getString("raw") == "nihao") { "incremental JNI input differs" }
                call("reset")
                var state = call("input", "nihao")
                val candidates = state.getJSONArray("candidates")
                val index = (0 until candidates.length()).first { candidates.getJSONObject(it).getString("text") == "你好" }
                val gloss = candidates.getJSONObject(index).getString("gloss")
                check(gloss.isNotEmpty()) { "missing real glossary annotation" }
                if (BuildConfig.LEARNING_LANGUAGE == "fr") check(gloss == "bonjour")
                state = call("choose", index = index, revision = state.getLong("revision"))
                check(state.getString("commit") == "你好" && state.getString("raw").isEmpty())
                state = call("input", "xuexi")
                val stale = state.getLong("revision")
                call("delete")
                check(call("choose", index = 0, revision = stale).getBoolean("rejected"))
                call("reset")
                check(call("delete").getBoolean("delete"))
                if (BuildConfig.LEARNING_LANGUAGE == "fr") {
                    state = call("input", "kafei")
                    val list = state.getJSONArray("candidates")
                    check((0 until list.length()).any { list.getJSONObject(it).optString("gloss").contains("café") })
                    fun candidate(spelling: String, word: String): JSONObject {
                        call("reset"); call("layout", "qwerty")
                        val items = call("input", spelling).getJSONArray("candidates")
                        return (0 until items.length()).map { items.getJSONObject(it) }.first { it.getString("text") == word }
                    }
                    val bank = candidate("yinhang", "银行")
                    check(bank.getJSONObject("detail").getJSONArray("senses").getJSONObject(0).getString("gender") == "阴性")
                    check(bank.getString("gloss").contains("banque"))
                    check(candidate("hai", "还").getString("gloss").contains("encore"))
                    check(candidate("huan", "还").getString("gloss").contains("rendre"))
                    check(candidate("de", "的").getString("gloss").contains("liaison"))
                    check(candidate("xing", "行").getString("gloss").contains("marcher"))
                    check(candidate("hang", "行").getString("gloss").contains("ligne"))
                    check(candidate("wojue de".replace(" ", ""), "我觉得").getJSONObject("detail").getString("note").contains("看法"))
                    check(candidate("buzhidao", "不知道").getString("gloss").contains("savoir"))
                    check(candidate("yinhang", "银行").getJSONObject("detail").getString("review").contains("未独立"))
                }
                val invalid = JSONObject(NativeBridge.dispatch(-1, "{\"op\":\"state\"}"))
                if (BuildConfig.LEARNING_LANGUAGE == "en") {
                    fun candidate(spelling: String, word: String): JSONObject {
                        call("reset"); call("layout", "qwerty")
                        val items = call("input", spelling).getJSONArray("candidates")
                        return (0 until items.length()).map { items.getJSONObject(it) }.first { it.getString("text") == word }
                    }
                    check(candidate("yinhang", "银行").getJSONObject("detail").getString("countability").contains("可数"))
                    check(candidate("xing", "行").getString("gloss").contains("walk"))
                    check(candidate("hang", "行").getString("gloss").contains("line"))
                    check(candidate("hai", "还").getString("gloss").contains("still"))
                    check(candidate("huan", "还").getString("gloss").contains("return"))
                    check(candidate("de", "地").getString("gloss").contains("particle"))
                    check(candidate("di", "地").getString("gloss").contains("ground"))
                    check(candidate("buzhidao", "不知道").getJSONObject("detail").getString("example").contains("don't know"))
                    check(candidate("wojuede", "我觉得").getJSONObject("detail").getString("note").contains("看法"))
                    check(candidate("xuexi", "学习").getJSONObject("detail").getString("forms").contains("studied"))
                    check(candidate("haizi", "孩子").getJSONObject("detail").getString("forms").contains("children"))
                    check(candidate("xinxi", "信息").getJSONObject("detail").getString("countability").contains("不可数"))
                    check(candidate("shu", "树").getJSONObject("detail").getJSONArray("senses").getJSONObject(0).getString("pos").isNotEmpty())
                }
                check(invalid.has("error"))
                call("reset")
                call("layout", "t9")
                val timings = mutableListOf<Long>()
                for (digit in "64426") {
                    val start = android.os.SystemClock.elapsedRealtimeNanos()
                    state = call("digit", digit.toString())
                    timings.add((android.os.SystemClock.elapsedRealtimeNanos() - start) / 1_000_000)
                }
                check(state.getString("raw") == "64426")
                var t9Candidates = state.getJSONArray("candidates")
                val t9Index = (0 until t9Candidates.length()).first { t9Candidates.getJSONObject(it).getString("text") == "你好" }
                check(t9Candidates.getJSONObject(t9Index).getString("gloss").isNotEmpty())
                state = call("syllable", "ni", revision = state.getLong("revision"))
                check(state.getString("locked") == "ni")
                state = call("syllable", "hao", revision = state.getLong("revision"))
                check(state.getString("locked") == "ni'hao")
                state = call("space")
                check(state.getString("commit") == "你好" && state.getString("raw").isEmpty())
                call("digit", "98394")
                state = call("delete")
                check(state.getString("raw") == "9839" && !state.getBoolean("delete"))
                call("reset")
                state = call("digit", "52334")
                t9Candidates = state.getJSONArray("candidates")
                check((0 until t9Candidates.length()).any { t9Candidates.getJSONObject(it).getString("text") == "咖啡" })
                if (BuildConfig.LEARNING_LANGUAGE == "fr") check((0 until t9Candidates.length()).any { t9Candidates.getJSONObject(it).getString("gloss").contains("café") })
                call("reset")
                targetContext.getSharedPreferences("settings", 0).edit().putString("layout", "qwerty").commit()
                val activity = startActivitySync(android.content.Intent(targetContext, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
                android.os.SystemClock.sleep(300)
                fun descendants(view: android.view.View): List<android.view.View> = if (view is android.view.ViewGroup)
                    listOf(view) + (0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else listOf(view)
                var ready = false
                val deadline = android.os.SystemClock.elapsedRealtime() + 10000
                while (!ready && android.os.SystemClock.elapsedRealtime() < deadline) {
                    runOnMainSync {
                        val text = descendants(activity.keyboard).filterIsInstance<android.widget.TextView>().map { it.text.toString() }
                        check(text.none { it.contains("加载失败") }) { "keyboard data installation failed" }
                        ready = text.none { it == "正在加载离线词库…" }
                    }
                    if (!ready) android.os.SystemClock.sleep(50)
                }
                check(ready) { "keyboard did not finish initial data installation" }
                runOnMainSync {
                    var selectedRevision = -1L
                    val raceKeyboard = KeyboardView(activity) { op, _, _, rev -> if (op == "choose") selectedRevision = rev }
                    fun raceState(rev: Long, word: String) = JSONObject().put("revision", rev).put("raw", "ni")
                        .put("candidates", org.json.JSONArray().put(JSONObject().put("index", 0).put("text", word).put("gloss", "test")))
                    raceKeyboard.render(raceState(1, "你"))
                    val touched = descendants(raceKeyboard).first { it.contentDescription?.toString()?.startsWith("你，") == true }
                    val now = android.os.SystemClock.uptimeMillis()
                    val down = android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_DOWN, 2f, 2f, 0)
                    touched.dispatchTouchEvent(down); down.recycle()
                    raceKeyboard.render(raceState(2, "米"))
                    touched.performClick()
                    check(selectedRevision == 1L) { "candidate refresh committed the replacement identity" }
                }
                for (letter in "nihao") {
                    runOnMainSync {
                        val key = descendants(activity.keyboard).filterIsInstance<android.widget.Button>().first { it.text.toString() == letter.toString() }
                        key.performClick()
                    }
                    android.os.SystemClock.sleep(120)
                }
                var actual = ""
                runOnMainSync { actual = activity.editor.text.toString() }
                check(actual == "nihao") { "actual UI clicks differ: $actual" }
                repeat(5) {
                    runOnMainSync { descendants(activity.keyboard).first { it.contentDescription?.toString() == "删除，长按连续删除" }.performClick() }
                    android.os.SystemClock.sleep(120)
                }
                runOnMainSync { descendants(activity.keyboard).filterIsInstance<android.widget.TextView>().first { it.text.toString() == "全键盘" }.performClick() }
                android.os.SystemClock.sleep(300)
                runOnMainSync {
                    for ((digit, letters) in mapOf('2' to "ABC", '3' to "DEF", '4' to "GHI", '5' to "JKL", '6' to "MNO", '7' to "PQRS", '8' to "TUV", '9' to "WXYZ")) {
                        val key = descendants(activity.keyboard).filterIsInstance<android.widget.Button>().first { it.contentDescription?.toString()?.startsWith("九宫格 $digit ") == true }
                        check(key.text.toString() == letters && key.textSize / activity.resources.displayMetrics.scaledDensity >= 23f) { "T9 primary letters missing: $digit" }
                    }
                }
                for (digit in "64426") {
                    runOnMainSync {
                        descendants(activity.keyboard).first { it.contentDescription?.toString()?.startsWith("九宫格 $digit ") == true }.performClick()
                    }
                    android.os.SystemClock.sleep(250)
                }
                runOnMainSync { actual = activity.editor.text.toString() }
                check(actual == "64426") { "T9 UI clicks differ: $actual" }
                var keyHeightDp = 0f
                runOnMainSync {
                    keyHeightDp = descendants(activity.keyboard).first { it.contentDescription?.toString()?.startsWith("九宫格 2 ") == true }.height / activity.resources.displayMetrics.density
                }
                check(keyHeightDp >= 66f) { "comfortable T9 target is still too short: $keyHeightDp dp" }
                runOnMainSync { descendants(activity.keyboard).first { it.contentDescription?.toString()?.startsWith("你好，") == true }.performClick() }
                android.os.SystemClock.sleep(250)
                runOnMainSync { actual = activity.editor.text.toString() }
                check(actual == "你好") { "T9 UI commit differs: $actual" }
                if (BuildConfig.LEARNING_LANGUAGE in arrayOf("fr", "en")) {
                    runOnMainSync {
                        // Regression: replacing host text must not let an idle hidden IME commit the first letter.
                        activity.editor.setText("")
                        descendants(activity.keyboard).filterIsInstance<android.widget.TextView>().first { it.text.toString() == "九宫格" }.performClick()
                    }
                    android.os.SystemClock.sleep(200)
                    for (letter in "yinhang") {
                        runOnMainSync { descendants(activity.keyboard).filterIsInstance<android.widget.Button>().first { it.text.toString() == letter.toString() }.performClick() }
                        android.os.SystemClock.sleep(150)
                    }
                    runOnMainSync { actual = activity.editor.text.toString() }
                    check(actual == "yinhang") { "bank composition before long press differs: $actual" }
                    var genderVisible = false
                    runOnMainSync {
                        descendants(activity.keyboard).first { it.contentDescription?.toString()?.startsWith("银行，") == true }.performLongClick()
                        genderVisible = descendants(activity.keyboard).filterIsInstance<android.widget.TextView>().any {
                            it.text.toString().contains(if (BuildConfig.LEARNING_LANGUAGE == "fr") "阴性" else "可数性")
                        }
                        actual = activity.editor.text.toString()
                    }
                    check(genderVisible) { "noun grammar missing from lesson panel" }
                    check(actual == "yinhang") { "long press changed composition: $actual" }
                    runOnMainSync {
                        descendants(activity.keyboard).first { it.contentDescription?.toString() == "关闭词语用法，返回键盘" }.performClick()
                    }
                    android.os.SystemClock.sleep(100)
                    runOnMainSync { descendants(activity.keyboard).first { it.contentDescription?.toString()?.startsWith("银行，") == true }.performClick() }
                    android.os.SystemClock.sleep(200)
                    runOnMainSync { actual = activity.editor.text.toString() }
                    check(actual == "银行") { "return from detail lost composition: $actual" }
                }
                runOnMainSync { activity.finish() }
                result.putString("stream", "PASS: real JNI + packaged data + QWERTY/T9 UI; annotation, commit, stale selection, delete, Unicode, syllable selection; language-specific reading distinctions, phrases and noun grammar/detail panel; English countability/irregular forms/upstream POS when applicable\nT9 comfortable key height: $keyHeightDp dp\nT9 five JNI digit calls (ms, not UI latency): $timings\n")
                finish(Activity.RESULT_OK, result)
            } catch (failure: Throwable) {
                result.putString("stream", "FAIL: ${failure.message}\n${failure.stackTraceToString()}")
                finish(Activity.RESULT_CANCELED, result)
            } finally { if (handle != 0L) NativeBridge.destroy(handle) }
        }.start()
    }
}
