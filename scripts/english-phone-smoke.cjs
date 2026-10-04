const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ui=require('./phone-ui.cjs')(process.argv[2]),results=[];
const {root,run,nodes,bounds,tap,longPress,screenshot,launch,expect}=ui;
const apkSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'deliverables/ciban-english-demo.apk'))).digest('hex');
const resultFile=path.join(root,'deliverables/english-phone-ui-results.json');
if(process.argv.includes('--resume')&&fs.existsSync(resultFile)){
  const previous=JSON.parse(fs.readFileSync(resultFile,'utf8'));
  if(previous.apkSha256===apkSha256)results.push(...previous.results.filter(r=>r.status==='PASS'));
}
function scrollLesson(up){
  const scroll=nodes().filter(n=>n.class==='android.widget.ScrollView').at(-1),b=bounds(scroll),x=String(Math.floor((b[0]+b[2])/2));
  run(['shell','input','swipe',x,String(up?b[3]-20:b[1]+55),x,String(up?b[1]+55:b[3]-20),'300']);
}
function findCandidate(word,gloss=''){
  for(let i=0;i<10;i++){
    const list=nodes(),candidate=list.find(n=>n.clickable==='true'&&n['content-desc']?.startsWith(word+'，')&&n['content-desc'].includes(gloss));
    if(!list.some(n=>n.package==='dev.ciban.english'))throw Error('English app left foreground');
    if(candidate)return candidate;
    const scroll=list.find(n=>n.class==='android.widget.HorizontalScrollView'),b=bounds(scroll),y=String(Math.floor((b[1]+b[3])/2));
    // Stay away from Android's screen-edge Back gesture.
    run(['shell','input','swipe',String(Math.floor(b[0]+(b[2]-b[0])*.75)),y,String(Math.floor(b[0]+(b[2]-b[0])*.25)),y,'300']);
  }
  throw Error('Missing English annotation '+word+' / '+gloss);
}
try{
  for(const [spelling,word,gloss,field]of [
    ['yinhang','银行','bank','可数性'],['hai','还','still'],['huan','还','return'],
    ['xing','行','walk'],['hang','行','line'],['de','地','particle'],['di','地','ground'],
    ['wojuede','我觉得','think','看法'],['buzhidao','不知道','not know','例句'],
    ['haizi','孩子','child','children'],['xinxi','信息','information','不可数'],['xuexi','学习','study','studied'],
    ['shu','树','tree','名词'],['dan','单','暂无释义','多个读音']
  ]){
    if(results.some(r=>r.spelling===spelling&&r.word===word&&r.status==='PASS'))continue;
    let list=launch('english');if(list.some(n=>n.text==='九宫格')){tap(list.find(n=>n.text==='九宫格'));list=nodes();}
    const keys=list.filter(n=>n.class==='android.widget.Button');for(const ch of spelling)tap(keys.find(n=>n.text===ch));
    expect(spelling);let candidate=findCandidate(word,gloss);
    if(field){
      longPress(candidate);list=nodes();
      for(let i=0;i<4&&!list.some(n=>n.text.includes(field));i++){scrollLesson(true);list=nodes();}
      if(!list.some(n=>n.text.includes(field)))throw Error('Lesson field absent '+word+' / '+field);
      if(list.find(n=>n.class==='android.widget.EditText')?.text!==spelling)throw Error('Long press changed composition');
      if(['银行','我觉得','孩子','树','单'].includes(word))screenshot('english-phone-'+spelling+'-detail.png');
      for(let i=0;i<4&&!list.some(n=>n['content-desc']==='关闭词语用法，返回键盘');i++){scrollLesson(false);list=nodes();}
      tap(list.find(n=>n['content-desc']==='关闭词语用法，返回键盘'));list=nodes();
    }
    candidate=findCandidate(word);tap(candidate);expect(word);
    results.push({spelling,word,status:'PASS'});console.log('PASS English '+word+' / '+spelling);
  }
}catch(e){results.push({status:'FAIL',error:e.message});try{screenshot('english-phone-failure.png');}catch{};console.error(e.stack);process.exitCode=1;}
fs.writeFileSync(resultFile,JSON.stringify({version:'0.4.0-demo',runtime:'M2007J17C Android 12 ARM64',generatedAt:new Date().toISOString(),apkSha256,resumedFromMatchedApk:process.argv.includes('--resume'),scope:'Own editor physical touch; reading differences, phrases, grammar/examples, upstream POS fallback, unresolved reading guard, long press/back without commit; successful earlier cases may resume only with identical APK hash',results},null,2));
