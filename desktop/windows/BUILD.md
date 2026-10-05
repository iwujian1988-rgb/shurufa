# Windows 双产品构建与验证

2026-10-04：本机已生成 0.1.0-demo.1 英语、法语两个 Windows 11 x64 安装器。支持随包 x86 TSF DLL；不支持 32 位 Windows。源码与长期记忆以项目根目录 docs 为准。

## 环境

已验证 Rust stable 1.95.0、MSVC 14.44.35207、Windows SDK NuGet 10.0.26100.4948、Inno Setup 7.1.0 x64。上游 rust-toolchain.toml 保留其 1.96.0，项目脚本以 RUSTUP_TOOLCHAIN=stable 覆盖。本轮未修改依赖版本来绕过编译失败；未来 stable 升级需重新测试，复现本轮可指定 RUSTUP_TOOLCHAIN=1.95.0。

安装官方 Rust 与 Visual Studio C++ Build Tools（x64/x86），并从 [Inno 官方发布](https://github.com/jrsoftware/issrc/releases/tag/is-7_1_0) 安装 Inno Setup。使用 Developer PowerShell 或项目 rust-env.ps1。官方编译器不提交 Git，不要求安装测试证书或更改安全软件设置。

在项目根目录执行：

```powershell
$env:RUSTUP_TOOLCHAIN = '1.95.0'
rustup toolchain install 1.95.0 --profile minimal
rustup target add --toolchain 1.95.0 x86_64-pc-windows-msvc i686-pc-windows-msvc
./scripts/prepare-windows-sdk.ps1
./scripts/prepare-runtime-data.ps1
./scripts/build-windows.ps1 -Product both -InnoCompiler 'C:/Program Files/Inno Setup 7/ISCC.exe'
```

SDK 脚本下载固定官方 NuGet 包并检查 SHA-256；headers/rc/link libraries 在项目 .tools/，不修改系统 SDK。数据恢复脚本核验 data-v3 归档，只恢复中文词典、二元模型和英语释义。英法整理 TSV 与法语源在仓库中，pack-assets 生成桌面数据，不依赖已构建的安卓 assets。

WinUI 自包含运行时由锁定 windows-reactor-setup 0.100.0 恢复 Microsoft.WindowsAppSDK.Runtime 2.4.0 和 Microsoft.Web.WebView2 1.0.4078.44。随包清单是 upstream/apps/windows/installer/settings-runtime.txt，原许可在 desktop/windows/licenses/；微软运行时采用自身许可，并非 GPL 项目源码。首次构建需要访问 Cargo、固定 cosmic-text Git 修订和微软 NuGet。

每次产品切换必须重新构建 x64 Server、Settings、TSF 和 x86 TSF；不能复用上一语言 target/release。脚本不提供 SkipBuild。交叉构建时主进程保持 x64 LIB，仅 target linker wrapper 使用 x86 LIB，避免把 Cargo 的 x64 build script 链接到 x86 库。产品固定标识来自 products/windows.json，升级不能随意重新生成 GUID。

输出在 deliverables/ciban-{english,french}-0.1.0-demo.2-windows-x64-setup.exe；staging 与编译缓存被 Git 忽略。版本参数用于文件名和产品字符串；修改正式数字版本时同时更新 build.rs 和 installer.iss 的数值版本。

## 验证

```powershell
. ./scripts/rust-env.ps1
$env:CIBAN_PRODUCT = 'english' # 再切 french 重跑
cargo test --locked --manifest-path upstream/Cargo.toml -p ciban-lexicon -p qingjian-platform -p qingjian-render -p qingjian-windows-server -p qingjian-windows-tsf --lib
cargo build --locked --manifest-path upstream/Cargo.toml -p qingjian-windows-tsf --example ciban-smoke -p qingjian-windows-server --example ciban-render
./scripts/test-windows-pipe.ps1
cargo test --locked --manifest-path mobile/native/Cargo.toml --lib
```

真实 pipe 测试启动随包双 Server，加载对应 x64 DLL 的真实 COM factory，验证中文候选、读音译词、Ctrl+数字提交、取消和中文上屏。测试使用固定私有输入、隔离 APPDATA 和 ciban-smoke 测试管道，核验服务端 PID，测试后台不启动 UI；结束只清理本次启动的 PID。渲染 PNG 来自实际 Frame 和候选 row converter，属于离线渲染证据，不能称为系统截图。

仍需手工验收安装/启用/卸载/升级、记事本/浏览器/Office/32 位宿主、设置页实际窗口、多屏/DPI/候选定位、睡眠和长期压力。当前进程没有管理员权限，Computer Use 启动设置页审批超时，本轮未绕过权限执行系统安装或 UI 操作。x86 DLL 已编译，尚未验证 32 位宿主加载。

## 安全与发布

保持 uiAccess=false，默认云预测、输入内容日志、上游更新检查关闭。采用 Windows TSF 与标准 Inno，不加壳/混淆，不导入证书、不安装驱动、不修改 Defender。注册使用系统 regsvr32，当前用户启用使用微软 [InstallLayoutOrTip](https://learn.microsoft.com/en-us/windows/win32/tsf/installlayoutortip) flags=0，不替换系统默认输入法。

每次最终重新打包后，对安装器及解包 payload 重新扫描并更新哈希证据。Defender 没有检测不等于全部安全软件零误报，也不消除 unsigned SmartScreen 提示；正式分发需后续可信代码签名与正常信誉积累。不得把 EXE 直接挂到公开下载链接绕过既有一次性码策略。

新版法语 mmap 与中文原始词条保留审计：构建 upstream/crates/ciban-lexicon/examples/audit-french.rs，传入项目根目录、最终法语 staging/data/generated 和输出 JSON。校验全部 877 条新增法语及 55 条中文补充，并核对冻结原始词频覆盖。详见 deliverables/Windows法语补词与UI验收记录.md。
