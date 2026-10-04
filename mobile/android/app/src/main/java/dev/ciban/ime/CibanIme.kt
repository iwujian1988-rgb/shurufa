package dev.ciban.ime

import android.inputmethodservice.InputMethodService
import android.content.Context
import android.text.InputType
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import org.json.JSONObject

class CibanIme : InputMethodService() {
    private lateinit var gateway: EngineGateway
    private var keyboard: KeyboardView? = null
    private var english = false
    private var sensitive = false
    private var privateInput = false
    private var numeric = false
    private var composing = false
    private var lastState = JSONObject()
    private var finishing = false
    private var viewTheme = ""

    private fun themeSignature() = getSharedPreferences("settings", 0).getString("theme", "auto") + ":" + resources.configuration.uiMode + ":" +
        getSharedPreferences("settings", 0).getString("t9-height", "comfortable") + ":" + resources.configuration.orientation + ":" + resources.configuration.screenHeightDp

    override fun onCreate() {
        super.onCreate()
        gateway = EngineGateway(this) { state -> applyState(state) }
    }

    override fun onCreateInputView(): View {
        viewTheme = themeSignature()
        keyboard = KeyboardView(this) { op, text, index, revision ->
            when (op) {
                "switch" -> (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
                "input" -> gateway.send("input", text)
                "choose" -> gateway.send("choose", index = index, revision = revision)
                "syllable" -> gateway.send("syllable", text, revision = revision)
                "digit", "layout", "unlock" -> gateway.send(op, text)
                "mode" -> { english = text == "en"; gateway.send("mode", english = english) }
                "literal" -> gateway.send("raw", after = text)
                "enter" -> gateway.send("raw", after = "\n")
                "space" -> if (sensitive) gateway.send("raw", after = " ") else gateway.send("space")
                "delete" -> gateway.send("delete")
            }
        }.apply { setMode(english, sensitive, numeric); if (lastState.has("revision")) render(lastState) }
        return keyboard!!
    }

    override fun onStartInput(attribute: EditorInfo, restarting: Boolean) {
        super.onStartInput(attribute, restarting)
        finishing = false
        composing = false
        val variation = attribute.inputType and InputType.TYPE_MASK_VARIATION
        val klass = attribute.inputType and InputType.TYPE_MASK_CLASS
        sensitive = (klass == InputType.TYPE_CLASS_TEXT && variation in arrayOf(
            InputType.TYPE_TEXT_VARIATION_PASSWORD, InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
            InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD)) ||
            (klass == InputType.TYPE_CLASS_NUMBER && variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD)
        english = sensitive || klass == InputType.TYPE_CLASS_NUMBER || klass == InputType.TYPE_CLASS_PHONE ||
            (klass == InputType.TYPE_CLASS_TEXT && variation in arrayOf(InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
                InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS, InputType.TYPE_TEXT_VARIATION_URI))
        numeric = klass == InputType.TYPE_CLASS_NUMBER || klass == InputType.TYPE_CLASS_PHONE
        privateInput = sensitive || attribute.imeOptions and EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING != 0
        gateway.send("reset", english = english, privateInput = privateInput)
        gateway.send("layout", getSharedPreferences("settings", 0).getString("layout", "qwerty") ?: "qwerty")
        keyboard?.setMode(english, sensitive, numeric)
    }

    override fun onStartInputView(info: EditorInfo, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        if (viewTheme != themeSignature()) setInputView(onCreateInputView())
        keyboard?.setMode(english, sensitive, numeric)
        gateway.send("state")
    }

    override fun onFinishInput() {
        finishing = true
        gateway.send("reset", privateInput = true)
        gateway.send("flush")
        composing = false
        super.onFinishInput()
    }

    override fun onUpdateSelection(oldSelStart: Int, oldSelEnd: Int, newSelStart: Int, newSelEnd: Int, candidatesStart: Int, candidatesEnd: Int) {
        super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd)
        if (composing && (newSelStart != newSelEnd || (candidatesEnd >= 0 && newSelStart != candidatesEnd))) {
            currentInputConnection?.finishComposingText()
            composing = false
            gateway.send("reset", english = english, privateInput = privateInput)
        }
    }

    private fun applyState(state: JSONObject) {
        lastState = state
        if (!finishing && !state.has("error")) {
            val connection = currentInputConnection
            val edits = state.optString("commit").isNotEmpty() || state.optBoolean("delete") ||
                state.optString("after").isNotEmpty() || state.optString("raw").isNotEmpty() || composing
            // An idle/hidden IME must not finish composition owned by the host's practice keyboard.
            if (connection != null && edits) {
                connection.beginBatchEdit()
                val commit = state.optString("commit")
                if (commit.isNotEmpty()) connection.commitText(commit, 1)
                if (state.optBoolean("delete")) connection.deleteSurroundingTextInCodePoints(1, 0)
                val after = state.optString("after")
                if (after == "\n") {
                    connection.finishComposingText()
                    val info = currentInputEditorInfo
                    val editorAction = info?.imeOptions?.and(EditorInfo.IME_MASK_ACTION) ?: EditorInfo.IME_ACTION_NONE
                    if (editorAction in arrayOf(EditorInfo.IME_ACTION_DONE, EditorInfo.IME_ACTION_GO, EditorInfo.IME_ACTION_SEARCH,
                            EditorInfo.IME_ACTION_SEND, EditorInfo.IME_ACTION_NEXT)) connection.performEditorAction(editorAction)
                    else connection.commitText("\n", 1)
                } else if (after.isNotEmpty()) connection.commitText(after, 1)
                val raw = state.optString("raw")
                if (raw.isNotEmpty()) connection.setComposingText(raw, 1)
                else if (composing && commit.isEmpty()) connection.setComposingText("", 1)
                if (raw.isEmpty()) connection.finishComposingText()
                composing = raw.isNotEmpty()
                connection.endBatchEdit()
            }
        }
        keyboard?.render(state)
    }

    override fun onEvaluateFullscreenMode() = false
    override fun onDestroy() { gateway.close(); super.onDestroy() }
}
