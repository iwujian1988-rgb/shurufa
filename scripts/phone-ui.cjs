// Developer UI checks limited to our own test editor. No third-party messages are read.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
module.exports=function(serial){
  if(!serial)throw Error('Device serial required');
  const root=path.resolve(__dirname,'..'),adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
  const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
  function nodes(){
    run(['shell','uiautomator','dump','/sdcard/ciban-learning-ui.xml']);
    const xml=run(['exec-out','cat','/sdcard/ciban-learning-ui.xml']);
    return [...xml.matchAll(/<node\s+([^>]+)>?/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2].replace(/&#10;/g,'\n').replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&quot;/g,'"')])));
  }
  const bounds=node=>{if(!node)throw Error('Required control absent');return node.bounds.match(/\d+/g).map(Number);};
  function point(node){const b=bounds(node);if(b[2]<=b[0]||b[3]<=b[1])throw Error('Control not visible');return [Math.floor((b[0]+b[2])/2),Math.floor((b[1]+b[3])/2)].map(String);}
  const tap=node=>run(['shell','input','tap',...point(node)]);
  const longPress=node=>{const [x,y]=point(node);run(['shell','input','swipe',x,y,x,y,'850']);};
  const screenshot=name=>fs.writeFileSync(path.join(root,'deliverables',name),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{timeout:30000,maxBuffer:16*1024*1024}));
  function waitNodes(predicate,label){
    const deadline=Date.now()+20000;
    do {const list=nodes();if(predicate(list))return list;}while(Date.now()<deadline);
    throw Error('UI did not become ready: '+label);
  }
  function launch(lang){
    run(['shell','input','keyevent','KEYCODE_WAKEUP']);
    run(['shell','am','force-stop','dev.ciban.'+lang]);run(['shell','am','start','-n','dev.ciban.'+lang+'/dev.ciban.ime.MainActivity']);
    return waitNodes(list=>list.some(n=>n.package==='dev.ciban.'+lang)&&list.some(n=>['全键盘','九宫格'].includes(n.text))&&!list.some(n=>n.text.includes('正在加载')||n.text.includes('加载失败')),'own loaded app '+lang);
  }
  const expect=text=>{const actual=nodes().find(n=>n.class==='android.widget.EditText')?.text;if(actual!==text)throw Error('Expected editor '+JSON.stringify(text)+', got '+JSON.stringify(actual));};
  return {root,run,nodes,waitNodes,bounds,point,tap,longPress,screenshot,launch,expect};
};
