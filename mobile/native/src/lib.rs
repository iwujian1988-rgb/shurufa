//! 词伴 Android 的线程内引擎会话与 JNI 边界。
pub mod english;
pub mod french;
#[cfg(target_os = "android")]
mod jni_bridge;
pub mod session;
mod t9;
