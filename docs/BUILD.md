# Demo 构建与版本

0.5：字母主标签、候选卡复用/横滑分页、末音节补全索引、合并后注释。build-demo.ps1 采用 Kotlin in-process 编译。协作整理后支持 -AndroidSdk、-JavaHome、-NdkVersion、-DebugKeystore 参数；默认读取环境变量并复用当前用户已有的 debug.keystore。升级已有安装必须指定原 Debug 签名（cibanDebugKeystore）；私钥不入 Git 或源码归档。其他开发者生成自己的测试签名，不应卸载用户原包来绕过签名不一致。

Debug 真机性能：`node scripts/phone-performance.cjs <serial> english optimized`，法语将 english 换为 french；仅在自己的试打页触发合成输入，不是录制个人打字。脚本等待结果不超过两分钟，原始样本写入 deliverables/0.5-performance-*-optimized.json。基线使用 `.cache/baseline-english.apk`（0.4 功能加同一测量器），归档保留测量与哈希证明，不含 APK。

本轮真机回归脚本为 letters-phone-smoke.cjs、t9-phone-smoke.cjs、phone-data-upgrade.cjs 和 phone-handoff.cjs；模拟器使用 emulator-jni.cjs。实际词典旧/新解码对照：在 mobile/native 运行 `cargo test --locked --release --lib packed_dictionary_paths_match_reference -- --ignored --nocapture`，要求先生成 Android dict.qj。默认测试不自动读取生成的大词库；该专项在本轮已单独执行。

最终顺序：完成当前 APK 测量与真机检查 → phone-handoff → package-source.ps1 → final-manifest.cjs。最后的清单严格校验当前 APK 哈希与六项字母/候选真机检查、四项 T9/系统触摸、双包升级、两包性能、JNI、签名和测量器基线证明，不把旧 0.4 的全量数据验收当作新包验收。

0.4：build-demo.ps1 依次生成法语和英语数据，再打包两种读音学习表。新增 audit-english-release 审计实际 mmap 数据，phone-ui.cjs 等脚本测量高度/操作英语详情，layout-emulator-smoke.cjs 验证窄屏和横屏。新增界面测试会等待真实加载与旋转完成。MIUI 主窗口节点不包含系统 IME，系统触摸回归使用共享布局测得坐标，并验证实际输入框与 dumpsys 输入法显示状态，不伪称直接读取系统键盘按键节点。


上游锁定：`c08ae57cb88b6a4a46f4a5e9c1d6d11c5e69222e`，运行数据 data-v3，SHA-256 `42ad08fb2fe9f497c0ab191c120f05386f6adcc9d713c3283200aaed690e62f3`。

本次实际使用 Windows、Rust 1.95.0、JDK 23.0.2、Gradle 9.1.0、AGP 9.0.1（内置 Kotlin）、Android SDK 36 / Build Tools 36.0.0 / NDK 28.2.13676358。最低 API 26；APK 带 ARM64 与 x86_64，不包含旧 32 位手机架构。原生引擎按 release 优化，客户端为可直接安装的 debug 测试签名包。

0.3 历史记录（versionCode 3）：法语读音词典、短语、学习详情与旧学习数据迁移。手机使用 phone-data-upgrade.cjs、t9-phone-smoke.cjs、french-phone-smoke.cjs（均传设备标识）；模拟器使用 emulator-jni.cjs。MIUI 曾拦截新测试辅助包安装，主包升级与实际触摸验收不依赖辅助包。当前 JNI 辅助验收使用模拟器，不能标为 0.3 手机 instrumentation 通过。脚本操作本应用试打框，结果附实际 APK SHA；0.1/0.2 原始记录保留为历史。

上游 `rust-toolchain.toml` 要求 1.96.0。本项目独立桥接工作区使用本机 stable（实测为 1.95.0）编译成功，未降级或改写上游依赖版本；依赖版本见 `mobile/native/Cargo.lock`。`scripts/rust-env.ps1` 显式选择工具链，避免桌面上游自动切换。其他系统和 Rust 版本尚未验证。

## 当前 Windows 构建

1. 安装 Rust 安卓目标：`rustup target add aarch64-linux-android x86_64-linux-android`。
2. 安装 Visual Studio C++ Build Tools 和完整 Windows SDK。`rust-env.ps1` 读取开发者 PowerShell 的 LIB，或通过 vswhere 查找 MSVC 并自动选择有效 SDK；特殊安装可设置 CIBAN_MSVC_ROOT 和 CIBAN_WINDOWS_SDK_LIB。当前机器 SDK 曾缺少链接库，保留微软官方 NuGet `Microsoft.Windows.SDK.CPP.x64 10.0.26100.4948` 解包至 `.tools/windows-sdk-x64` 的回退方案，见 [官方包](https://www.nuget.org/packages/Microsoft.Windows.SDK.CPP.x64/10.0.26100.4948)。
3. 运行 `./scripts/prepare-runtime-data.ps1` 下载固定 data-v3 归档、严格核对上述 SHA 并解出四个所需文件；已下载的归档可用 `-ArchivePath <路径>`。Git 仓库不包含运行缓存；官网的完整源码归档附带固定数据，见 SOURCE_CONTENTS.md。
4. 设置 JAVA_HOME、ANDROID_HOME，运行 `./scripts/build-demo.ps1`，也可传入 `-AndroidSdk <目录> -JavaHome <目录>`。需要升级已有测试包时传 `-DebugKeystore <原密钥路径>`。脚本先执行 Rust 回归、打包数据、构建双架构原生库，再构建双语言 APK、测试 APK 与双包 lint。`-SkipNative` 只适用于原生库已构建且没有语义修改的情况。完整协作准备见 [COLLABORATION.md](COLLABORATION.md)。
5. 输出位于 `deliverables/`。日常升级保留相同签名；重新生成 debug 密钥后，Android 可能要求卸载旧测试包，会同时清除旧学习数据。

工程没有联网权限、生产签名密钥、账号或收费 API 调用。首次启动将固定资源复制到私有目录再 mmap。包和源数据都有版本；修改随包数据后须升级安装目录版本，不能让旧缓存继续冒充新数据。

构建会先运行 build-french-data.cjs，再 pack-assets 与 stamp-data-assets.cjs；运行目录按资源内容哈希隔离。FrenchLexicon 的实际 mmap 覆盖审计命令是 `cargo run --offline --manifest-path mobile/native/Cargo.toml --bin audit-french-release -- <项目绝对路径>`。运行前需加载 rust-env.ps1，生成文件须已打包。现有基础/短语源码与固定数据已在归档内，无须构建时调用翻译服务。

## 模拟器验收

模拟器安装在项目 `.tools/android-sdk/`，AOSP ATD API 35，1080×1920、420dpi、WHPX。`start-emulator.ps1` 启动无窗口实例，复用已有 platform-tools。

ATD 默认禁用绘制，查看真实截图前需在模拟器执行 `adb shell setprop debug.hwui.drawing_enabled 1`，再重启被测应用；这只影响测试镜像。相关说明见 [Android 官方测试文章](https://android-developers.googleblog.com/2021/10/whats-new-in-scalable-automated-testing.html)。

安装双包和各自 androidTest 包后运行 `am instrument -w dev.ciban.english.test/dev.ciban.ime.SmokeInstrumentation`，法语替换为 `dev.ciban.french.test`。它检查真实 JNI 与随包数据，并验证客户端点击，不能代替跨应用真机测试。

`node scripts/android-smoke.cjs` 在固定模拟器上测试应用内试打及真实 InputMethodService；保存 JSON 与截图。系统 IME 是独立窗口，旧版 uiautomator CLI 只返回应用窗口，脚本复用同一个 KeyboardView 在试打页观测的固定位置并通过宿主输入结果断言，坐标不适用于不同尺寸手机。

`scripts/appearance-smoke.ps1` 设置法语深色外观并截图，截图仍需人工视觉检查。对当前输入法执行 force-stop 时 Android 会回退至其他输入法；脚本重新选择词伴并断言实际选中标识，避免把系统默认键盘截图误当成产品截图。
