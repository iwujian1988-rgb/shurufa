//! Enable this registered product for the current user through Microsoft's supported API.
//! No default-input replacement, keyboard-list registry edits or elevated helper.
use windows::Win32::Foundation::FreeLibrary;
use windows::Win32::System::LibraryLoader::{LoadLibraryExW, GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32};
use windows::core::{BOOL, PCSTR, PCWSTR, HSTRING, w};

pub(crate) fn enable_profile() -> Result<(), String> {
    let module = unsafe { LoadLibraryExW(w!("input.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32) }.map_err(|e| e.to_string())?;
    let result = (|| {
        let address = unsafe { GetProcAddress(module, PCSTR(c"InstallLayoutOrTip".as_ptr().cast())) }.ok_or("系统输入法启用接口不可用")?;
        let enable: unsafe extern "system" fn(PCWSTR, u32) -> BOOL = unsafe { std::mem::transmute(address) };
        let profile = HSTRING::from(format!("0x0804:{}{}", qingjian_platform::product::CLSID, qingjian_platform::product::PROFILE));
        // Flags=0 adds only this profile. Never use DEFPROFILE or CLEANINSTALL.
        if unsafe { enable(PCWSTR(profile.as_ptr()), 0) }.as_bool() { Ok(()) }
        else { Err("无法启用词伴。请先完成安装；仍未出现时注销后重新登录，再点击启用。".to_owned()) }
    })();
    let _ = unsafe { FreeLibrary(module) };
    result
}
