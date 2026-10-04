# 对固定上游的修改

基础提交见 `upstream-lock.json`。没有更换依赖版本或重写基础词库。九宫格在外层 Rust 桥接新增数字解码及跨读音合并，中文查询、释义、学习和上屏仍复用青简；具体边界见 TECHNICAL_PLAN.md。

- `candidate/language.rs` 增加 French、ISO `fr` 和配置别名及单元断言。
- `qingjian-predict/gloss/prompt.rs` 增加法语提示与拉丁扩展字符清洗分支。安卓 demo 不启用云兜底，此路径没有安卓运行验证，也没有调用付费模型。
- Windows 与 macOS 语言名称的穷尽匹配补上法语，避免新枚举破坏已有匹配编译；桌面完整构建尚未验证，桌面数据装配和产品标识隔离仍待后续实现。
- 本次移动端实现位于上游外 `mobile/`，以路径依赖复用 core/dictionary/format/translate/learning/lm；源码和数据对应交付。

同步上游前先审查差异，重跑原生回归、双包构建、JNI 测试和真实输入验收。禁止将最新 main 直接覆盖到已验证版本。

0.3 没有扩大上游修改。读音感知的 FrenchLexicon、独立许可数据装配与长按学习信息均在外层 mobile/ 和 data/；候选按原 core 查询，翻译由候选实际 syllables 覆写，不改变中文候选排序。未来其他平台需调用相同读音查询入口，不能直接加载词头合并的研究 TSV。
