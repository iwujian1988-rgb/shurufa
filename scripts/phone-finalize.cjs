// Reclaim only obsolete, reproducible assets in our two app directories; retain learned data.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),serial=process.argv[2];if(!serial)throw Error('Phone serial required');
const adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
for(const lang of ['english','french']){
  const pkg='dev.ciban.'+lang;
  const current='engine-'+fs.readFileSync(path.join(root,'mobile/android/app/src',lang,'assets/data/cache-version.txt'),'utf8').trim();
  if(!/^engine-v2-[a-f0-9]{16}$/.test(current))throw Error('Invalid current asset directory');
  const pref=run(['exec-out','run-as',pkg,'cat','shared_prefs/installed-data.xml']);
  if(!pref.includes('>'+current+'</string>'))throw Error('Current app asset directory not confirmed');
  for(const obsolete of ['engine-v1','engine-v2']){
    if(obsolete===current)throw Error('Would remove active data');
    const names=['dict.qj','lm.qj','glossary.qj','english.tsv','french-base.qj','french-lessons.qj'];
    run(['shell','run-as',pkg,'rm','-f',...names.map(n=>'files/'+obsolete+'/'+n)]);
  }
}
run(['shell','am','force-stop','dev.ciban.french']);
run(['shell','am','start','-n','dev.ciban.french/dev.ciban.ime.MainActivity']);
run(['shell','uiautomator','dump','/sdcard/ciban-ready.xml']);
run(['shell','ime','enable','dev.ciban.french/dev.ciban.ime.CibanIme']);
run(['shell','ime','set','dev.ciban.french/dev.ciban.ime.CibanIme']);
const xml=run(['exec-out','cat','/sdcard/ciban-ready.xml']);
const node=[...xml.matchAll(/<node\s+([^>]+)>?/g)].find(m=>m[1].includes('text="系统键盘测试"'));
if(!node)throw Error('Own system keyboard test control absent');
const bounds=node[1].match(/bounds="([^"]+)"/)[1].match(/\d+/g).map(Number);
run(['shell','input','tap',String(Math.floor((bounds[0]+bounds[2])/2)),String(Math.floor((bounds[1]+bounds[3])/2))]);
run(['shell','sleep','1']);
if(run(['shell','settings','get','secure','default_input_method']).trim()!=='dev.ciban.french/dev.ciban.ime.CibanIme')throw Error('French IME not selected');
fs.writeFileSync(path.join(root,'.cache/phone-final-french.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{timeout:30000,maxBuffer:16*1024*1024}));
console.log('PASS: obsolete static copies reclaimed, learned files retained, French system keyboard ready');
