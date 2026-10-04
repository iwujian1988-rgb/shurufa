//! Product identity is selected once at build time, shared by TSF, server and settings.
use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=CIBAN_PRODUCT");
    println!("cargo:rerun-if-changed=../../../products/windows.json");
    let selected = env::var("CIBAN_PRODUCT").unwrap_or_default();
    let mut code = String::new();
    if selected.is_empty() {
        code.push_str("pub const IS_CIBAN: bool = false;\n");
        for (key, value) in [
            ("NAME", "青简"), ("DIRECTORY", "Qingjian"), ("LANGUAGE", "en"),
            ("SERVER", "qingjian-server.exe"), ("SETTINGS", "qingjian-settings.exe"),
            ("CLSID", "{4FDCA82D-E923-49BF-9E75-BB906B93B8BB}"),
            ("PROFILE", "{8119F8E0-CF81-423B-9189-C0D7374324B3}"),
            ("ATTRIBUTE", "{C47CB4C0-0AC9-4C8F-BDBF-8B6D21CC504F}"),
            ("TRANSLATE", "{5C0A7B12-3D4E-4F60-8A91-2B3C4D5E6F70}"),
            ("SWITCH", "{2F6B8C51-9A34-4E7D-B2C8-5D1E0F3A7B64}")
        ] { emit(&mut code, key, value); }
        emit(&mut code, "PIPE", r"\\.\pipe\qingjian");
    } else {
        assert!(matches!(selected.as_str(), "english" | "french"), "Invalid CIBAN_PRODUCT");
        let products: serde_json::Value = serde_json::from_str(
            &fs::read_to_string("../../../products/windows.json").expect("product manifest")
        ).expect("valid product manifest");
        code.push_str("pub const IS_CIBAN: bool = true;\n");
        for key in ["name", "directory", "language", "server", "settings", "clsid", "profile", "attribute", "translate", "switch"] {
            emit(&mut code, &key.to_uppercase(), products[&selected][key].as_str().expect("product field"));
        }
        emit(&mut code, "PIPE", &format!(r"\\.\pipe\ciban-{selected}-v7"));
    }
    // Names are local to a Windows session. Installer mutex is deliberately machine-wide.
    let directory = if selected.is_empty() { "Qingjian" } else if selected == "english" { "CibanEnglish" } else { "CibanFrench" };
    for (key, value) in [
        ("LAUNCH_MUTEX", format!("Local\\{directory}ServerLaunch")),
        ("INSTALLER_MUTEX", format!("Global\\{directory}Installer")),
        ("SETTINGS_MUTEX", format!("Local\\{directory}Settings")),
        ("POLL_CLASS", format!("{directory}PollWindow")),
        ("CANDIDATE_CLASS", format!("{directory}CandidateWindow")),
        ("STATUS_CLASS", format!("{directory}StatusBar")),
    ] { emit(&mut code, key, &value); }
    fs::write(PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("product.rs"), code).unwrap();
}

fn emit(code: &mut String, key: &str, value: &str) {
    code.push_str(&format!("pub const {key}: &str = {value:?};\n"));
    let mut wide: Vec<u16> = value.encode_utf16().collect();
    wide.push(0);
    code.push_str(&format!("pub const {key}_W: &[u16] = &{wide:?};\n"));
    if matches!(key, "CLSID" | "PROFILE" | "ATTRIBUTE" | "TRANSLATE" | "SWITCH") {
        let hex = value.replace(['{', '}', '-'], "");
        let number = u128::from_str_radix(&hex, 16).expect("valid GUID");
        code.push_str(&format!("pub const {key}_U128: u128 = 0x{number:032x};\n"));
    }
}
