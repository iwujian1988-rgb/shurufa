//! JNI 只跨边界转换字符串；引擎句柄只能在创建线程访问。
use crate::session::Session;
use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::{jlong, jstring};
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};

thread_local! { static SESSIONS: RefCell<HashMap<i64, Session>> = RefCell::new(HashMap::new()); }
static NEXT_ID: AtomicI64 = AtomicI64::new(1);

#[unsafe(no_mangle)]
pub extern "system" fn Java_dev_ciban_ime_NativeBridge_create(
    mut env: JNIEnv,
    _class: JClass,
    root: JString,
    language: JString,
) -> jlong {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let root: String = env.get_string(&root).map_err(|e| e.to_string())?.into();
        let language: String = env.get_string(&language).map_err(|e| e.to_string())?.into();
        let session = Session::load(Path::new(&root), &language)?;
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        SESSIONS.with(|sessions| sessions.borrow_mut().insert(id, session));
        Ok::<_, String>(id)
    }));
    match result {
        Ok(Ok(id)) => id,
        failure => {
            let message = match failure {
                Ok(Err(e)) => e,
                _ => "native engine initialization failed".to_owned(),
            };
            let _ = env.throw_new("java/lang/IllegalStateException", message);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_dev_ciban_ime_NativeBridge_dispatch(
    mut env: JNIEnv,
    _class: JClass,
    handle: jlong,
    request: JString,
) -> jstring {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let text: String = env.get_string(&request).map_err(|e| e.to_string())?.into();
        let request = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        SESSIONS.with(|sessions| {
            sessions
                .borrow_mut()
                .get_mut(&handle)
                .map(|session| session.dispatch(&request).to_string())
                .ok_or_else(|| "invalid engine session or thread".to_owned())
        })
    }));
    let response = match result {
        Ok(Ok(response)) => response,
        Ok(Err(e)) => serde_json::json!({"error":e}).to_string(),
        Err(_) => serde_json::json!({"error":"native engine operation failed"}).to_string(),
    };
    env.new_string(response)
        .map_or(std::ptr::null_mut(), |s| s.into_raw())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_dev_ciban_ime_NativeBridge_destroy(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) {
    SESSIONS.with(|sessions| {
        sessions.borrow_mut().remove(&handle);
    });
}
