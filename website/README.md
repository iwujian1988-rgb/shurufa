# 词伴独立下载官网

最新状态（2026-10-05）：官网同时提供 Android APK 和 Windows EXE，四个语言安装包共用每码一次领取额度，平台对应源码不扣次数。18 项后端回归、正式 HTTPS 浏览器及完整下载哈希、服务重启续传通过，正式码未被验收消耗，临时码已清理；详细更新见本文件末尾与 deliverables/Windows官网下载验收记录.md。

生产地址：`https://maxnote.top/ciban/`。与现有教育网站共用域名及 HTTPS，独立 Node.js 服务、独立目录，不依赖原网站登录或数据库。

## 内容与交互

- 中文候选旁显示英语或法语词汇的学习思路；重复接触研究为依据，不宣称词伴已有实验验证或固定记忆提升比例。
- 两个 Android 0.5.0-demo 包，Android 8.0+，测试签名；九宫格、全键盘、离线释义、长按已整理词条看学习信息。
- 英语 / 法语选择 → 输入下载码 → 验证 → 下载；附首次安装步骤、真实截图、常见问题、许可和 SHA-256。
- 无第三方字体、统计或远程资源；官网不收集输入法内的打字内容。

## 下载码

100 个下载码在 `private/下载码与专属链接-100个.csv`，JSON 在 `private/owner-codes.json`，仅供项目所有者保管。**不上传、不放 public、不提交 Git。**

每个码有 24 个密码学随机字符（120 bit），另有 CB 前缀与分隔符。**现在为一次性码：只能领取英语或法语中的一个 APK。** 验证、查看页面、HEAD 探测和失败的文件 / 范围检查不消耗次数；第一次有效 GET 发送安装包前立即持久核销。两个浏览器并发领取只会成功一个。换浏览器、刷新、重输或服务器重启均不会恢复已用码。此前可重复使用阶段没有次数记录，此规则从本次升级开始执行，不追溯推测历史下载。

同一次下载中断时，仅原浏览器 Cookie、原版本在 30 分钟内可以用 Range 续传；不允许重新发起完整下载，完成后也不能续传重下。不保证服务端能判断用户是否保存 / 安装成功；码在开始传输时核销，防止并发领取。持有码或链接的人都可第一次使用，下载后的文件也可以被分享；下载码控制本站入口。

对应源码不占 APK 次数。已用码再次验证会返回“已使用”、拒绝安装包，但仍提供配套源码授权，不需要额外买码，保持源码可获得性。

专属链接格式 `https://maxnote.top/ciban/#code=...`：fragment 不进入 HTTP 请求、服务器日志或 Referrer；前端读取后清掉 URL，POST 到校验接口。兼容 `?code=...`，但优先发 CSV 中的 fragment 链接。不要把私密码清单发给全部用户。

专属链接会自动填入并验证，验证成功或失败后均保留本页输入码，不再自动清空表单。URL 中的码仍立即移除，不持久存储明文码。已打开同一页面时再次进入专属链接也会处理；刷新后以已有 Cookie 的授权状态和输入框提示解释，无需再输入仍有效的码。

码表仅保存 SHA-256 哈希、编号及停用标志。验证后设置 Secure、HttpOnly、SameSite=Strict、`Path=/ciban/` 的随机 Cookie，30 分钟有效。每次 APK/源码请求（含 HEAD、Range）都校验授权。核销账本另外记录码哈希、授权 Cookie 哈希、选中版本、开始/完成时间和续传到期时间，不保存明文码或 Cookie。

生产账本在 `/var/lib/ciban-download/redemptions.json`，目录 0700、文件 0600，只有专用服务用户和 root 可读写。单一 Node 进程串行核销，临时文件写入 + fsync + 原子替换 + 目录 fsync 后才开始传输。已核销的续传授权可从账本恢复，重启不会让码复活。**不要启动多个 Node 进程共写同一账本，也不要删除/重建生产账本。** 生产 `REQUIRE_LEDGER=1`，账本缺失或损坏时拒绝启动，不自动重置次数。

无授权 403；私有文件与猜测路径 404；校验 15 次 / IP / 15 分钟限流。下载每 IP 最多 4 个并发、总计最多 32 个，流式传输。授权只在后端放行，APK 没有公开静态路径。

停用或恢复指定编号（在服务器以 root 运行）：

```bash
cd /opt/ciban-download/current
node scripts/manage-codes.mjs revoke 001
node scripts/manage-codes.mjs restore 001
```

脚本原子更新哈希表，保留文件属主 / 用户组。停用后安装包请求被拒绝，已有流不会被中途打断。恢复只是解除手动停用，**不会清除已核销记录**，不需要重启服务。已领取者的配套源码仍可获得。

## 本地运行及验证

Node.js 20+，无需 npm 安装依赖。正式版要求 HTTPS Secure Cookie。

```powershell
node scripts/prepare-release.mjs
node --test test/server.test.mjs
$env:SITE_ORIGIN='http://127.0.0.1:3081'
$env:COOKIE_SECURE='0'
node server.mjs
```

准备脚本核对 `../deliverables/manifest.json` 和实际文件 SHA-256，复制三个私有文件并保存 release 信息。已有码表时保留，**不要删掉 private 目录或重新生成已发放的码**。脚本不应把明文码打印到终端。

线上一次性检查：`test/single-use-online.mjs` 的 `browser / prepare / resume` 三阶段，使用另外生成并临时安装的验收码；**不要拿 100 个正式码跑下载测试**。browser 检查四种尺寸、真实法语下载、刷新和另一浏览器重用失败、源码保留；prepare 领取英语部分数据，重启服务后 resume 完整续传核对哈希并拒绝重下。临时验收码结束后从码表移除。旧的 `browser-download.mjs`、`online-release.mjs` 仅反映可重复使用阶段，应禁止直接拿正式码执行。截图和报告在 `test-results/`，不部署。

专属链接浏览器回归：`node test/code-link-browser.mjs`。需要 Chrome 与 Playwright，可通过 PLAYWRIGHT_MODULE 指定已有模块位置；默认使用本机 Codex 的模块。默认创建独立本地服务和临时码，检查手机 / 桌面 fragment、query、同页链接、刷新授权、错码和手动修正，禁止所有下载请求。线上检查须同时设置 TEST_URL 和 TEST_CODE_FILE；码文件必须含 `id: TEST-LINK-...` 与 code，必须是单独临时安装的验收码，不能拿正式 100 个码测试。验收后移除临时哈希并检查没有核销记录，不重置账本。输出 test-results/code-link-browser-report.json，不包含明文码。

## 部署隔离与维护

- `/opt/ciban-download/release-20261004-v1`：独立发布目录。
- `/opt/ciban-download/current`：当前发布软链接。
- `ciban-download.service`：systemd 自动启动，专用 `ciban-web` 用户，只监听 `127.0.0.1:3081`，文件系统只读，唯独 `/var/lib/ciban-download` 允许写核销账本；禁止提权，192 MB 内存上限。
- Nginx 只新增 `/ciban` 转向和 `/ciban/` 代理，原网站仍由原来的 `127.0.0.1:3000` 提供。配置修改前备份、测试失败恢复。
- 公共文件严格白名单；APK 和哈希表不在 public。部署压缩包严格列举文件，排除 owner-codes JSON、CSV、本地报告。
- 此路径关闭 Nginx access log，避免兼容 query 码进入日志。应用日志只打印启动状态和错误类别，不打印 URL、请求正文或 Cookie。
- 状态：`systemctl status ciban-download`；健康：`curl https://maxnote.top/ciban/health`。

更新 APK 时：更新 Android deliverables、manifest 及对应 GPL 源码 → 执行准备脚本保留现有码 → 发布文件包括 `server.mjs` 和 `redemption-store.mjs` → 核对 SHA → 原子切换 current → 重启词伴服务 → 用临时码验收。不要覆盖原网站应用或运行它的部署脚本。沿用线上码表的停用状态，永久保留发布目录以外的核销账本，并在维护前备份该账本。不要将旧空账本上传覆盖生产记录。旧包文件如存在未完成的有效续传，应保留到窗口结束，避免续传混入新版本字节。

源码提供与 APK 同等授权，遵守 GPL，下载码不撤销接收者的 GPL 权利。法语 CFDICT 派生数据保留 CC BY-SA 3.0 许可与署名，其他数据来源见源码和许可页。正式商用 / 商店发布仍需完成原计划中的词库许可确认、语言编辑校审、正式签名与兼容性工作。

## 研究引用

Uchihara, Webb & Yanagisawa (2019), *The Effects of Repetition on Incidental Vocabulary Learning: A Meta-Analysis of Correlational Studies*, Language Learning. https://doi.org/10.1111/lang.12343

网页仅概括“重复接触与词汇学习正相关，效果受注意力、已有知识、接触方式影响”。这不能直接推出词伴对记忆效率的实测提升。
## 2026-10-05：Windows 共用一次性下载控制

用户授权将 EXE 放入原官网，与安卓用同一套控制。官网保留 `/ciban/` 地址，先选 Android / Windows，再选英语 / 法语。原有 english/french/source 路由和文件保留；新增 windows-english/windows-french/source-windows。每个码在四个安装包中只能领取一个，Windows 与 Android 使用同一 Cookie、码表、串行核销队列和生产账本。HEAD/验证不消耗，开始有效 GET 前核销；Windows 续传同样绑定原浏览器、文件及 30 分钟窗口。两份平台对应源码均不扣次数，已用码仍可获取。

Windows 英语 EXE：38,062,515 字节，SHA-256 b8f4c4fc682f07dc2b0d749477d5037fb9ad4ce5bde94ca4d3b07be860cdd410；法语 EXE：36,495,973 字节，SHA-256 0b3a13d668b282f6f69c83e8aa3fc6ad6a74e4ebe988eae4cc7667d697aa27c9；对应源码：44,941,140 字节，SHA-256 99b8bf138f14511559f6c0ecfcd9109572b0f8cfad7e12b06b66f6ed6265ee8b，对应提交 f342f21a05c17de6be0782e9b16a35962aa64472。EXE 未签名，Defender 扫描通过不保证所有软件零误报；实际安装和跨应用验收边界沿用 Windows 记录。

发布目录 `/opt/ciban-download/release-20261005-windows-v1`；从上一目录复制原 APK/源码/最新码表，新增 EXE/源码和界面文件，核对六份私有文件哈希后原子切换 current，只重启词伴服务。生产账本仍在 `/var/lib/ciban-download/redemptions.json`，部署未上传、清空或替换账本。旧站首页/端口及 Nginx 路由不改。备份 `/opt/ciban-download/backup-before-windows-20261005` 保存切换前码表与账本。Windows 核销记录产生后，不能直接回退到只认识 APK artifact 的旧后端，也不能用旧账本覆盖；需保留当前兼容核销实现。

本地后端 18 项测试通过，新增跨平台并发/单额度/Windows 重启续传/源码不扣次数；四种尺寸 320/390/768/1440 的设备及语言选择、正确下载与源码路由、专属链接保留填入、无溢出/JS 错误通过。生产验收仅使用独立 TEST-WINDOWS 临时码；报告在 website/test-results（私有、不提交 Git），公开验收摘要见 deliverables/Windows官网下载验收记录.md。
