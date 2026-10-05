//! 嵌 uiAccess manifest：候选窗口要盖过商店 / 任务栏搜索这些高 z-band 宿主，`SetWindowPos(HWND_TOPMOST)`
//! 才能升进 UIAccess 高带。系统只对签名且装在 Program Files 的 exe 授予，光有 manifest 不够；
//! **没签名的 exe 带 uiAccess=true 会直接起不来**，所以没有证书的构建（CI 内测包）要设 `QINGJIAN_UIACCESS=0`
//! 关掉它，代价是候选窗在 UWP 宿主里可能被盖住（用户文档已列为已知问题）。
//! manifest 缺省含 PerMonitorV2 DPI 感知，与运行时那次 `SetProcessDpiAwarenessContext` 一致。
//! 另把青简图标嵌进 exe（任务管理器 / 启动项里显示）。

use embed_manifest::manifest::ExecutionLevel;
use embed_manifest::{embed_manifest, new_manifest};

fn main() {
    // build.rs 跑在宿主机上，只有目标是 Windows 时才嵌。
    println!("cargo:rerun-if-env-changed=QINGJIAN_UIACCESS");
    println!("cargo:rerun-if-env-changed=CIBAN_PRODUCT");
    println!("cargo:rerun-if-env-changed=CIBAN_VERSION");
    println!("cargo:rerun-if-env-changed=CIBAN_SDK_BIN");
    if std::env::var_os("CARGO_CFG_WINDOWS").is_some() {
        let ui_access = std::env::var("QINGJIAN_UIACCESS").map_or(true, |v| v != "0");
        if !ui_access {
            println!(
                "cargo:warning=QINGJIAN_UIACCESS=0：Server 不带 uiAccess，候选窗在 UWP 宿主里可能被盖住"
            );
        }
        let manifest = new_manifest("Qingjian.Server")
            .requested_execution_level(ExecutionLevel::AsInvoker)
            .ui_access(ui_access);
        embed_manifest(manifest).expect("嵌入 Server manifest 失败");
    }
    embed_icon();
    println!("cargo:rerun-if-changed=build.rs");
}

/// 图标资源要 `rc.exe`（MSVC）编，只在 Windows 宿主上做；失败只警告，别让编译挂掉。
/// winresource 缺省不带 manifest，与上面链接器嵌的那份不冲突。
#[cfg(windows)]
fn embed_icon() {
    let product = std::env::var("CIBAN_PRODUCT").unwrap_or_default();
    let icon = if product.is_empty() { "../tsf/resources/qingjian.ico" } else { "../../../../desktop/windows/resources/ciban.ico" };
    let name = match product.as_str() { "french" => "词伴 · 法语", "english" => "词伴 · 英语", _ => "青简" };
    let mut resource = winresource::WindowsResource::new();
    if let Ok(bin) = std::env::var("CIBAN_SDK_BIN") { resource.set_toolkit_path(&bin); }
    resource.set_icon(icon).set("ProductName", name).set("FileDescription", &format!("{name} 输入服务")).set("CompanyName", "Ciban Project");
    if !product.is_empty() {
        let version = std::env::var("CIBAN_VERSION").unwrap_or_else(|_| "0.1.0-demo.2".into());
        let numeric = 0x0000_0001_0000_0000 | version.rsplit('.').next().and_then(|part| part.parse::<u64>().ok()).unwrap_or(0);
        resource.set("FileVersion", &version).set("ProductVersion", &version)
            .set_version_info(winresource::VersionInfo::FILEVERSION, numeric)
            .set_version_info(winresource::VersionInfo::PRODUCTVERSION, numeric);
    }
    println!("cargo:rerun-if-changed={icon}");
    resource.compile().expect("嵌入产品图标与版本信息");
}

#[cfg(not(windows))]
fn embed_icon() {}
