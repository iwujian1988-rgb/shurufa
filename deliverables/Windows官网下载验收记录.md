# Windows 官网共用下载码验收

日期：2026-10-05（Asia/Shanghai）。地址：https://maxnote.top/ciban/。

## 发布结果

同一页面选择 Android / Windows、英语 / 法语，四个安装包共用一次性额度。原码及专属链接继续有效，每码领取一个 APK 或 EXE；两平台各有对应源码，源码不占次数，已用码仍可获取。Windows 版本 0.1.0-demo.2，Android 保留 0.5.0-demo。

Windows 文件完整下载核验：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| 英语 EXE | 38,062,515 | b8f4c4fc682f07dc2b0d749477d5037fb9ad4ce5bde94ca4d3b07be860cdd410 |
| 法语 EXE | 36,495,973 | 0b3a13d668b282f6f69c83e8aa3fc6ad6a74e4ebe988eae4cc7667d697aa27c9 |
| Windows 对应源码 | 44,941,140 | 99b8bf138f14511559f6c0ecfcd9109572b0f8cfad7e12b06b66f6ed6265ee8b |

源码对应 f342f21a05c17de6be0782e9b16a35962aa64472，包含构建入口和许可。安装器未签名；上线下载验收不等于已完成安装和所有宿主兼容。

## 真实验证

- 18 项后端回归通过：原有单次核销、并发、失败关闭、撤销、源码与续传；新增 Android / Windows 跨平台并发、共用额度与重启续传。
- 正式 HTTPS 页面 320、390、768、1440 px：四种平台/语言组合路由及对应源码入口正确，无横向溢出、无 JS 错误，专属链接自动填入验证后保留本页输入并清除 URL 码。
- 六份私有文件未授权 GET / HEAD / Range 均 403，猜测 private 路径 404；验证与 HEAD 不消耗。
- 英语 EXE、Windows 源码完整流式下载，长度及 SHA-256 一致；法语 EXE 从 Chrome 实际点击下载按钮并保存，文件名、长度、SHA-256 均正确。
- Windows 下载后切到 Android、刷新、同码新浏览器验证和再次下载均不能恢复安装包额度。Android 与 Windows 两份源码仍可获得。
- 实际重启独立 ciban-download 服务后，已用码仍 410；原会话 Windows 英语 Range 续传成功，拼回完整文件 SHA-256 一致，完成后再次下载被拒绝。
- 原网站首页 200，独立词伴服务 active。部署前后原 100 个码及原核销记录保持；四个临时验收码已移除，正式码未被本轮测试消耗或停用。临时领取记录保留在账本，不清空历史。

## 发布维护

新目录 /opt/ciban-download/release-20261005-windows-v1，current 原子切换。旧 APK/源码原字节保留，六份文件在服务器逐一核对。生产核销账本仍在 /var/lib/ciban-download/redemptions.json；切换前备份位于 /opt/ciban-download/backup-before-windows-20261005，部署未替换账本。后台与本地 SHA-256：server.mjs 47170f5404cbe7fcc626c322c029a8436d298df3a72290133c4c72a6b4c9aff5；redemption-store.mjs 4260d14ddc96ff9e2440762b85c38b629bb1370d4827c491f0ae6f4e88956684。

后续维护继续保留最新码表/停用状态/核销记录；不要回退到不认识 windows-english/windows-french 记录的旧后端。新版发布须保留未完成续传所引用的文件字节。

详细网页截图、下载报告和临时授权仅在 website/test-results 私有目录；公共记录不含明文码或 Cookie。安装包不提交公共 Git，仍通过同一授权入口分发。
