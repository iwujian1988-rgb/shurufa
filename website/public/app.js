const $ = id => document.getElementById(id);
const state = { authorized: false, sourceAuthorized: false, used: false, pending: false, language: 'english', platform: 'android', release: null };
const names = { english: '英语', french: '法语' };
const input = $('download-code');
function takeLinkCode() {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const code = fragment.get('code') || url.searchParams.get('code');
  if (!code) return false;
  input.value = code;
  // Remove the code from history/Referrer, while keeping it visible in this page's form.
  url.searchParams.delete('code'); url.hash = 'download';
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  return true;
}
const supplied = takeLinkCode();
let verificationId = 0, expiryTimer, verificationController;
function status(text, type = '') { $('unlock-status').textContent = text; $('unlock-status').className = `status ${type}`; }
function applySession(result) { state.authorized = result.authorized === true; state.sourceAuthorized = result.sourceAuthorized === true; state.used = result.used === true; render(); }
function artifactId() { return state.platform === 'windows' ? `windows-${state.language}` : state.language; }
function sourceId() { return state.platform === 'windows' ? 'source-windows' : 'source'; }
function render() {
  input.placeholder = state.authorized ? '此浏览器已验证，无需重新输入' : state.used ? '下载码已使用；可输入其他下载码' : '粘贴你的下载码';
  const windows = state.platform === 'windows';
  const file = state.release?.artifacts.find(f => f.id === artifactId());
  const source = state.release?.artifacts.find(f => f.id === sourceId());
  $('apk-download').innerHTML = `下载${names[state.language]}版 ${windows ? 'EXE' : 'APK'} <span aria-hidden="true">↓</span>`;
  $('file-note').textContent = file ? `${windows ? 'Windows' : 'Android'} ${names[state.language]}版 · ${(file.bytes / 1e6).toFixed(1)} MB · ${file.version || state.release.version}` : '正在加载所选版本…';
  $('release-title').textContent = `${windows ? 'Windows' : 'Android'} 测试版`;
  $('release-version').textContent = windows ? state.release?.windowsVersion || '0.1.0-demo.2' : state.release?.version || '0.5.0-demo';
  $('release-note').textContent = windows ? '支持 Windows 11 x64，附 32 位 TSF 组件。简洁候选面板、离线译词与独立英法版本。当前安装器未签名，可能提示未知发布者；系统安装及跨应用兼容仍需试用验证。' : '支持 Android 8.0 及以上、ARM64 / x86_64。九宫格与全键盘，长按已整理词条看详情。当前为测试签名，部分词义仍待语言编辑校审。';
  $('source-download').textContent = source ? `下载${windows ? 'Windows' : 'Android'}对应源码（${(source.bytes / 1e6).toFixed(1)} MB）` : '下载对应源码';
  document.querySelectorAll('input[name=language]').forEach(radio => {
    const item = state.release?.artifacts.find(f => f.id === (windows ? `windows-${radio.value}` : radio.value));
    radio.closest('label').querySelector('small').textContent = item ? `${(item.bytes / 1e6).toFixed(1)} MB` : '加载中';
  });
  $('install-step-1').textContent = windows ? '下载并运行 EXE' : '下载并安装 APK';
  $('install-note-1').textContent = windows ? '在 Windows 电脑下载对应语言安装器，核对版本与校验值，按安装向导操作。' : '用安卓浏览器打开；如系统询问，请为本次安装允许该浏览器安装应用。';
  $('install-note-2').textContent = windows ? '打开词伴设置，点击“在系统中启用词伴”。升级用户可点击“使用简洁浅色外观”。' : '在首页点“启用词伴”，进入系统设置启用对应语言版。';
  $('install-note-3').textContent = windows ? '按 Win + 空格选择词伴，在设置页试打 nihao、pingguo；法语也可试 pinggai。' : '在首页点“选择键盘”，先输入 nihao、xuexi 或 kafei 看看。';
  if (file) $('apk-hash').textContent = file.sha256;
  for (const [id, route] of [['apk-download', artifactId()], ['source-download', sourceId()]]) {
    const link = $(id);
    const allowed = id === 'source-download' ? state.sourceAuthorized && !!source && !state.pending : state.authorized && !!file && !state.pending;
    link.setAttribute('aria-disabled', String(!allowed));
    if (allowed) { link.href = `/ciban/download/${route}`; link.removeAttribute('tabindex'); }
    else { link.removeAttribute('href'); link.tabIndex = -1; }
  }
}
document.querySelectorAll('input[name=language]').forEach(radio => radio.addEventListener('change', () => { state.language = radio.value; render(); }));
document.querySelectorAll('input[name=platform]').forEach(radio => radio.addEventListener('change', () => { state.platform = radio.value; render(); }));
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => {
  const french = button.dataset.lang === 'french';
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('candidate-gloss').textContent = french ? 'café' : 'coffee'; $('other-gloss').textContent = french ? 'carte' : 'card'; $('third-gloss').textContent = french ? 'ouvrir' : 'open'; $('demo-language').textContent = french ? 'FR' : 'EN';
}));
async function unlock() {
  const attempt = ++verificationId;
  verificationController?.abort();
  const controller = new AbortController(); verificationController = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  clearTimeout(expiryTimer);
  const button = $('verify-button');
  button.disabled = true; button.textContent = '验证中';
  state.authorized = false; state.sourceAuthorized = false; render(); status('正在验证下载码…');
  try {
    const response = await fetch('/ciban/api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.value }), signal: controller.signal });
    const result = await response.json();
    if (attempt !== verificationId) return;
    applySession(result);
    if (!response.ok) { status(result.error || '验证未通过，请稍后再试。', 'error'); return; }
    status('已验证，可领取一个版本。开始下载后，此码立即失效。', 'success');
    expiryTimer = setTimeout(() => { state.authorized = false; state.sourceAuthorized = false; render(); status('本次验证已过期，未使用的码可重新验证；已使用的码不能再领取。'); }, result.expiresIn * 1000);
  } catch { if (attempt === verificationId) status('暂时无法连接，请检查网络后重试。', 'error'); }
  finally { clearTimeout(timeout); if (attempt === verificationId) { button.disabled = false; button.textContent = '验证'; } }
}
window.addEventListener('hashchange', () => {
  if (takeLinkCode()) { $('download').scrollIntoView(); unlock(); }
});
$('unlock-form').addEventListener('submit', event => { event.preventDefault(); unlock(); });
for (const id of ['apk-download', 'source-download']) $(id).addEventListener('click', async event => {
  event.preventDefault();
  const source = id === 'source-download';
  if (!(source ? state.sourceAuthorized : state.authorized) || state.pending) { input.focus(); return; }
  const route = source ? sourceId() : artifactId();
  state.pending = true; render();
  try {
    const response = await fetch('/ciban/api/session', { signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    applySession(result);
    if (!(source ? result.sourceAuthorized : result.authorized)) { status(result.used ? '下载码已使用，不能再次领取。中断时请在原浏览器下载列表继续。' : '授权已过期或下载码已停用，请重新验证。', 'error'); input.focus(); return; }
    // The download response independently checks authorization, including Range/HEAD.
    location.assign(`/ciban/download/${route}`);
    if (!source) {
      status('正在开始下载… 每个码只允许领取一个安装包。');
      // A download leaves this page open; refresh the consumed state without offering another APK.
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const check = await fetch('/ciban/api/session', { signal: AbortSignal.timeout(10000) });
        const refreshed = await check.json(); applySession(refreshed);
        if (refreshed.used) { status('已开始下载，下载码已使用。如中断，请在原浏览器下载列表续传。', 'success'); break; }
      }
    }
  } catch { status('暂时无法连接，请稍后重试。', 'error'); }
  finally { state.pending = false; render(); }
});
async function boot() {
  try {
    const response = await fetch('/ciban/api/release', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('release');
    state.release = await response.json(); render();
  } catch { status('版本信息暂时无法加载，请稍后重试。', 'error'); }
  if (verificationId) return;
  if (supplied) { $('download').scrollIntoView(); await unlock(); return; }
  try {
    const response = await fetch('/ciban/api/session', { signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (verificationId) return;
    applySession(result);
    if (state.authorized) status('此浏览器已验证，可领取一个版本；开始下载后此码失效。', 'success');
    else if (result.used) status('下载码已使用，不能再次领取。配套源码仍可下载。');
  } catch { status('暂时无法连接，请检查网络后重试。', 'error'); }
}
render(); boot();
