// 专属链接只验证、不下载；本地使用临时码，线上必须显式提供临时测试码文件。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createApp, hashCode } from '../server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/imwuj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let base = process.env.TEST_URL, code, fixtureRoot, server, browser;
const report = { checkedOn: new Date().toISOString(), checks: [] };
try {
  if (base) {
    if (!process.env.TEST_CODE_FILE) throw new Error('Online testing requires a temporary TEST_CODE_FILE; never use owner codes.');
    const fixture = JSON.parse(await readFile(process.env.TEST_CODE_FILE, 'utf8'));
    if (!fixture.id?.startsWith('TEST-LINK-')) throw new Error('Expected a dedicated temporary link-test code.');
    code = fixture.code;
  } else {
    code = 'CB-ABCDEF-GHJKLM-NPQRST-UVWXYZ';
    fixtureRoot = await mkdtemp(path.join(tmpdir(), 'ciban-link-test-'));
    await mkdir(path.join(fixtureRoot, 'artifacts'));
    await writeFile(path.join(fixtureRoot, 'codes.json'), JSON.stringify([{ id: 'TEST-LINK-local', hash: hashCode(code), revoked: false }]));
    await writeFile(path.join(fixtureRoot, 'release.json'), JSON.stringify({ version: 'test', artifacts: ['english', 'french', 'source'].map(id => ({ id, filename: id + '.bin', bytes: 4, sha256: '0'.repeat(64) })) }));
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    server = await createApp({ privateDir: fixtureRoot, origin, secure: false });
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    base = origin + '/ciban/';
  }
  report.url = base;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  let downloads = 0;
  for (const width of [390, 1440]) {
    for (const mode of ['fragment', 'query', 'same-page-fragment']) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', () => errors.push('JavaScript error'));
      await page.route('**/ciban/download/**', route => { downloads++; return route.abort(); });
      if (mode === 'same-page-fragment') await page.goto(base, { waitUntil: 'networkidle' });
      const link = mode === 'query' ? base + '?code=' + encodeURIComponent(code) : base + '#code=' + encodeURIComponent(code);
      await page.goto(link, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.getElementById('apk-download').getAttribute('aria-disabled') === 'false');
      assert.equal(await page.locator('#download-code').inputValue() === code, true, 'Verified link code must remain visible');
      assert.equal(page.url().includes(code), false, 'Code must be removed from the URL');
      assert.match(await page.locator('#unlock-status').textContent(), /已验证/);
      assert.equal(await page.locator('#source-download').getAttribute('aria-disabled'), 'false');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await page.locator('input[value=french]').check();
      assert.match(await page.locator('#apk-download').textContent(), /法语/);
      assert.equal(await page.locator('#download-code').inputValue() === code, true);
      if (width === 390 && mode === 'fragment') {
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.getElementById('apk-download').getAttribute('aria-disabled') === 'false');
        assert.match(await page.locator('#download-code').getAttribute('placeholder'), /已验证/);
      }
      report.checks.push({ width, mode, codeRemainsVisible: true, codeScrubbedFromUrl: true, verified: true, noOverflow: true });
      await context.close();
    }
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route('**/ciban/download/**', route => { downloads++; return route.abort(); });
  await page.goto(base + '#code=bad', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('unlock-status').classList.contains('error'));
  assert.equal(await page.locator('#download-code').inputValue(), 'bad');
  assert.equal(await page.locator('#apk-download').getAttribute('aria-disabled'), 'true');
  await page.locator('#download-code').fill(code);
  await page.locator('#verify-button').click();
  await page.waitForFunction(() => document.getElementById('apk-download').getAttribute('aria-disabled') === 'false');
  assert.equal(await page.locator('#download-code').inputValue() === code, true);
  await context.close();
  report.checks.push({ invalidLinkRetainedAndDenied: true, manualCorrectionVerifiedAndRetained: true });
  assert.equal(downloads, 0, 'Link tests must never initiate downloads');
  report.downloadRequests = downloads;
  if (fixtureRoot) {
    const ledger = JSON.parse(await readFile(path.join(fixtureRoot, 'state/redemptions.json'), 'utf8'));
    assert.equal(Object.keys(ledger.redemptions).length, 0);
    report.noRedemptions = true;
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/code-link-browser-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (fixtureRoot) {
    if (!fixtureRoot.startsWith(path.join(tmpdir(), 'ciban-link-test-'))) throw new Error('Unexpected test cleanup path');
    await rm(fixtureRoot, { recursive: true });
  }
}
