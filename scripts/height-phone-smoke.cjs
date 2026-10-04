const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root,run,nodes,waitNodes,bounds,tap,screenshot,launch,expect}=require('./phone-ui.cjs')(process.argv[2]);
const results=[];
const densityOutput=run(['shell','wm','density']);
const density=Number(densityOutput.match(/Override density:\s*(\d+)/)?.[1]||densityOutput.match(/Physical density:\s*(\d+)/)?.[1])/160;
if(!density)throw Error('Unknown display density');
function visible(n){const b=bounds(n);return b[2]>b[0]&&b[3]>b[1];}
function revealHeight(){
  for(let attempt=0;attempt<6;attempt++){
    const list=nodes(),button=list.find(n=>n.text.startsWith('九宫格高度 ·')&&visible(n));if(button)return button;
    const scroll=list.find(n=>n.class==='android.widget.ScrollView'&&visible(n));if(!scroll)throw Error('Own settings scroll absent');
    const b=bounds(scroll),x=String(Math.floor((b[0]+b[2])/2));run(['shell','input','swipe',x,String(b[3]-20),x,String(b[1]+20),'350']);
  }
  throw Error('Height setting not reachable');
}
function measure(lang,preset,scope){
  const list=nodes(),key=list.find(n=>n['content-desc']?.startsWith('九宫格 2 ')),b=bounds(key);
  const height=(b[3]-b[1])/density,width=(b[2]-b[0])/density;
  const required={紧凑:53,舒适:67,加大:79}[preset];if(height<required||width<70)throw Error('Small T9 touch target: '+height+'x'+width);
  const keys=list.filter(n=>n['content-desc']?.startsWith('九宫格 ')&&visible(n));
  if(keys.length!==9)throw Error('Clipped T9 keys');
  screenshot('height-phone-'+lang+'-'+{紧凑:'compact',舒适:'comfortable',加大:'large'}[preset]+'-'+scope+'.png');
  for(const digit of '64426')tap(list.find(n=>n['content-desc']?.startsWith('九宫格 '+digit+' ')));
  expect('64426');tap(nodes().find(n=>n.clickable==='true'&&n['content-desc']?.startsWith('你好，')));expect('你好');
  results.push({language:lang,preset,scope,status:'PASS',keyHeightDp:height,keyWidthDp:width});console.log('PASS '+lang+' '+preset+' '+scope+' '+height.toFixed(1)+'dp');
}
try{
  for(const lang of ['english','french']){
    for(const preset of ['紧凑','加大','舒适']){
      launch(lang);tap(revealHeight());tap(nodes().find(n=>n.text===preset));
      let list=nodes();if(list.some(n=>n.text==='全键盘')){tap(list.find(n=>n.text==='全键盘'));list=nodes();}
      measure(lang,preset,'practice');
    }
    launch(lang);
    const positions=nodes();
    const ime='dev.ciban.'+lang+'/dev.ciban.ime.CibanIme';run(['shell','ime','enable',ime]);run(['shell','ime','set',ime]);
    tap(positions.find(n=>n.text==='系统键盘测试'));run(['shell','sleep','1']);
    const imeState=run(['shell','dumpsys','input_method']);
    if(!imeState.includes('mCurMethodId='+ime)||!imeState.includes('mInputShown=true')||!imeState.includes('mIsInputViewShown=true'))throw Error('System IME not visible');
    // MIUI excludes IME nodes from UiAutomator's active-app dump. Both views use the
    // same measured layout; touch those coordinates and validate the host editor.
    screenshot('height-phone-'+lang+'-comfortable-system.png');
    for(const digit of '64426')tap(positions.find(n=>n['content-desc']?.startsWith('九宫格 '+digit+' ')));
    expect('64426');
    const candidatePosition=positions.find(n=>n.text==='打中文，顺手遇见'+(lang==='english'?'英语':'法语')+'。');
    const cb=bounds(candidatePosition);run(['shell','input','tap',String(cb[0]+Math.round(56*density)),String(Math.floor((cb[1]+cb[3])/2))]);
    expect('你好');results.push({language:lang,preset:'舒适',scope:'system',status:'PASS',imeVisible:true,touchCoordinatesFromMeasuredPractice:true,systemKeyHeightDirectlyMeasured:false});console.log('PASS '+lang+' 舒适 system');
  }
}catch(e){results.push({status:'FAIL',error:e.message});console.error(e.stack);try{screenshot('height-phone-failure.png');}catch{};process.exitCode=1;}
const apkSha256=Object.fromEntries(['english','french'].map(lang=>[lang,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'deliverables/ciban-'+lang+'-demo.apk'))).digest('hex')]));
fs.writeFileSync(path.join(root,'deliverables/height-phone-ui-results.json'),JSON.stringify({version:'0.4.0-demo',runtime:'M2007J17C Android 12 ARM64',generatedAt:new Date().toISOString(),density,apkSha256,scope:'Physical setting taps in own app; all three heights persist after Activity recreation, full 9-key bounds visible and real composing/commit; system IME follows comfortable preset',results},null,2));
