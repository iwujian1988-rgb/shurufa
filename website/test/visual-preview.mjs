import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/imwuj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const [width, height] of [[1440, 1020], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3081/ciban/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(root, `test-results/hero-${width}.png`) });
    await page.close();
  }
} finally { await browser.close(); }
