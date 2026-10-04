package dev.ciban.ime

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Debug-only, opt-in benchmark of synthetic input in our own editor. Never reads user text. */
internal class KeyboardBenchmark(private val activity: MainActivity) {
    private val main = Handler(Looper.getMainLooper())
    private val samples = mutableListOf<Double>()
    private val sequences = listOf("64426", "98394", "9464264", "28944326", "74644867472", "6442698394")
    private var round = 0
    private var sequence = 0
    private var digit = 0
    private var deadline = 0L
    private var waiting: ViewTreeObserver.OnDrawListener? = null
    private val result = JSONObject().put("version", BuildConfig.VERSION_NAME)
        .put("language", BuildConfig.LEARNING_LANGUAGE).put("device", android.os.Build.MODEL)
        .put("measurement", "performClick to first keyboard onDraw with matching raw; excludes touch hardware and display scanout; JNI includes JSON parsing")

    fun start() {
        File(activity.cacheDir, "keyboard-performance.json").delete()
        deadline = SystemClock.uptimeMillis() + 20000
        waitReady()
    }

    private fun views(view: View): List<View> = if (view is ViewGroup)
        listOf(view) + (0 until view.childCount).flatMap { views(view.getChildAt(it)) } else listOf(view)

    private fun waitReady(): Unit = safely {
        if (!activity.keyboard.benchmarkReady) {
            check(SystemClock.uptimeMillis() < deadline) { "loading timeout" }
            main.postDelayed({ waitReady() }, 50)
        } else {
            val layout = views(activity.keyboard).first { it.contentDescription?.toString()?.startsWith("切换中文键盘布局") == true }
            if (layout is android.widget.TextView && layout.text.toString() == "全键盘") layout.performClick()
            main.postDelayed({ startSequence() }, 250)
        }
    }

    private fun onMatchingDraw(raw: String, done: () -> Unit) {
        val started = SystemClock.uptimeMillis()
        val listener = object : ViewTreeObserver.OnDrawListener {
            override fun onDraw() {
                if (activity.keyboard.benchmarkRaw == raw && waiting === this) {
                    waiting = null
                    main.post {
                        activity.keyboard.viewTreeObserver.removeOnDrawListener(this)
                        safely { done() }
                    }
                }
            }
        }
        waiting = listener
        activity.keyboard.viewTreeObserver.addOnDrawListener(listener)
        main.postDelayed({
            if (waiting === listener && SystemClock.uptimeMillis() - started >= 10000) {
                waiting = null
                activity.keyboard.viewTreeObserver.removeOnDrawListener(listener)
                fail("draw timeout")
            }
        }, 10000)
    }

    private fun startSequence(): Unit = safely {
        digit = 0
        onMatchingDraw("") { nextDigit() }
        activity.benchmarkReset()
    }

    private fun nextDigit(): Unit = safely {
        val code = sequences[sequence]
        if (digit == code.length) {
            sequence++
            if (sequence == sequences.size) { sequence = 0; round++ }
            if (round == 8) { burst(); return@safely }
            main.postDelayed({ startSequence() }, 30)
            return@safely
        }
        val key = views(activity.keyboard).first { it.contentDescription?.toString()?.startsWith("九宫格 ${code[digit]} ") == true }
        val expected = code.substring(0, digit + 1)
        val start = SystemClock.elapsedRealtimeNanos()
        onMatchingDraw(expected) {
            val elapsed = (SystemClock.elapsedRealtimeNanos() - start) / 1_000_000.0
            if (round >= 2) samples.add(elapsed)
            check(activity.editor.text.toString() == expected) { "editor lost input" }
            digit++
            main.postDelayed({ nextDigit() }, 20)
        }
        key.performClick()
    }

    private fun burst(): Unit = safely {
        onMatchingDraw("") {
            val code = "6442698394"
            val keys = code.map { d -> views(activity.keyboard).first { it.contentDescription?.toString()?.startsWith("九宫格 $d ") == true } }
            val start = SystemClock.elapsedRealtimeNanos()
            onMatchingDraw(code) {
                check(activity.editor.text.toString() == code) { "burst lost input" }
                result.put("burstTenKeysToFinalDrawMs", (SystemClock.elapsedRealtimeNanos() - start) / 1_000_000.0)
                result.put("burstInputPreserved", true)
                activity.benchmarkReset()
                nativeMeasurements()
            }
            keys.forEach { it.performClick() }
        }
        activity.benchmarkReset()
    }

    private fun nativeMeasurements() {
        Thread {
            var handle = 0L
            try {
                val rootName = activity.getSharedPreferences("installed-data", 0).getString("root", null)!!
                handle = NativeBridge.create(File(activity.filesDir, rootName).absolutePath, BuildConfig.LEARNING_LANGUAGE)
                fun call(op: String, text: String = "") = JSONObject(NativeBridge.dispatch(handle,
                    JSONObject().put("op", op).put("text", text).put("private", true).toString()))
                call("reset"); call("layout", "t9")
                val native = mutableListOf<Double>()
                repeat(12) { cycle ->
                    for (code in sequences) {
                        call("reset")
                        var last = JSONObject()
                        for (d in code) {
                            val start = SystemClock.elapsedRealtimeNanos()
                            last = call("digit", d.toString())
                            if (cycle >= 2) native.add((SystemClock.elapsedRealtimeNanos() - start) / 1_000_000.0)
                        }
                        check(last.getString("raw") == code)
                    }
                }
                result.put("uiFirstDraw", summary(samples)).put("jni", summary(native)).put("status", "PASS")
                write()
            } catch (error: Throwable) { fail(error.toString()) }
            finally { if (handle != 0L) NativeBridge.destroy(handle) }
        }.start()
    }

    private fun summary(values: List<Double>): JSONObject {
        val sorted = values.sorted()
        fun percentile(p: Double) = sorted[(kotlin.math.ceil(sorted.size * p).toInt() - 1).coerceIn(0, sorted.lastIndex)]
        return JSONObject().put("samples", values.size).put("p50Ms", percentile(.5)).put("p95Ms", percentile(.95))
            .put("maxMs", sorted.last()).put("valuesMs", JSONArray(values))
    }
    private fun safely(block: () -> Unit) { try { block() } catch (error: Throwable) { fail(error.toString()) } }
    private fun fail(reason: String) { result.put("status", "FAIL").put("error", reason); write() }
    private fun write() { File(activity.cacheDir, "keyboard-performance.json").writeText(result.toString(2)) }
}

