package dev.ciban.ime

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** 只有本执行器访问 JNI 会话；输入框切换后丢弃旧会话的回调。 */
class EngineGateway(context: Context, private val receive: (JSONObject) -> Unit) {
    private val app = context.applicationContext
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var handle = 0L
    private var closed = false
    private var generation = 0

    init {
        worker.execute {
            try {
                val root = prepareData()
                handle = NativeBridge.create(root.absolutePath, BuildConfig.LEARNING_LANGUAGE)
                val layout = app.getSharedPreferences("settings", 0).getString("layout", "qwerty")
                val state = JSONObject(NativeBridge.dispatch(handle, JSONObject().put("op", "layout").put("text", layout).toString()))
                main.post { if (!closed && generation == 0) receive(state) }
            } catch (_: Throwable) {
                main.post { if (!closed) receive(JSONObject().put("error", "词库加载失败，请关闭后重试")) }
            }
        }
    }

    fun send(op: String, text: String = "", index: Int = -1, revision: Long = -1, english: Boolean = false,
             privateInput: Boolean = false, after: String = "") {
        if (closed) return
        if (op == "reset") generation++
        val epoch = generation
        val request = JSONObject().put("op", op).put("text", text).put("index", index)
            .put("revision", revision).put("english", english).put("private", privateInput)
        worker.execute {
            try {
                if (handle == 0L) throw IllegalStateException("engine unavailable")
                val result = JSONObject(NativeBridge.dispatch(handle, request.toString())).put("after", after)
                main.post { if (!closed && generation == epoch) receive(result) }
            } catch (_: Throwable) {
                main.post { if (!closed && generation == epoch) receive(JSONObject().put("error", "输入引擎暂不可用，请切换键盘后重试")) }
            }
        }
    }

    fun close() {
        if (closed) return
        closed = true
        generation++
        worker.execute {
            if (handle != 0L) {
                NativeBridge.dispatch(handle, "{\"op\":\"flush\"}")
                NativeBridge.destroy(handle)
            }
        }
        worker.shutdown()
    }

    private fun prepareData(): File = synchronized(dataLock) {
        // Immutable asset generation: running mmap files are never overwritten.
        val cacheVersion = app.assets.open("data/cache-version.txt").bufferedReader().use { it.readText().trim() }
        check(cacheVersion.matches(Regex("v2-[a-f0-9]{16}"))) { "invalid data version" }
        val root = File(app.filesDir, "engine-$cacheVersion").apply { check(isDirectory || mkdirs()) }
        val installed = app.getSharedPreferences("installed-data", 0)
        val previous = installed.getString("root", null)?.takeIf { it.matches(Regex("engine-v2-[a-f0-9]{16}")) }
            ?: if (File(app.filesDir, "engine-v2").isDirectory) "engine-v2" else "engine-v1"
        val names = mutableListOf("dict.qj", "glossary.qj", "lm.qj", "english.tsv")
        if (BuildConfig.LEARNING_LANGUAGE == "fr") names.addAll(listOf("french-base.qj", "french-lessons.qj"))
        if (BuildConfig.LEARNING_LANGUAGE == "en") names.add("english-lessons.qj")
        for (name in names) {
            val file = File(root, name)
            if (!file.exists()) {
                val temporary = File(root, "$name.tmp")
                app.assets.open("data/$name").use { input -> temporary.outputStream().use { input.copyTo(it) } }
                check(temporary.renameTo(file)) { "asset installation failed" }
            }
        }
        // Preserve learned frequencies on the first upgrade, within this product's private directory.
        val migrated = File(root, "learning-migrated")
        if (!migrated.exists()) {
            for (name in listOf("frequency.tsv", "user-choices.tsv", "user-ngram.tsv")) {
                val oldFile = File(File(app.filesDir, previous), name)
                val newFile = File(root, name)
                if (oldFile.isFile && !newFile.exists()) {
                    val temporary = File(root, "$name.tmp")
                    oldFile.copyTo(temporary, overwrite = true)
                    check(temporary.renameTo(newFile)) { "learning migration failed" }
                }
            }
            migrated.writeText("$previous to ${root.name}")
        }
        check(installed.edit().putString("root", root.name).commit()) { "data version recording failed" }
        root
    }

    companion object { private val dataLock = Any() }
}
