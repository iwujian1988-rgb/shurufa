const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ui=require('./phone-ui.cjs')(process.argv[2]);
const {root,run,nodes,tap,longPress,point,bounds,screenshot,launch,expect}=ui;
const results=[];
const record=(language,name)=>{results.push({language,name,status:'PASS'});console.log('PASS '+language+': '+name);};
try {
  for(const language of ['english','french']) {
    let list=launch(language);
    if(list.some(n=>n.text==='全键盘')){tap(list.find(n=>n.text==='全键盘'));list=nodes();}
    const keys=list.filter(n=>n.class==='android.widget.Button');
    for(const [d,letters] of Object.entries({2:'ABC',3:'DEF',4:'GHI',5:'JKL',6:'MNO',7:'PQRS',8:'TUV',9:'WXYZ'})) {
      const key=keys.find(n=>n['content-desc']===`九宫格 ${d} ${letters}`);
      if(!key||key.text!==letters)throw Error('Letter-only primary key absent: '+letters);
    }
    if(keys.find(n=>n['content-desc']==='九宫格 1 标点')?.text!=='标点')throw Error('Punctuation key absent');
    screenshot(`0.5-${language}-letters.png`);
    record(language,'all eight T9 keys show letters only; punctuation key and comfortable height retained');
    for(const d of '9464264')tap(keys.find(n=>n['content-desc']?.startsWith('九宫格 '+d+' ')));
    expect('9464264');list=nodes();
    const bank=list.find(n=>n['content-desc']?.startsWith('银行，')&&n.clickable==='true');
    if(!bank||!bank['content-desc'].includes(language==='english'?'bank':'banque'))throw Error('Bank translated candidate absent');
    longPress(bank);list=nodes();expect('9464264');
    const content=list.map(n=>n.text).join('\n');
    if(!content.includes(language==='english'?'可数性':'阴性'))throw Error('Long-press lesson absent after pooled refresh');
    screenshot(`0.5-${language}-detail.png`);
    tap(list.find(n=>n['content-desc']==='关闭词语用法，返回键盘'));expect('9464264');
    tap(nodes().find(n=>n.text==='展开'));list=nodes();
    const bankCards=list.filter(n=>n['content-desc']?.startsWith('银行，')&&n.clickable==='true');
    if(bankCards.length<2)throw Error('Expanded candidate list missing');
    tap(bankCards.sort((a,b)=>bounds(b)[1]-bounds(a)[1])[0]);expect('银行');
    record(language,'pooled candidate translation, long press/back preserves input, lazy expanded list commits Chinese');
    // Exercise horizontal loading beyond the first page, then rebuild the candidates.
    list=launch(language);const freshKeys=list.filter(n=>n.class==='android.widget.Button');
    tap(freshKeys.find(n=>n['content-desc']?.startsWith('九宫格 6 ')));expect('6');
    const seen=new Set();
    for(let page=0;page<7;page++){
      list=nodes();const cards=list.filter(n=>n['content-desc']?.includes('，点击输入中文')&&n.clickable==='true');
      cards.forEach(n=>seen.add(n['content-desc']));
      if(!cards.length)throw Error('Candidate page empty');
      const b=bounds(cards[0]);const width=Number(run(['shell','wm','size']).match(/Physical size: (\d+)x/)[1]);
      run(['shell','input','swipe',String(Math.floor(width*.78)),String(Math.floor((b[1]+b[3])/2)),String(Math.floor(width*.25)),String(Math.floor((b[1]+b[3])/2)),'350']);
    }
    if(seen.size<=8)throw Error('Horizontal list did not load additional candidates');
    tap(freshKeys.find(n=>n['content-desc']?.startsWith('九宫格 4 ')));expect('64');
    for(const d of '426')tap(freshKeys.find(n=>n['content-desc']?.startsWith('九宫格 '+d+' ')));
    expect('64426');list=nodes();tap(list.find(n=>n['content-desc']?.startsWith('你好，')&&n.clickable==='true'));expect('你好');
    record(language,`horizontal pages load beyond eight (${seen.size} unique candidates); new input refreshes to correct commit`);
  }
} catch(error){results.push({name:'letter/pool UI flow',status:'FAIL',error:error.message});console.error(error.stack);try{screenshot('0.5-letters-failure.png');}catch{}}
const apkSha256=Object.fromEntries(['english','french'].map(l=>[l,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'deliverables',`ciban-${l}-demo.apk`))).digest('hex')]));
fs.writeFileSync(path.join(root,'deliverables/0.5-letters-phone-results.json'),JSON.stringify({version:'0.5.0-demo',generatedAt:new Date().toISOString(),runtime:'M2007J17C Android 12 ARM64',apkSha256,results},null,2));
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
