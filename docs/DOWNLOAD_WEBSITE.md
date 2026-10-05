# 词伴下载官网：需求、方案与验收

最新状态（2026-10-05）：官网同时提供 Android APK 和 Windows EXE，四个语言安装包共用每码一次领取额度，平台对应源码不扣次数。18 项后端回归、正式 HTTPS 浏览器及完整下载哈希、服务重启续传通过，正式码未被验收消耗，临时码已清理；详细更新见本文件末尾与 deliverables/Windows官网下载验收记录.md。

更新：2026-10-04。当前状态：官网已部署至 `https://maxnote.top/ciban/`，两份 APK 和对应源码上传完成；正式 HTTPS 保护、三份文件完整哈希与四种尺寸线上浏览器检查均通过。

最新规则：用户要求“下载码用一次就失效一次”。已从可重复使用改为每码领取一个 APK，详见下方核销更新。初次网站上线的验收属于旧规则，不能作为新核销语义的验证。

## 专属链接输入框修复（2026-10-04）

用户反馈点击链接后下载码仍为空。前端原本正确读取 fragment / query 并自动验证，但成功后主动清空表单，造成未填入的误解。现已保留本页输入码与明确的验证状态；仍立即从 URL 中移除码，不写 localStorage / sessionStorage。刷新后的已有 Cookie 授权由状态文案和输入框提示解释。新链接在同页通过 hashchange 读取并验证；新验证取消旧请求，旧响应不能覆盖当前 UI。

线上只原子替换 public/app.js，旧脚本有私有备份，服务无须重启。APK、服务器授权机制、原 100 个码和核销账本均不改。本轮测试没有领取安装包。

证据：website/test-results/code-link-browser-report.json（不提交 Git）。正式 HTTPS、Chrome 390 / 1440 px 各检查 fragment、query 和同页面专属链接：自动填入、验证后保留、URL 清除、切换语言和无横向溢出均通过；另验证刷新后的授权提示、错误码保留且拒绝下载，以及手动修正后成功且保留输入。0 下载请求。使用单独临时测试码，未使用用户提供的正式码。线上 app.js 与本地文件 SHA-256 一致，健康接口仍报告 single-use。原 15 项后端测试通过。

## 用户已确认要求

- 使用已有网站权限，独立做词伴下载官网；不要与其他项目混在一起。
- 文案围绕日常打字看到英法单词的记忆学习价值。
- 上传实际英语、法语 APK，提供用户下载。
- 生成 100 个随机下载码或专属 URL，未持有效授权不能下载。
- 已授权执行上传和部署，不需要再次询问上线许可。

## 已实现方案

代码目录：`../website/`。已有站点为 `https://maxnote.top/`，服务器现有应用仍由 3000 端口提供。新官网地址 `https://maxnote.top/ciban/`，独立 Node.js 20+ 服务、3081 回环端口、Nginx 单一路径代理、专用 systemd 用户，不改教育网站代码和登录逻辑。

页面：纸白与深绿的轻量布局；说明学习思路，英法示意切换、实际真机截图、语言版本选择、下载码验证、安装步骤、FAQ、源码与许可。研究引用来自重复接触的词汇学习元分析；不将通用研究写成词伴实测效果，不宣称“无需练习自动掌握”或固定提升比例。

下载：保留原 100 个 120 bit 随机码，现在每码只能领取英语或法语中的一个 APK。明文 CSV / JSON 仅本地；服务器码表保留编号、哈希、停用标志，另有独立持久账本记录核销。专属链接用 `#code=`，自动验证并清掉 URL 中的码；兼容 query。所有下载、HEAD、Range 都检查授权；APK 无公开静态路径。已经领取文件后的分享不在入口控制范围内，GPL 权利不被取消，配套源码不占 APK 次数，已用码仍可获取源码。

维护：根据编号停用 / 恢复，不需要重启。生成脚本重复执行时保留现有码；后续发布应沿用线上码表，防止恢复已停用码。见 `../website/README.md`。

## 此次发布文件

| 内容 | 版本 | 大小（字节） | SHA-256 |
|---|---|---:|---|
| 英语 APK | 0.5.0-demo | 38,510,126 | `3a9f13c856d77903662ec083b958931aa9b35c23c593e7acb39462ed4624017f` |
| 法语 APK | 0.5.0-demo | 36,023,842 | `77898775f8fb3ddea2b74eb01026d127b9b22dcf2900db85035407b317822a0c` |
| 对应 GPL 源码 | 0.5.0-demo | 80,161,050 | `5d6469f077556626adc4abe91b528b463f1050c220c37cdb8ab71526856f0ccb` |

两包仍为 Android Debug 测试签名；没有把上架、正式签名、全面兼容、词库语言校审或商用许可确认记成已完成。

## 初次上线的验证证据（可重复使用阶段）

- `website/test/server.test.mjs`：12 项通过，含未授权 GET/HEAD/Range、私有路径、非法码、跨源请求、Cookie 属性、流式下载、断点续传、伪造 Cookie、停用即时生效、过期、限流、发布软链接启动。
- `website/test-results/browser-report.json`：正式 HTTPS 页面 320、390、768、1440 px 均无横向溢出、无 JS 错误；语言预览、错码拒绝、有效码解锁、源码入口、专属链接清理和 HttpOnly 检查通过。
- `website/test-results/hero-1440.png`、`hero-390.png`：本地外观检查；不是线上下载验收证据。
- 随机码数量、唯一性和哈希表均为 100；Git 忽略明文、哈希表、二进制和测试截图。

`website/test-results/online-report.json`：线上公开页面 / 原首页 200，全部三份文件未经授权 GET/HEAD 为 403，私有路径 404，非法码 403、有效码 200，三份文件 Range 206；已完整下载英语、法语和对应源码，全部长度和 SHA-256 与上述清单一致。

`website/test-results/browser-download-report.json`：正式网址 390×844 手机布局，打开专属链接自动验证，选法语、实际点击下载按钮，浏览器完整取得 `ciban-french-demo.apk`；文件名、36,023,842 字节和 SHA-256 均正确。这是浏览器手机视口验收，不是物理手机安装验收；此前安卓真机安装记录另见 0.5 APK 验收文档。

## 部署记录

- 时间：2026-10-04 18:03（Asia/Shanghai）启用 `/ciban/` HTTPS 代理。
- 发布目录：`/opt/ciban-download/release-20261004-v1`，`current` 软链接指向该目录。
- 原 Nginx 配置备份：`/etc/nginx/conf.d/maxnote.conf.backup-ciban-20261004180341`。
- `ciban-download.service` enabled / active，专用用户 `ciban-web`，仅监听 `127.0.0.1:3081`。验收时约 29 MB 内存，0 次重启。
- 线上 `server.mjs` SHA-256 与本地一致：`a268bc43fe3c694b14229df9e827d7a9232164c013511adb8d08f7fcd4d0fe8b`。
- 初次健康检查暴露软链接启动判断问题：`argv[1]` 保留软链接、`import.meta.url` 使用真实路径。已改为双方 realpath 判断，补上回归测试，再启用代理；未在服务启动失败时改原站代理。
- 大型 `/tmp` 发布压缩包已清理；只部署下载码哈希，无明文下载码 CSV / JSON。

## 一次性核销更新（2026-10-04）

- 有效 APK GET 发送前核销；验证、HEAD、无效 Range / 未找到文件不会消耗码。首次 GET 可为 Range；一经核销，新浏览器、另一个版本、重新完整 GET 均返回 410。两个浏览器并发只能成功一个。
- 原领取 Cookie 哈希绑定版本，未完成时允许 30 分钟内 Range 续传；完整数据发送成功后写完成时间，后续 Range 也拒绝。此为同一次下载续传，不是重新发放次数。仅能判断服务器传输，不能证明用户保存 / 安装成功。
- `/var/lib/ciban-download/redemptions.json` 持久保存，目录 0700 / 文件 0600。原 100 个码表不重新生成；此前旧版没有下载次数账本，不推测或追溯历史消费。
- Node 单进程串行核销，写临时文件 → fsync → 原子替换 → 目录 fsync，完成后才发送。生产 REQUIRE_LEDGER=1；账本丢失或损坏拒绝启动，不静默重置次数。版本升级、恢复停用、维护和备份须保留账本。
- `ciban-download.service` 只增加 `/var/lib/ciban-download` 写权限，其余代码 / 安装包保持只读，原网站应用不改。
- 网站帮助、FAQ、用后按钮状态和源码授权已同步。源码可用已用码重新验证获得，避免领取 APK 后不能取得对应源码。
- `test/server.test.mjs`：新规则 15 项通过，含核销 / 并发 / 原浏览器续传 / 完成后重下 / 账本重启恢复 / 过期不复活 / 源码不扣次数 / 丢失损坏失败关闭。
- `test-results/single-use-browser-report.json`：正式网站四种尺寸无溢出，验证不消耗，专属链接实际下载法语 APK 哈希正确，用后与刷新后禁用领取，另一浏览器重用被拒绝，源码仍可获取。
- 使用两个临时验收码进行真实下载测试，不消费正式 100 个码。
- `test-results/single-use-restart-report.json`：实际重启独立服务后，两临时已用码仍返回 410；原 Cookie 的英语 Range 续传 206，拼回完整 38,510,126 字节并验证 SHA-256 正确；完成后重放 410，原站首页 200。验收结束临时码已从码表移除，原 100 个码保留；账本保留核销历史，不清空。
- 最后线上审计：100 个正式码、0 个临时码；正式码均未被本轮验收消耗或停用。`server.mjs` SHA-256 `605fa6360fe5ce801973e11ea678c64c1f7b6048a7c0e8010e68ed1a9b4aa196`，`redemption-store.mjs` SHA-256 `4dbbbc6fa821172522bd216ae8aff0c8def99fbb9a7840d1bddf3f8e0853d2c4`，均与本地一致。两个临时码的核销历史保留在账本中，但已不属于有效码表，不计算为正式码消费。
## 2026-10-05：Windows 共用一次性下载控制

用户授权将 EXE 放入原官网，与安卓用同一套控制。官网保留 `/ciban/` 地址，先选 Android / Windows，再选英语 / 法语。原有 english/french/source 路由和文件保留；新增 windows-english/windows-french/source-windows。每个码在四个安装包中只能领取一个，Windows 与 Android 使用同一 Cookie、码表、串行核销队列和生产账本。HEAD/验证不消耗，开始有效 GET 前核销；Windows 续传同样绑定原浏览器、文件及 30 分钟窗口。两份平台对应源码均不扣次数，已用码仍可获取。

Windows 英语 EXE：38,062,515 字节，SHA-256 b8f4c4fc682f07dc2b0d749477d5037fb9ad4ce5bde94ca4d3b07be860cdd410；法语 EXE：36,495,973 字节，SHA-256 0b3a13d668b282f6f69c83e8aa3fc6ad6a74e4ebe988eae4cc7667d697aa27c9；对应源码：44,941,140 字节，SHA-256 99b8bf138f14511559f6c0ecfcd9109572b0f8cfad7e12b06b66f6ed6265ee8b，对应提交 f342f21a05c17de6be0782e9b16a35962aa64472。EXE 未签名，Defender 扫描通过不保证所有软件零误报；实际安装和跨应用验收边界沿用 Windows 记录。

发布目录 `/opt/ciban-download/release-20261005-windows-v1`；从上一目录复制原 APK/源码/最新码表，新增 EXE/源码和界面文件，核对六份私有文件哈希后原子切换 current，只重启词伴服务。生产账本仍在 `/var/lib/ciban-download/redemptions.json`，部署未上传、清空或替换账本。旧站首页/端口及 Nginx 路由不改。备份 `/opt/ciban-download/backup-before-windows-20261005` 保存切换前码表与账本。Windows 核销记录产生后，不能直接回退到只认识 APK artifact 的旧后端，也不能用旧账本覆盖；需保留当前兼容核销实现。

本地后端 18 项测试通过，新增跨平台并发/单额度/Windows 重启续传/源码不扣次数；四种尺寸 320/390/768/1440 的设备及语言选择、正确下载与源码路由、专属链接保留填入、无溢出/JS 错误通过。生产验收仅使用独立 TEST-WINDOWS 临时码；报告在 website/test-results（私有、不提交 Git），公开验收摘要见 deliverables/Windows官网下载验收记录.md。
