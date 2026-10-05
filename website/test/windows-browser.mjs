// Website regression using synthetic input and a dedicated temporary code; never owner codes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp, hashCode} from '../server.mjs';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/imwuj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let server, root, browser;
let base = process.env.TEST_URL;
let code = 'CB-ABCDEF-GHJKLM-NPQRST-UVWXYZ';
const report = {checkedAt:new Date().toISOString(),downloadRequests:0,checks:[]};
try {
  if (base) {
    const fixture = JSON.parse(await readFile(process.env.TEST_CODE_FILE, 'utf8'));
    assert.ok(fixture.id.startsWith('TEST-WINDOWS-')); code = fixture.code;
  } else {
    root = await mkdtemp(path.join(tmpdir(),'ciban-windows-browser-'));
    await mkdir(path.join(root,'artifacts'));
    await writeFile(path.join(root,'codes.json'),JSON.stringify([{id:'TEST-WINDOWS-browser',hash:hashCode(code),revoked:false}]));
    const release = JSON.parse(await readFile(new URL('../private/release.json',import.meta.url),'utf8'));
    await writeFile(path.join(root,'release.json'),JSON.stringify(release));
    server = await createApp({privateDir:root,origin:'http://127.0.0.1:3187',secure:false});
    await new Promise(resolve=>server.listen(3187,'127.0.0.1',resolve)); base='http://127.0.0.1:3187/ciban/';
  }
  browser = await chromium.launch({channel:'chrome',headless:true});
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  for (const width of [320,390,768,1440]) {
    const context = await browser.newContext({viewport:{width,height:900}});
    const page = await context.newPage(); const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/ciban/download/**',route=>{report.downloadRequests++;return route.abort();});
    await page.goto(base+'#code='+encodeURIComponent(code),{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.getElementById('apk-download').getAttribute('aria-disabled')==='false');
    assert.equal(await page.locator('#download-code').inputValue(),code);
    assert.ok(!(new URL(page.url())).hash.includes(code));
    for (const platform of ['android','windows']) {
      await page.locator(`input[name=platform][value=${platform}]`).check({force:true});
      for (const language of ['english','french']) {
        await page.locator(`input[name=language][value=${language}]`).check({force:true});
        const id=platform==='windows'?`windows-${language}`:language;
        assert.equal(await page.locator('#apk-download').getAttribute('href'),'/ciban/download/'+id);
        assert.equal(await page.locator('#source-download').getAttribute('href'),'/ciban/download/'+(platform==='windows'?'source-windows':'source'));
        assert.match(await page.locator('#apk-download').innerText(),platform==='windows'?/EXE/:/APK/);
        assert.match(await page.locator('#file-note').innerText(),platform==='windows'?/0.1.0-demo.2/:/0.5.0-demo/);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
      }
    }
    await page.locator('#download').scrollIntoViewIfNeeded();
    await page.screenshot({path:new URL(`../test-results/windows-download-${base.startsWith('https')?'online':'local'}-${width}.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')});
    assert.deepEqual(errors,[]);
    report.checks.push({width,platformLanguageRoutes:'four correct',sourceRoutes:'correct',codePreserved:true,noOverflow:true,noJsErrors:true});
    await context.close();
  }
  assert.equal(report.downloadRequests,0);
  await writeFile(new URL(`../test-results/windows-browser-${base.startsWith('https')?'online':'local'}.json`,import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(root){assert.ok(root.startsWith(path.join(tmpdir(),'ciban-windows-browser-')));await rm(root,{recursive:true});}
}
