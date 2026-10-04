import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const base = 'https://maxnote.top/ciban/';
const codes = JSON.parse(await readFile('private/validation-codes.json', 'utf8'));
const release = JSON.parse(await readFile('private/release.json', 'utf8'));
const stage = process.argv[2];
const request = (p, o = {}) => fetch(base + p, { ...o, signal: AbortSignal.timeout(180000) });
const unlock = async (code, cookie = '') => request('api/unlock', { method: 'POST', headers: { Origin: 'https://maxnote.top', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ code }) });
if (stage === 'browser') {
  const require = createRequire(import.meta.url);
  const { chromium } = require('C:/Users/imwuj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { checkedOn: new Date().toISOString(), url: base, checks: [] };
  try {
    for (const width of [320, 390, 768, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await ctx.newPage(); await page.goto(base, { waitUntil: 'networkidle' });
      await page.locator('#download-code').fill(codes[0].code); await page.locator('#verify-button').click();
      await page.waitForFunction(() => document.getElementById('apk-download').getAttribute('aria-disabled') === 'false');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.match(await page.locator('#code-help').textContent(), /一个安装包/);
      await page.screenshot({ path: `test-results/once-${width}.png` });
      report.checks.push({ width, verificationDoesNotConsume: true, noOverflow: true }); await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await ctx.newPage(); await page.goto(base + '#code=' + encodeURIComponent(codes[0].code), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('apk-download').getAttribute('aria-disabled') === 'false');
    await page.locator('input[value=french]').check();
    const event = page.waitForEvent('download'); await page.locator('#apk-download').click(); const download = await event;
    assert.equal(await download.failure(), null);
    const file = release.artifacts.find(f => f.id === 'french'); assert.equal(download.suggestedFilename(), file.filename);
    const filename = await download.path(); assert.equal((await stat(filename)).size, file.bytes);
    const hash = createHash('sha256'); for await (const c of createReadStream(filename)) hash.update(c); assert.equal(hash.digest('hex'), file.sha256);
    await page.waitForFunction(() => document.getElementById('apk-download').getAttribute('aria-disabled') === 'true');
    assert.equal(await page.locator('#source-download').getAttribute('aria-disabled'), 'false');
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.locator('#apk-download').getAttribute('aria-disabled'), 'true');
    report.checks.push({ actualFrenchDownload: true, hashVerified: true, apkDisabledAfterUseAndReload: true, sourceStillAllowed: true });
    const fresh = await browser.newContext(); const second = await fresh.newPage();
    await second.goto(base + '#code=' + encodeURIComponent(codes[0].code), { waitUntil: 'networkidle' });
    await second.waitForFunction(() => document.getElementById('unlock-status').textContent.includes('已使用'));
    assert.equal(await second.locator('#apk-download').getAttribute('aria-disabled'), 'true');
    const head = await fresh.request.head(base + 'download/source'); assert.equal(head.status(), 200);
    report.checks.push({ sameCodeInAnotherBrowserDenied: true, sourceWithUsedCode: 200 });
    await fresh.close(); await ctx.close();
    await writeFile('test-results/single-use-browser-report.json', JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify(report) + '\n');
  } finally { await browser.close(); }
} else if (stage === 'prepare') {
  const health = await (await request('health')).json(); assert.equal(health.downloadPolicy, 'single-use');
  assert.equal((await request('download/english')).status, 403);
  const authorized = await unlock(codes[1].code); assert.equal(authorized.status, 200);
  const cookie = authorized.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('download/english', { method: 'HEAD', headers: { Cookie: cookie } })).status, 200);
  assert.equal((await unlock(codes[1].code)).status, 200);
  const part = await request('download/english', { headers: { Cookie: cookie, Range: 'bytes=0-1023' } }); assert.equal(part.status, 206);
  const prefix = Buffer.from(await part.arrayBuffer()).toString('base64');
  await writeFile('private/validation-resume.json', JSON.stringify({ cookie, prefix }), { mode: 0o600 });
  assert.equal((await unlock(codes[1].code)).status, 410);
  process.stdout.write('Single-use claim saved; HEAD did not consume; used code denied. Ready for server restart.\n');
} else if (stage === 'resume') {
  const receipt = JSON.parse(await readFile('private/validation-resume.json', 'utf8'));
  for (const c of codes) assert.equal((await unlock(c.code)).status, 410);
  const response = await request('download/english', { headers: { Cookie: receipt.cookie, Range: 'bytes=1024-' } }); assert.equal(response.status, 206);
  const hash = createHash('sha256'); const prefix = Buffer.from(receipt.prefix, 'base64'); hash.update(prefix); let bytes = prefix.length;
  for await (const chunk of response.body) { hash.update(chunk); bytes += chunk.length; }
  const expected = release.artifacts.find(f => f.id === 'english'); assert.equal(bytes, expected.bytes); assert.equal(hash.digest('hex'), expected.sha256);
  for (let i = 0; i < 20; i++) { const info = await (await request('api/session', { headers: { Cookie: receipt.cookie } })).json(); if (!info.resumable) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.equal((await request('download/english', { headers: { Cookie: receipt.cookie, Range: 'bytes=1024-' } })).status, 410);
  const homepage = await fetch('https://maxnote.top/'); assert.equal(homepage.status, 200);
  const report = { checkedOn: new Date().toISOString(), usedCodeAfterRestart: 410, resumeAfterRestart: 206, englishBytes: bytes, englishSha256: expected.sha256, replayAfterCompletion: 410, originalHomepage: 200 };
  await writeFile('test-results/single-use-restart-report.json', JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report) + '\n');
} else { throw new Error('Use browser | prepare | resume with temporarily installed validation codes. Never run these with the 100 owner codes.'); }
