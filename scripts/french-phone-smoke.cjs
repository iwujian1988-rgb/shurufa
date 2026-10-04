// Physical touch checks in the user's own demo editor; no third-party app content.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),serial=process.argv[2];if(!serial)throw Error('Phone serial required');
const adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe'),out=path.join(root,'deliverables');
const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
function nodes(){run(['shell','uiautomator','dump','/sdcard/ciban-french.xml']);const local=path.join(root,'.cache/french-ui.xml');run(['pull','/sdcard/ciban-french.xml',local]);return [...fs.readFileSync(local,'utf8').matchAll(/<node\s+([^>]+)>?/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2].replace(/&#10;/g,'\n').replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&quot;/g,'"')])));}
function point(node){if(!node)throw Error('Visible control missing');const b=node.bounds.match(/\d+/g).map(Number);if(b[2]<=b[0]||b[3]<=b[1])throw Error('Control outside view');return [Math.floor((b[0]+b[2])/2),Math.floor((b[1]+b[3])/2)].map(String);}
const tap=node=>run(['shell','input','tap',...point(node)]);
function launch(){run(['shell','am','force-stop','dev.ciban.french']);run(['shell','am','start','-n','dev.ciban.french/dev.ciban.ime.MainActivity']);let list=nodes();if(list.some(n=>n.text==='九宫格')){tap(list.find(n=>n.text==='九宫格'));list=nodes();}if(!list.some(n=>n.package==='dev.ciban.french'))throw Error('Own app not visible');return list;}
function screenshot(name){fs.writeFileSync(path.join(out,name),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{timeout:30000,maxBuffer:16*1024*1024}));}
const apkSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'ciban-french-demo.apk'))).digest('hex');
const resultFile=path.join(out,'french-phone-ui-results.json');
const results=[];
if(process.argv.includes('--resume')&&fs.existsSync(resultFile)){
  const previous=JSON.parse(fs.readFileSync(resultFile,'utf8'));
  if(previous.apkSha256===apkSha256)results.push(...previous.results.filter(r=>r.status==='PASS'));
}
function scrollLesson(up){
  const scroll=nodes().filter(n=>n.class==='android.widget.ScrollView').at(-1);if(!scroll)throw Error('Lesson scroll area absent');
  const b=scroll.bounds.match(/\d+/g).map(Number),x=String(Math.floor((b[0]+b[2])/2));
  run(['shell','input','swipe',x,String(up?b[3]-30:b[1]+80),x,String(up?b[1]+80:b[3]-30),'300']);
}
try{
  for(const [spelling,word,gloss]of [['yinhang','银行','banque'],['hai','还','encore'],['huan','还','rendre'],['xing','行','marcher'],['hang','行','ligne'],['de','的','liaison'],['wojuede','我觉得','pense'],['buzhidao','不知道','savoir']]){
    if(results.some(r=>r.spelling===spelling&&r.word===word&&r.status==='PASS'))continue;
    const keys=launch().filter(n=>n.class==='android.widget.Button');
    for(const ch of spelling)tap(keys.find(n=>n.text===ch));
    let list=nodes();const editor=list.find(n=>n.class==='android.widget.EditText');if(editor?.text!==spelling)throw Error('Composing differs: '+spelling);
    const candidate=list.find(n=>n.clickable==='true'&&n['content-desc']?.startsWith(word+'，')&&n['content-desc'].includes(gloss));if(!candidate)throw Error('Missing correct annotation: '+word+' / '+spelling);
    if(word==='银行'){
      const [x,y]=point(candidate);run(['shell','input','swipe',x,y,x,y,'850']);list=nodes();
      if(!list.some(n=>n.text.includes('阴性'))||!list.some(n=>n.text.includes('原形：banque')))throw Error('Noun lesson fields absent');
      if(list.find(n=>n.class==='android.widget.EditText')?.text!==spelling)throw Error('Long press unexpectedly committed');
      screenshot('french-phone-noun-detail.png');
      tap(list.find(n=>n['content-desc']==='关闭词语用法，返回键盘'));list=nodes();
    }
    if(word==='我觉得'){
      const [x,y]=point(candidate);run(['shell','input','swipe',x,y,x,y,'850']);list=nodes();
      for(let i=0;i<4&&!list.some(n=>n.text.includes('表达看法'));i++){scrollLesson(true);list=nodes();}
      if(!list.some(n=>n.text.includes('表达看法')))throw Error('Phrase context note absent');screenshot('french-phone-phrase-detail.png');
      if(list.find(n=>n.class==='android.widget.EditText')?.text!==spelling)throw Error('Lesson scroll changed composition');
      for(let i=0;i<4&&!list.some(n=>n['content-desc']==='关闭词语用法，返回键盘');i++){scrollLesson(false);list=nodes();}
      tap(list.find(n=>n['content-desc']==='关闭词语用法，返回键盘'));list=nodes();
    }
    tap(list.find(n=>n.clickable==='true'&&n['content-desc']?.startsWith(word+'，')));
    if(nodes().find(n=>n.class==='android.widget.EditText')?.text!==word)throw Error('Commit lost after detail: '+word);
    results.push({spelling,word,status:'PASS'});console.log('PASS French '+word+' / '+spelling);
  }
}catch(e){results.push({status:'FAIL',error:e.message});console.error(e.message);try{screenshot('french-phone-failure.png');}catch{}}
fs.writeFileSync(resultFile,JSON.stringify({version:'0.4.0-demo',runtime:'M2007J17C Android 12 ARM64',generatedAt:new Date().toISOString(),apkSha256,resumedFromMatchedApk:process.argv.includes('--resume'),scope:'Physical touch in own app; reading-sensitive annotation, noun gender/lemma, phrase note, scroll, long press without commit and return/commit; resume only with identical APK hash',results},null,2));
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
