// Width/orientation regression on this project's disposable emulator only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ui=require('./phone-ui.cjs')('emulator-5554'),{root,run,nodes,waitNodes,bounds,tap,screenshot,launch,expect}=ui,results=[];
const original={rotation:run(['shell','settings','get','system','user_rotation']).trim(),auto:run(['shell','settings','get','system','accelerometer_rotation']).trim()};
try{
  run(['shell','ime','enable','dev.ciban.english/dev.ciban.ime.CibanIme']);
  for(const [name,size,density,rotation]of [['reduced-width','720x1440','360','0'],['landscape','1080x1920','420','1']]){
    run(['shell','wm','size',size]);run(['shell','wm','density',density]);
    run(['shell','settings','put','system','accelerometer_rotation','0']);run(['shell','settings','put','system','user_rotation',rotation]);
    run(['shell','wm','user-rotation','lock',rotation]);run(['shell','wm','fixed-to-user-rotation','enabled']);
    launch('english');
    let list=waitNodes(list=>{
      const rectangles=list.map(bounds),w=Math.max(...rectangles.map(b=>b[2])),h=Math.max(...rectangles.map(b=>b[3]));
      return (rotation==='1'?w>h:w<h)&&!list.some(n=>n.text.includes('正在加载'));
    },'orientation '+name);
    if(list.some(n=>n.text==='全键盘')){tap(list.find(n=>n.text==='全键盘'));list=nodes();}
    const key=list.find(n=>n['content-desc']?.startsWith('九宫格 2 '));if(!key)throw Error('Keypad absent '+name);
    const editor=list.find(n=>n.class==='android.widget.EditText'),eb=bounds(editor);if(eb[3]-eb[1]<24)throw Error('Editor clipped '+name);
    // Accessibility reports this custom view as LinearLayout; measure visible controls.
    const status=list.find(n=>n.text==='中文拼音 · 长按候选看用法');
    const bottom=list.find(n=>n['content-desc']==='回车');
    const kb=[0,bounds(status)[1],rotation==='1'?1920:720,bounds(bottom)[3]];
    const screen=rotation==='1'?1080:1440;if(kb[3]>screen)throw Error('Keyboard outside screen '+name);
    const keys=list.filter(n=>n['content-desc']?.startsWith('九宫格 '));if(keys.length!==9)throw Error('Nine keys not visible '+name);
    for(const digit of '64426')tap(list.find(n=>n['content-desc']?.startsWith('九宫格 '+digit+' ')));expect('64426');
    screenshot('layout-emulator-'+name+'.png');tap(nodes().find(n=>n.clickable==='true'&&n['content-desc']?.startsWith('你好，')));expect('你好');
    results.push({name,status:'PASS',editorBounds:eb,keyboardBounds:kb});console.log('PASS emulator '+name);
  }
}catch(e){results.push({status:'FAIL',error:e.message});console.error(e.stack);try{screenshot('layout-emulator-failure.png');}catch{};process.exitCode=1;}
finally{run(['shell','wm','size','reset']);run(['shell','wm','density','reset']);run(['shell','wm','fixed-to-user-rotation','default']);run(['shell','wm','user-rotation','free']);run(['shell','settings','put','system','user_rotation',original.rotation==='null'?'0':original.rotation]);run(['shell','settings','put','system','accelerometer_rotation',original.auto==='null'?'0':original.auto]);}
const apkSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'deliverables/ciban-english-demo.apk'))).digest('hex');
fs.writeFileSync(path.join(root,'deliverables/layout-emulator-ui-results.json'),JSON.stringify({version:'0.4.0-demo',runtime:'Android 15 API 35 x86_64 emulator',generatedAt:new Date().toISOString(),apkSha256,results},null,2));
