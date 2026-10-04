// MIUI 会拦截测试进程从后台启动 Activity；通过 adb 将自己的试打页带到前台。
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const serial=process.argv[2];
if(!serial)throw Error('Pass connected phone serial');
function run(args){return execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000});}
async function test(language){
  const apk=path.join(root,`deliverables/ciban-${language}-demo.apk`);
  const install=run(['install','-r',apk]);
  if(!install.includes('Success'))throw Error('APK install failed');
  const testApk=path.join(root,`mobile/android/app/build/outputs/apk/androidTest/${language}/debug/app-${language}-debug-androidTest.apk`);
  if(!run(['install','-r',testApk]).includes('Success'))throw Error('Test install failed');
  const proc=spawn(adb,['-s',serial,'shell','am','instrument','-w',`dev.ciban.${language}.test/dev.ciban.ime.SmokeInstrumentation`],{windowsHide:true});
  let output='',done=false;
  proc.stdout.on('data',b=>output+=b.toString());proc.stderr.on('data',b=>output+=b.toString());
  const finished=new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',code=>{done=true;resolve(code);});});
  await new Promise(resolve=>setTimeout(resolve,3000));
  if(!done)run(['shell','am','start','-n',`dev.ciban.${language}/dev.ciban.ime.MainActivity`]);
  let timeout;
  try {
    await Promise.race([finished,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Phone instrumentation timed out')),30000);})]);
  } catch(error) {proc.kill();throw error;} finally {clearTimeout(timeout);}
  const sha=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
  fs.writeFileSync(path.join(root,`deliverables/t9-phone-${language}-jni.txt`),`Tested APK SHA-256: ${sha}\n${output}`);
  console.log(output);
  if(!output.includes('PASS:')||/FAIL:|crashed/.test(output))throw Error(`Phone test failed: ${language}`);
}
(async()=>{for(const language of ['english','french'])await test(language);})().catch(e=>{console.error(e);process.exitCode=1;});
