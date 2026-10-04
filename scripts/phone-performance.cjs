// Debug benchmark in the app-owned editor. Does not read third-party input or messages.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const [serial,language='english',label='optimized']=process.argv.slice(2);
if(!serial||!['english','french'].includes(language)||!['baseline','optimized'].includes(label))throw Error('serial [english|french] [baseline|optimized]');
const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
const pkg='dev.ciban.'+language;
async function main(){
  run(['shell','input','keyevent','KEYCODE_WAKEUP']);
  run(['shell','am','force-stop',pkg]);
  run(['shell','am','start','-n',pkg+'/dev.ciban.ime.MainActivity','--ez','ciban-perf','true']);
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,2000));
    let value;try{value=JSON.parse(run(['exec-out','run-as',pkg,'cat','cache/keyboard-performance.json']));}catch{continue;}
    const apk=label==='baseline'?path.join(root,'.cache/baseline-english.apk'):path.join(root,'deliverables','ciban-'+language+'-demo.apk');
    value.apkSha256=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
    value.generatedAt=new Date().toISOString();value.label=label;
    fs.writeFileSync(path.join(root,'deliverables',`0.5-performance-${language}-${label}.json`),JSON.stringify(value,null,2));
    console.log(JSON.stringify({...value,uiFirstDraw:value.uiFirstDraw&&{...value.uiFirstDraw,valuesMs:undefined},jni:value.jni&&{...value.jni,valuesMs:undefined}},null,2));
    if(value.status!=='PASS')throw Error(value.error);return;
  }
  throw Error('benchmark timeout');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
