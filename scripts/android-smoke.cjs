// 在模拟器上通过实际控件位置输入，并保存真实截图和可复查结果。
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const adb = path.join(root, '.tools/android-sdk/platform-tools/adb.exe');
const out = path.join(root, 'deliverables');
fs.mkdirSync(out, {recursive:true});
const results = [];
function run(args) { return execFileSync(adb, ['-s', 'emulator-5554', ...args], {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}); }
function nodes() {
  run(['shell','uiautomator','dump','/sdcard/ciban-test.xml']);
  run(['pull','/sdcard/ciban-test.xml',path.join(root,'.cache','test-ui.xml')]);
  const xml = fs.readFileSync(path.join(root,'.cache','test-ui.xml'),'utf8');
  return [...xml.matchAll(/<node\s+([^>]+)>?/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2].replace(/&#10;/g,'\n').replace(/&amp;/g,'&').replace(/&apos;/g,"'")])));
}
function tapNode(node) {
  if (!node) throw new Error('required visible control not found');
  const bounds = node.bounds.match(/\d+/g).map(Number);
  run(['shell','input','tap',String(Math.floor((bounds[0]+bounds[2])/2)),String(Math.floor((bounds[1]+bounds[3])/2))]);
}
function click(text) { tapNode(nodes().find(n=>n.text===text)); }
function clickDescription(text) { tapNode(nodes().find(n=>n['content-desc']===text)); }
function type(text) {
  for (const letter of text) tapNode(nodes().find(n=>n.text===letter && n.class==='android.widget.Button'));
}
function choose(text) { tapNode(nodes().find(n=>n['content-desc']?.startsWith(`${text}，`) && n.clickable==='true')); }
function expectEditor(text) {
  const editor = nodes().find(n=>n.class==='android.widget.EditText');
  if (editor?.text !== text) throw new Error(`editor expected ${JSON.stringify(text)}, got ${JSON.stringify(editor?.text)}`);
}
function screenshot(name) { fs.writeFileSync(path.join(out,name+'.png'),execFileSync(adb,['-s','emulator-5554','exec-out','screencap','-p'],{timeout:30000})); }
function record(name) { results.push({name,status:'PASS'}); console.log('PASS '+name); }
function launch(product) {
  run(['shell','am','force-stop',`dev.ciban.${product}`]);
  run(['shell','am','start','-n',`dev.ciban.${product}/dev.ciban.ime.MainActivity`]);
  nodes();
}
try {
  for (const language of ['english','french']) {
    launch(language);
    type('nihao');
    const list = nodes();
    if (!list.some(n=>n['content-desc']?.startsWith('你好，') && (language!=='french' || n['content-desc'].includes('bonjour')))) throw new Error('bilingual candidate missing');
    screenshot(`${language}-candidates`);
    const selectedCandidate = nodes().find(n=>n['content-desc']?.startsWith('你好，') && n.clickable==='true');
    const keyPositions = nodes().filter(n=>n.class==='android.widget.Button');
    choose('你好'); expectEditor('你好');
    clickDescription('删除，长按连续删除'); expectEditor('你');
    record(`${language}: in-app pinyin + translated candidate + Chinese commit + code-point deletion`);
    type('xuexi'); click('展开');
    if (!nodes().some(n=>n['content-desc']?.startsWith('学习，'))) throw new Error('expanded candidates missing');
    choose('学习'); expectEditor('你学习');
    click('中'); type('hello'); click('space'); expectEditor('你学习hello');
    click('123'); click('1'); expectEditor('你学习hello1');
    record(`${language}: expanded candidates + ASCII mode + symbols`);
    launch(language);
    const id = `dev.ciban.${language}/dev.ciban.ime.CibanIme`;
    run(['shell','ime','enable',id]); run(['shell','ime','set',id]);
    click('系统键盘测试');
    nodes(); // 等待系统键盘显示动画及输入框安全区重排完成。
    for (const letter of 'nihao') tapNode(keyPositions.find(n=>n.text===letter));
    expectEditor('nihao');
    tapNode(selectedCandidate); expectEditor('你好');
    screenshot(`${language}-system-keyboard`);
    for (const letter of 'xuexi') tapNode(keyPositions.find(n=>n.text===letter));
    tapNode(keyPositions.find(n=>n.text==='空格')); expectEditor('你好学习');
    tapNode(keyPositions.find(n=>n['content-desc']==='删除，长按连续删除')); expectEditor('你好学');
    record(`${language}: real InputMethodService composing + commit + space + deletion`);
  }
} catch (error) {
  results.push({name:'UI flow',status:'FAIL',error:error.message});
  console.error(error.message);
}
fs.writeFileSync(path.join(out,'ui-test-results.json'), JSON.stringify(results,null,2));
if(results.some(r=>r.status==='FAIL')) process.exitCode=1;
