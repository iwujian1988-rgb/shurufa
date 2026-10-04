package dev.ciban.ime

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.widget.Button

/** 点按、长按重复与无障碍点击均走同一删除动作。 */
class DeleteButton(context: Context, private val remove: () -> Unit) : Button(context) {
    constructor(context: Context) : this(context, {})
    private val handler = Handler(Looper.getMainLooper())
    private var touchDelivered = false
    private val repeat = object : Runnable {
        override fun run() { if (isPressed) { remove(); handler.postDelayed(this, 60) } }
    }
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                isPressed = true; touchDelivered = true; remove(); handler.postDelayed(repeat, 380)
            }
            MotionEvent.ACTION_UP -> { isPressed = false; handler.removeCallbacks(repeat); performClick() }
            MotionEvent.ACTION_CANCEL -> { isPressed = false; touchDelivered = false; handler.removeCallbacks(repeat) }
        }
        return true
    }
    override fun performClick(): Boolean {
        super.performClick()
        if (!touchDelivered) remove()
        touchDelivered = false
        return true
    }
    override fun onDetachedFromWindow() { handler.removeCallbacksAndMessages(null); super.onDetachedFromWindow() }
}
