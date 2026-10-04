# Windows 0.1.0-demo.1 验收记录

日期 2026-10-04，Windows 11 x64。本次完成两个可供安装测试的 EXE，不等同完整系统输入法产品验收。

| 检查 | 结果与证据 |
| --- | --- |
| 英法 x64 Server / Settings / TSF | Release 构建完成；各包包含独立服务器、设置和 TSF |
| x86 TSF | Release 编译完成，尚未在 32 位宿主加载 |
| 英语核心测试 | 68 通过，windows-evidence/english-rust-tests.txt |
| 法语核心测试 | 68 通过，windows-evidence/french-rust-tests.txt |
| 安卓共享核心回归 | 10 通过 / 1 专项忽略；共享 lexicon 另 3 项已包含桌面测试 |
| 实际 IPC / x64 COM | 两个最终 shipping Server 同时启动；分别连接 session pipe，真实 DLL factory 创建 ITfTextInputProcessor 成功 |
| 词义与输入 | nihao/pingguo/xiexie/yinhang；显示译词与 Ctrl+数字提交相同；Esc 取消、空格中文提交通过 |
| 数据隔离 / 隐私默认 | 两个独立目录/CLSID/profile/pipe，默认 input_log=false、check=false；固定私有回归未生成输入日志 |
| 候选字体 / 主题 | 英法 light/dark、100%/150% 实际 Frame 离线 PNG；人工查看中文、法语重音可见，无文字截断。不是实屏截图 |
| Defender | 两个最终 EXE 与解包目录 custom scan；结果/签名版本/哈希见 antivirus.json；不证明其他安全引擎结果 |
| 系统注册与输入法切换 | 待用户实际安装测试；本轮未执行管理员安装 |
| 设置页实屏 | 未验收：Computer Use app approval timed out，无运行截图证据 |
| 升级/卸载/Office/UWP/多屏/耗电 | 未完成，保留待办 |

真实 pipe 延迟为每产品 25 个固定热态请求：英语 p50 520µs / p95 2081µs，法语 493µs / 1764µs；见 *-pipe.txt。仅后台 IPC 到 Frame，不含物理按键、宿主 TSF 生命周期和屏幕呈现，不能拿它声称完整打字延迟小于 2ms。

测试程序在 upstream/apps/windows/{tsf,server}/examples，运行入口 scripts/test-windows-pipe.ps1。固定测试输入均为开发样例，不采集实际用户输入。最终安装器 SHA-256 以 windows-evidence/antivirus.json 与 SHA256SUMS-windows.txt 为准。

未签名，不安装测试证书、不降低安全设置、不上传到公共多引擎扫描平台。Windows 11 x64 为首轮范围；Windows 10、ARM64、macOS、iOS 不在本轮支持声明中。
