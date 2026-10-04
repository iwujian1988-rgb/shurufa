package dev.ciban.ime

object NativeBridge {
    init { System.loadLibrary("ciban_native") }
    @JvmStatic external fun create(root: String, language: String): Long
    @JvmStatic external fun dispatch(handle: Long, request: String): String
    @JvmStatic external fun destroy(handle: Long)
}
