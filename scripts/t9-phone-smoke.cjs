// 在用户连接的手机、仅词伴试打输入框内验证实际触摸和系统输入法。
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const adb = path.join(root, '.tools/android-sdk/platform-tools/adb.exe');
const serial = process.argv[2];
if (!serial) throw new Error('Pass the connected phone serial');
const out = path.join(root,'deliverables');
const results=[];
function run(args) { return execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}); }
function nodes() {
  run(['shell','uiautomator','dump','/sdcard/ciban-t9.xml']);
  const local=path.join(root,'.cache','phone-t9.xml'); run(['pull','/sdcard/ciban-t9.xml',local]);
  return [...fs.readFileSync(local,'utf8').matchAll(/<node\s+([^>]+)>?/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2].replace(/&#10;/g,'\n').replace(/&amp;/g,'&').replace(/&apos;/g,"'")])));
}
function tap(node) {
  if(!node) throw new Error('Required visible control missing');
  const b=node.bounds.match(/\d+/g).map(Number);
  if(b[2]<=b[0]||b[3]<=b[1])throw new Error('Control not visible');
  run(['shell','input','tap',String(Math.floor((b[0]+b[2])/2)),String(Math.floor((b[1]+b[3])/2))]);
}
function click(text) { tap(nodes().find(n=>n.text===text)); }
function key(digit) { tap(nodes().find(n=>n['content-desc']?.startsWith(`九宫格 ${digit} `))); }
function expect(text) {
  const actual=nodes().find(n=>n.class==='android.widget.EditText')?.text;
  if(actual!==text)throw new Error(`Expected editor ${JSON.stringify(text)}, got ${JSON.stringify(actual)}`);
}
function screenshot(name) { fs.writeFileSync(path.join(out,name),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{timeout:30000})); }
function launch(lang) {
  run(['shell','am','force-stop',`dev.ciban.${lang}`]);
  run(['shell','am','start','--activity-clear-top','-n',`dev.ciban.${lang}/dev.ciban.ime.MainActivity`]);
  const list=nodes();
  if(!list.some(n=>n.package===`dev.ciban.${lang}`))throw new Error('Own application not in foreground');
  if(list.some(n=>n.text==='全键盘'))click('全键盘');
  nodes();
}
function record(name) { results.push({name,status:'PASS'});console.log('PASS '+name); }
try {
  for(const lang of ['english','french']) {
    launch(lang);
    let prefix='';
    for(const digit of '64426'){key(digit);prefix+=digit;expect(prefix);console.log(lang+' typed '+prefix);}
    expect('64426');
    tap(nodes().find(n=>n['content-desc']==='选拼音 ni'));
    const list=nodes();
    if(!list.some(n=>n['content-desc']==='选拼音 hao'))throw Error('Next syllable absent');
    const candidate=list.find(n=>n['content-desc']?.startsWith('你好，')&&n.clickable==='true');
    if(!candidate || (lang==='french'&&!candidate['content-desc'].includes('bonjour')))throw Error('Translated T9 candidate missing');
    const positions=list.filter(n=>n.class==='android.widget.Button');
    screenshot(`t9-phone-${lang}-candidates.png`);
    tap(candidate); expect('你好');
    tap(nodes().find(n=>n['content-desc']==='删除，长按连续删除')); expect('你');
    for(const digit of '98394')key(digit);
    click('空格'); expect('你学习');
    record(`${lang}: real phone T9 touch + syllable + translated candidate + commit + deletion + space`);
    // 连续发送按键而不在每键之间抓 UI，覆盖实际快速输入的排队行为。
    for(const digit of '64426')tap(positions.find(n=>n['content-desc']?.startsWith(`九宫格 ${digit} `)));
    expect('你学习64426');
    click('空格');expect('你学习你好');
    launch(lang);
    const id=`dev.ciban.${lang}/dev.ciban.ime.CibanIme`;
    run(['shell','ime','enable',id]); run(['shell','ime','set',id]);
    click('系统键盘测试');nodes();
    for(const digit of '64426')tap(positions.find(n=>n['content-desc']?.startsWith(`九宫格 ${digit} `)));
    expect('64426');
    screenshot(`t9-phone-${lang}-system.png`);
    tap(candidate); expect('你好');
    for(const digit of '98394')tap(positions.find(n=>n['content-desc']?.startsWith(`九宫格 ${digit} `)));
    tap(positions.find(n=>n.text==='空格'));expect('你好学习');
    tap(positions.find(n=>n['content-desc']==='删除，长按连续删除'));expect('你好学');
    record(`${lang}: real phone InputMethodService T9 composing + commit + space + deletion`);
  }
} catch(error) {
  results.push({name:'phone T9 UI flow',status:'FAIL',error:error.message});
  try { screenshot('t9-phone-failure.png'); } catch {}
  console.error(error.stack);
}
const apkSha256=Object.fromEntries(['english','french'].map(lang=>[lang,crypto.createHash('sha256').update(fs.readFileSync(path.join(out,`ciban-${lang}-demo.apk`))).digest('hex')]));
fs.writeFileSync(path.join(out,'t9-phone-ui-results.json'),JSON.stringify({version:'0.5.0-demo',runtime:'M2007J17C Android 12 ARM64',generatedAt:new Date().toISOString(),apkSha256,results},null,2));
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;

