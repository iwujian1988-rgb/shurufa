# 协作开发入口

仓库：https://github.com/iwujian1988-rgb/shurufa 。当前交付为 Android 0.5.0-demo，英语和法语两个独立安装包；iOS / PC 属于后续规划。先读 PROJECT_PROGRESS.md、TECHNICAL_PLAN.md 和 DEVELOPMENT_BACKLOG.md，再认领具体任务。文档中的历史验收不能视为当前或未来版本已验证。

## 取得源码

```powershell
git clone https://github.com/iwujian1988-rgb/shurufa.git
cd shurufa
```

不需要 init submodule：upstream/ 已包含锁定版本及本项目修改的源码。上游来源、提交及许可见 upstream-lock.json；本项目改动见 UPSTREAM_CHANGES.md。克隆到独立文件夹，避免与别的项目混用。

## Windows 构建准备

安装 Git、Node.js 20+、Rust stable（本机已验证 1.95.0）、Visual Studio C++ Build Tools 和完整 Windows SDK、兼容 Gradle 9.1 的 JDK（本机已验证 23）、Android SDK。Android Studio 中安装 SDK 36、Build Tools 36.0.0 和 NDK 28.2.13676358。

```powershell
rustup target add --toolchain stable aarch64-linux-android x86_64-linux-android
$env:JAVA_HOME = '你的 JDK 目录'
$env:ANDROID_HOME = '你的 Android SDK 目录'
./scripts/prepare-runtime-data.ps1
./scripts/build-demo.ps1
```

固定数据下载脚本会核对归档 SHA-256。首次 Cargo / Gradle 构建需要联网取得锁定依赖和工具；Git 不包含 SDK、编译器、依赖缓存、APK 或私钥。特殊 MSVC / SDK 安装位置可设置 CIBAN_MSVC_ROOT 与 CIBAN_WINDOWS_SDK_LIB，详见 BUILD.md。新机器完整构建尚未验证，当前已验证的是本机自动环境发现、数据恢复和 Rust 回归。

APK 输出到 deliverables/ciban-english-demo.apk 和 ciban-french-demo.apk。升级项目所有者已经安装的包需要原签名：使用 `-DebugKeystore <原密钥路径>` 或 CIBAN_DEBUG_KEYSTORE；不把私钥提交到仓库。其他开发者使用自己的测试设备和调试签名。

Android Studio 打开 mobile/android/，选择 englishDebug 或 frenchDebug。IDE 运行前需通过上述脚本生成 JNI 库和随包数据；单独打开 Android 工程不自动生成它们。

## 文件分工

| 任务 | 主要位置 | 核心验证 |
| --- | --- | --- |
| 键盘、设置、候选展示与输入兼容 | mobile/android/app/src/main/ | 双包 lint、试打页、真实系统输入法和跨应用操作 |
| 九宫格解析、排序、学习及 JNI | mobile/native/src/，upstream/crates/ | Rust 回归、JNI 验收与实际手机输入 |
| 英语词义、读音与短语 | data/english-*.tsv，scripts/build-english-data.cjs | 读音审计、实际资源覆盖、独立英语编辑校审 |
| 法语词典、词形与短语 | data/french-*，data/glossary-fr.tsv | 法语审计、实际资源覆盖、独立法语编辑校审 |
| 官网及一次性下载 | website/ | 本地后端测试、浏览器与临时测试码验收 |
| 项目交接与规划 | docs/，deliverables/ | 记录真实版本、范围、结果及剩余问题 |

双包共用逻辑。不要复制整个工程分别开发英语和法语；差异放产品配置和语言数据。新增 iOS / PC 客户端复用平台无关引擎，具体路线见 TECHNICAL_PLAN.md。

## 日常验证与提交

```powershell
. ./scripts/rust-env.ps1
cargo test --locked --manifest-path mobile/native/Cargo.toml
node --test website/test/server.test.mjs
```

默认 Rust 测试中一个大型词库对照测试为 ignored；不能把默认通过说成全部专项通过。涉及九宫格解码时按 BUILD.md 额外运行它。界面和输入行为变更须在真实输入法中操作验证；普通代码测试不能代替真机输入兼容验收。现有手机脚本需传自己的设备编号；部分历史脚本具有固定模拟器或布局假设，先读脚本再执行。

每人从 main 建自己的分支，一次提交围绕一个具体任务，通过 Pull Request 合入。AI 同样先读根 AGENTS.md；修改 upstream/ 还要读其中 CLAUDE.md 和 docs/contributing.md。提交后同步进度、受影响的使用文档与验收证据；有未验证项就明确保留。

无需共享 GitHub 密码：项目所有者通过仓库 Settings → Collaborators 邀请开发者；AI 使用各自获授权的仓库访问方式。正式签名、服务器管理和实际下载码由项目所有者保管，普通 Android 开发不需要这些资料。

## 公开仓库与私有发布资料

代码为 GPL-3.0-or-later；CFDICT 基础及派生数据单独保留 CC BY-SA 3.0 和署名。不要统一改标数据许可。项目尚处于 demo，不代表语言数据已独立校审或所有应用已兼容。

官网 https://maxnote.top/ciban/ 继续分发 APK。实际 100 个下载码、Cookie、私有码表、核销账本、服务器凭据和签名密钥不进 Git。已领取者仍能取得对应源码；源码仓库公开不消耗下载码。不要把正式 APK 作为 GitHub 静态文件或 Release 附件上传，否则会另建一个无下载码的安装包入口。

修改下载后端只用临时测试码，不能消耗正式 100 个码，也不能重建生产核销账本。网站源码可以协作，部署生产前保留已有一次性码状态和账本。
