# Demo 数据说明

法语 `glossary-fr.tsv` 为本轮 AI 直接按中文词义编写的有限日常示例，未经过独立法语编辑校审，不是完整或已验证词典。名词带冠词辅助辨认性别；多义词只列常见对应词，不能替代句子翻译。缺释义仍保留中文输入，明确显示“暂无释义”。本项目新增示例按 GPL-3.0-or-later 提供。

英语释义为锁定上游的 DeepSeek 离线生成表，不能声称已人工校审。中文词库和二元模型来自上游 data-v3，SHA-256 见上游 `tools/release/data.lock`。词库有官方表转录、THUOCL MIT、Unihan Unicode v3；其中部分转录来源未附独立许可，商用发布前仍须核实。模型来自中文维基 CC BY-SA 4.0 与 LCCC MIT；保留出处和修改信息，相关数据按来源许可提供。

代码 GPL 与数据授权分别记录。原名称、logo 不在上游代码授权范围内，客户端暂用“词伴”及新图标。具体原文与出处随 APK assets/licenses 和源码交付。

`french-research/` 保留官方 CFDICT、研究转换及来源审计，相关数据采用 CC BY-SA 3.0，见 LICENSE-CFDICT.md 与 CC-BY-SA-3.0.txt，不适用项目自编示例的 GPL 数据声明。

0.3 实际随包数据来自 `french-release/base.tsv` 与 `lessons.tsv`：base 是 CFDICT 按读音分组、去重、过滤纯引用后的结构化数据，仍按 CC BY-SA 3.0；lessons 来自原示例与项目按中文编写的 french-phrases.tsv/french-polyphones.tsv，按 GPL-3.0-or-later。分表 mmap 打包，不合并改标许可证。完整出处、学习信息、审核状态与源行号在相应记录中；应用“关于”和基础词典详情展示官方出处。新版审核队列与统计见 french-release/manifest.json 和 docs/FRENCH_DICTIONARY_PLAN.md。所有新增词条仍未由独立法语编辑校审。
