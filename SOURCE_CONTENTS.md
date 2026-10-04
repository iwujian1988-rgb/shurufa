# Demo 源码归档说明

本页的 `.cache/source-vendor/` 和 `.cache/runtime-data/` 附带内容仅适用于官网提供的完整源码归档。GitHub 仓库不提交这些缓存：第三方 Rust 依赖按 mobile/native/Cargo.lock 恢复，运行数据通过 scripts/prepare-runtime-data.ps1 下载固定版本并校验 SHA-256。Git 中 upstream/ 为完整可编辑源码副本（包含本项目修改），不是子模块。协作步骤见 docs/COLLABORATION.md。

本归档对应词伴 Android 0.5.0 demo 的双语言客户端与共享原生引擎，代码按 GPL-3.0-or-later。固定上游和本项目修改在 upstream/，移动客户端与 JNI 在 mobile/，九宫格在 mobile/native/src/t9/，法语读音查询在 mobile/native/src/french.rs，英语读音学习与保护在 mobile/native/src/english.rs；构建见 docs/BUILD.md。基础法语数据与其派生数据单独采用 CC BY-SA 3.0，不因源码归档而改标为 GPL。

所有锁定 Rust 第三方包的源代码与许可在 `.cache/source-vendor/`（包含非 Android 构建目标的依赖）。`mobile/native/Cargo.lock` 记录精确版本。若希望只从归档构建 Rust，可在项目根目录创建 `.cargo/config.toml`：

```toml
[source.crates-io]
replace-with = "vendored-sources"
[source.vendored-sources]
directory = ".cache/source-vendor"
```

从根目录运行 Cargo 时可直接使用该路径；若进入 `mobile/native/`，相应 directory 改为 `../../.cache/source-vendor`。SDK、编译器、Gradle 插件等通用开发工具需自行准备，构建脚本内路径按本机配置。

使用的固定运行数据已附在 `.cache/runtime-data/data/generated/`。法语可编辑 TSV 在 `data/glossary-fr.tsv`，英语释义 TSV 在 `upstream/assets/glossary/glossary-en.tsv`；上游词库源和生成工具也保留。LM 来源为维基与 LCCC 二元统计，许可和署名随数据说明保留；数据不因归档而全部改成代码许可。

0.3 法语源与可编辑记录：data/french-research/ 保留官方 U8、许可、原始读音/义项和解析审计；data/french-phrases.tsv/french-polyphones.tsv 为项目 AI 整理；data/french-release/ 包含独立许可的 base/lessons TSV、统计与审核队列。build-french-data.cjs 可重建数据，再由 pack-assets.rs 生成 mmap，stamp-data-assets.cjs 生成安装目录内容版本。全部尚未独立编辑校审。

原生 `.so`、APK、构建缓存、debug 签名密钥、Git 内部目录及机器 local.properties 不在源归档中。打包时重新从上述源和固定数据构建。源码包含上游未使用的桌面及神经模型模块，安卓 demo 仅使用 `docs/TECHNICAL_PLAN.md` 标明的依赖。

0.4 新增英语独立学习真源、生成的读音记录/保护表、审核队列和构建器，均为 GPL-3.0-or-later。CFDICT 法语基础数据继续保留 CC BY-SA 3.0。当前最终验证以 0.4 记录和 APK 哈希为准；归档内历史 0.2/0.3 文字不可视为当前包的验证。

0.5 新增字母九宫格、候选复用/分页、解码索引、冻结旧解码器测试参照和 Debug 合成输入性能测量。最新验收只采用 0.5 记录与 APK 哈希，以上 0.4 段落为历史说明。调试证书私钥不随源码分发；覆盖安装需使用本机原调试证书，通过 cibanDebugKeystore 参数指定。
