//! Exercise the shipping server through the same Windows pipe client as the TSF DLL.
use qingjian_core::Language;
use qingjian_platform::protocol::{KeyEvent, KeyModifiers, KeyOutcome, SessionId};
use qingjian_tsf::client::{EngineClient, KeyReply, KeyResponse, pipe};
use std::{env, time::Instant};

fn key(client: &mut EngineClient<std::fs::File>, code: u32, character: Option<char>, modifiers: KeyModifiers) -> KeyResponse {
    match client.key(KeyEvent::new(code, character, modifiers)).expect("pipe key roundtrip") {
        KeyReply::Result(response) => response,
        _ => panic!("unexpected remote translation request"),
    }
}

fn main() {
    let product = env::args().nth(1).expect("english or french");
    assert!(matches!(product.as_str(), "english" | "french"));
    let language = if product == "english" { Language::English } else { Language::French };
    if let (Some(stage), Some(clsid)) = (env::args().nth(2), env::args().nth(3)) {
        validate_dll(&stage, &clsid);
    }
    // Obtain the Windows session suffix from the canonical product pipe function.
    let selected = qingjian_platform::protocol::default_pipe_name();
    let suffix = selected.split("-session-").nth(1).expect("build smoke example with CIBAN_PRODUCT set");
    let name = format!(r"\\.\pipe\ciban-{product}-v7-session-{suffix}");
    let (mut client, _) = EngineClient::open(pipe::connect(&name).expect("shipping server listening"), SessionId(std::process::id() as u64), Some("ciban-smoke.exe".into())).expect("session handshake");
    client.set_private(true).expect("isolate test input from personal learning");
    let mut elapsed = Vec::new();
    for (pinyin, chinese) in [("nihao", "你好"), ("pingguo", "苹果"), ("xiexie", "谢谢"), ("yinhang", "银行")] {
        client.commit().unwrap();
        let mut last = None;
        for c in pinyin.chars() {
            let now = Instant::now();
            let reply = key(&mut client, c.to_ascii_uppercase() as u32, Some(c), KeyModifiers::default());
            elapsed.push(now.elapsed().as_micros());
            assert_eq!(reply.outcome, KeyOutcome::Consumed);
            last = Some(reply);
        }
        let reply = last.unwrap();
        if let Some(output) = env::args().nth(4) {
            std::fs::create_dir_all(&output).unwrap();
            let path = std::path::Path::new(&output).join(format!("{product}-{pinyin}-frame.json"));
            // Frame is the actual shipping-server response, not a reconstructed screenshot.
            std::fs::write(path, serde_json::to_string_pretty(&reply.frame).unwrap()).unwrap();
        }
        let index = reply.frame.candidates.items.iter().position(|c| c.text == chinese).expect("expected Chinese word on first page");
        let candidate = &reply.frame.candidates.items[index];
        let translation = candidate.translation.as_ref().expect("learning annotation");
        assert_eq!(translation.language, language);
        let short = translation.senses().first().expect("nonempty meaning").text.clone();
        assert!(!short.contains('{'), "raw JSON must never leak into candidate UI");
        let digit = char::from_digit(index as u32 + 1, 10).unwrap();
        let accepted = key(&mut client, digit as u32, Some(digit), KeyModifiers { ctrl: true, ..Default::default() });
        assert_eq!(accepted.commit.as_deref(), Some(short.as_str()), "shortcut must commit the displayed, reading-matched meaning");
        println!("{product}: {pinyin} -> {chinese} | {short} | translated commit OK");
    }
    // Cancellation and normal Chinese commit remain functional.
    for c in "nihao".chars() { key(&mut client, c.to_ascii_uppercase() as u32, Some(c), Default::default()); }
    let escaped = key(&mut client, 0x1b, None, Default::default());
    assert!(escaped.frame.is_empty());
    for c in "nihao".chars() { key(&mut client, c.to_ascii_uppercase() as u32, Some(c), Default::default()); }
    let chinese = key(&mut client, 0x20, Some(' '), Default::default());
    assert_eq!(chinese.commit.as_deref(), Some("你好"));
    assert!(chinese.frame.is_empty());
    elapsed.sort_unstable();
    println!("{product}: {} real pipe key roundtrips, p50={}us p95={}us (not end-to-end physical keyboard latency)", elapsed.len(), elapsed[elapsed.len()/2], elapsed[(elapsed.len()*95/100).min(elapsed.len()-1)]);
    client.close().unwrap();
}

fn validate_dll(stage: &str, clsid: &str) {
    use std::ffi::c_void;
    use windows::core::{GUID, HRESULT, HSTRING, Interface, PCSTR};
    use windows::Win32::Foundation::FreeLibrary;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, IClassFactory};
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    use windows::Win32::UI::TextServices::ITfTextInputProcessor;
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().expect("COM initialization") };
    let path = std::path::Path::new(stage).join("tsf-x64.dll");
    let module = unsafe { LoadLibraryW(&HSTRING::from(path.to_string_lossy().as_ref())) }.expect("TSF DLL system dependencies available");
    let address = unsafe { GetProcAddress(module, PCSTR(c"DllGetClassObject".as_ptr().cast())) }.expect("COM export");
    let get_class: unsafe extern "system" fn(*const GUID, *const GUID, *mut *mut c_void) -> HRESULT = unsafe { std::mem::transmute(address) };
    let mut object = std::ptr::null_mut();
    unsafe { get_class(&GUID::try_from(clsid.trim_matches(['{','}'])).unwrap(), &IClassFactory::IID, &mut object).ok() }.expect("compiled product CLSID matches manifest");
    let factory = unsafe { IClassFactory::from_raw(object) };
    let service: ITfTextInputProcessor = unsafe { factory.CreateInstance(None) }.expect("real TSF service instantiation");
    drop(service); drop(factory);
    unsafe { FreeLibrary(module).unwrap(); CoUninitialize(); }
    println!("TSF x64: real product COM factory and text service instantiated successfully");
}
