// Run only with separately installed temporary TEST-WINDOWS codes, never owner codes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const base='https://maxnote.top/ciban/';
const fixtures=JSON.parse(await readFile(process.env.TEST_CODES_FILE,'utf8'));
assert.equal(fixtures.length,4); assert.ok(fixtures.every(f=>f.id.startsWith('TEST-WINDOWS-')));
const release=await (await fetch(base+'api/release')).json();
const file=id=>release.artifacts.find(f=>f.id===id);
const folder=new URL('../test-results/',import.meta.url);
await mkdir(folder,{recursive:true});
const unlock=async code=>{
  const response=await fetch(base+'api/unlock',{method:'POST',headers:{Origin:'https://maxnote.top','Content-Type':'application/json'},body:JSON.stringify({code})});
  return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]};
};
const get=(id,cookie,headers={})=>fetch(base+'download/'+id,{headers:{Cookie:cookie,...headers}});
const hashResponse=async(response,expected)=>{
  assert.equal(response.status,200); const h=createHash('sha256');let bytes=0;
  for await(const chunk of response.body){h.update(chunk);bytes+=chunk.length;}
  assert.equal(bytes,expected.bytes);assert.equal(h.digest('hex'),expected.sha256);
  return {id:expected.id,bytes,sha256:expected.sha256};
};
if(process.argv[2]==='resume'){
  const saved=JSON.parse(await readFile(new URL('../test-results/windows-resume-private.json',import.meta.url),'utf8'));
  const used=await unlock(fixtures[2].code);assert.equal(used.response.status,410);
  const response=await get('windows-english',saved.cookie,{Range:'bytes=1024-'});assert.equal(response.status,206);
  const h=createHash('sha256').update(Buffer.from(saved.prefix,'base64'));let bytes=1024;
  for await(const chunk of response.body){h.update(chunk);bytes+=chunk.length;}
  assert.equal(bytes,file('windows-english').bytes);assert.equal(h.digest('hex'),file('windows-english').sha256);
  assert.equal((await get('windows-english',saved.cookie)).status,410);
  assert.equal((await get('english',saved.cookie)).status,410);
  await writeFile(new URL('../test-results/windows-restart-online.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),restartRetainsConsumption:true,originalBrowserRangeResume:true,fullSha256Matches:true,completedReplayBlocked:true},null,2));
  console.log('Restart, original-session resume, full SHA-256 and repeat refusal passed');
}else{
  const report={checkedAt:new Date().toISOString(),checks:[],downloads:[]};
  for(const id of ['english','french','windows-english','windows-french','source','source-windows']){
    for(const method of ['GET','HEAD'])assert.equal((await fetch(base+'download/'+id,{method,headers:{Range:'bytes=0-10'}})).status,403);
    assert.equal((await fetch(base+'private/artifacts/'+file(id).filename)).status,404);
  }
  report.checks.push('All six artifacts reject unauthorized GET/HEAD/Range and guessed private paths');
  const first=await unlock(fixtures[0].code);assert.equal(first.response.status,200);
  const head=await fetch(base+'download/windows-english',{method:'HEAD',headers:{Cookie:first.cookie}});assert.equal(head.status,200);assert.match(head.headers.get('content-disposition'),/\.exe/);
  report.downloads.push(await hashResponse(await get('source-windows',first.cookie),file('source-windows')));
  report.downloads.push(await hashResponse(await get('windows-english',first.cookie),file('windows-english')));
  for(const id of ['english','french','windows-english','windows-french'])assert.equal((await get(id,first.cookie)).status,410);
  for(const id of ['source','source-windows'])assert.equal((await fetch(base+'download/'+id,{method:'HEAD',headers:{Cookie:first.cookie}})).status,200);
  const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/imwuj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
    const page=await context.newPage();await page.goto(base+'#code='+encodeURIComponent(fixtures[1].code),{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.getElementById('apk-download').getAttribute('aria-disabled')==='false');
    await page.locator('input[name=platform][value=windows]').check({force:true});
    await page.locator('input[name=language][value=french]').check({force:true});
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator('#apk-download').click()]);
    assert.equal(download.suggestedFilename(),file('windows-french').filename);
    const filename=path.resolve('test-results/windows-browser-downloaded.exe');await download.saveAs(filename);assert.equal(await download.failure(),null);
    const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(filename)){h.update(chunk);bytes+=chunk.length;}
    assert.equal(bytes,file('windows-french').bytes);assert.equal(h.digest('hex'),file('windows-french').sha256);
    report.downloads.push({id:'windows-french',via:'Chrome download button',bytes,sha256:file('windows-french').sha256});
    await page.waitForFunction(()=>document.getElementById('apk-download').getAttribute('aria-disabled')==='true');
    await page.locator('input[name=platform][value=android]').check({force:true});assert.equal(await page.locator('#apk-download').getAttribute('aria-disabled'),'true');
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#apk-download').getAttribute('aria-disabled'),'true');
    assert.equal((await unlock(fixtures[1].code)).response.status,410);
    report.checks.push('Chrome EXE download completes; Android switch, refresh and another browser cannot reuse code; source still available');
    await context.close();
  }finally{await browser.close();}
  const third=await unlock(fixtures[2].code);assert.equal(third.response.status,200);
  const prefix=await get('windows-english',third.cookie,{Range:'bytes=0-1023'});assert.equal(prefix.status,206);
  const buffer=Buffer.from(await prefix.arrayBuffer());assert.equal(buffer.length,1024);
  await writeFile(new URL('../test-results/windows-resume-private.json',import.meta.url),JSON.stringify({cookie:third.cookie,prefix:buffer.toString('base64')}));
  await writeFile(new URL('../test-results/windows-download-online.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
