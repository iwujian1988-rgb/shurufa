const $ = id => document.getElementById(id);
const state = { authorized: false, sourceAuthorized: false, used: false, pending: false, language: 'english', release: null };
const names = { english: '英语', french: '法语' };
const input = $('download-code');
const initial = new URL(location.href);
const fragment = new URLSearchParams(initial.hash.slice(1));
const supplied = fragment.get('code') || initial.searchParams.get('code');
// Fragments stay out of HTTP/access logs. Also accept and promptly scrub query codes.
if (supplied) { input.value = supplied; initial.searchParams.delete('code'); initial.hash = 'download'; history.replaceState(null, '', initial.pathname + initial.search + initial.hash); }
function status(text, type = '') { $('unlock-status').textContent = text; $('unlock-status').className = `status ${type}`; }
function applySession(result) { state.authorized = result.authorized === true; state.sourceAuthorized = result.sourceAuthorized === true; state.used = result.used === true; render(); }
function render() {
  const file = state.release?.artifacts.find(f => f.id === state.language);
  $('apk-download').innerHTML = `下载${names[state.language]}版 APK <span aria-hidden="true">↓</span>`;
  $('file-note').textContent = `${names[state.language]}版 · ${file ? (file.bytes / 1e6).toFixed(1) : state.language === 'english' ? '38.5' : '36.0'} MB · ${state.release?.version || '0.5.0-demo'}`;
  if (file) $('apk-hash').textContent = file.sha256;
  for (const [id, route] of [['apk-download', state.language], ['source-download', 'source']]) {
    const link = $(id);
    const allowed = id === 'source-download' ? state.sourceAuthorized : state.authorized && !state.pending;
    link.setAttribute('aria-disabled', String(!allowed));
    if (allowed) { link.href = `/ciban/download/${route}`; link.removeAttribute('tabindex'); }
    else { link.removeAttribute('href'); link.tabIndex = -1; }
  }
}
document.querySelectorAll('input[name=language]').forEach(radio => radio.addEventListener('change', () => { state.language = radio.value; render(); }));
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => {
  const french = button.dataset.lang === 'french';
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('candidate-gloss').textContent = french ? 'café' : 'coffee'; $('other-gloss').textContent = french ? 'carte' : 'card'; $('third-gloss').textContent = french ? 'ouvrir' : 'open'; $('demo-language').textContent = french ? 'FR' : 'EN';
}));
async function unlock() {
  const button = $('verify-button');
  button.disabled = true; button.textContent = '验证中';
  state.authorized = false; state.sourceAuthorized = false; render(); status('正在验证下载码…');
  try {
    const response = await fetch('/ciban/api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.value }), signal: AbortSignal.timeout(12000) });
    const result = await response.json();
    applySession(result);
    if (!response.ok) { status(result.error || '验证未通过，请稍后再试。', 'error'); if (result.sourceAuthorized) input.value = ''; return; }
    input.value = '';
    status('已验证，可领取一个版本。开始下载后，此码立即失效。', 'success');
    setTimeout(() => { state.authorized = false; state.sourceAuthorized = false; render(); status('本次验证已过期，未使用的码可重新验证；已使用的码不能再领取。'); }, result.expiresIn * 1000);
  } catch { status('暂时无法连接，请检查网络后重试。', 'error'); }
  finally { button.disabled = false; button.textContent = '验证'; }
}
$('unlock-form').addEventListener('submit', event => { event.preventDefault(); unlock(); });
for (const id of ['apk-download', 'source-download']) $(id).addEventListener('click', async event => {
  event.preventDefault();
  const source = id === 'source-download';
  if (!(source ? state.sourceAuthorized : state.authorized) || state.pending) { input.focus(); return; }
  state.pending = true; render();
  try {
    const response = await fetch('/ciban/api/session', { signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    applySession(result);
    if (!(source ? result.sourceAuthorized : result.authorized)) { status(result.used ? '下载码已使用，不能再次领取。中断时请在原浏览器下载列表继续。' : '授权已过期或下载码已停用，请重新验证。', 'error'); input.focus(); return; }
    // The download response independently checks authorization, including Range/HEAD.
    location.assign(`/ciban/download/${source ? 'source' : state.language}`);
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
  if (supplied) { await unlock(); return; }
  try {
    const response = await fetch('/ciban/api/session', { signal: AbortSignal.timeout(10000) });
    const result = await response.json(); applySession(result);
    if (state.authorized) status('此浏览器已验证，可领取一个版本；开始下载后此码失效。', 'success');
    else if (result.used) status('下载码已使用，不能再次领取。配套源码仍可下载。');
  } catch { status('暂时无法连接，请检查网络后重试。', 'error'); }
}
render(); boot();
