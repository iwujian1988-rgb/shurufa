const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const run=args=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
run(['shell','setprop','debug.hwui.drawing_enabled','1']);
for(const lang of ['english','french']){
  const apk=path.join(root,'deliverables/ciban-'+lang+'-demo.apk');
  if(!run(['install','-r',apk]).includes('Success'))throw Error('Main APK install failed');
  if(!run(['install','-r',path.join(root,'mobile/android/app/build/outputs/apk/androidTest',lang,'debug/app-'+lang+'-debug-androidTest.apk')]).includes('Success'))throw Error('Test install failed');
  const output=run(['shell','am','instrument','-w','dev.ciban.'+lang+'.test/dev.ciban.ime.SmokeInstrumentation']);
  fs.writeFileSync(path.join(root,'deliverables/0.5-emulator-'+lang+'-jni.txt'),'Runtime: Android 15 API 35 x86_64 emulator\nTested APK SHA-256: '+crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex')+'\n'+output);
  console.log(output);if(!output.includes('PASS:')||/FAIL:|crashed/.test(output))throw Error('Emulator test failed: '+lang);
}

