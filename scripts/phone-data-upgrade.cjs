// Install and validate migration of this app's own learned data, without printing its contents.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),serial=process.argv[2];if(!serial)throw Error('Phone serial required');
const adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const run=args=>{
  try { return execFileSync(adb,['-s',serial,...args],{timeout:30000,maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']}); }
  catch(e) { throw Error('ADB operation failed: '+(e.code||e.status)); }
};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const results=[];
for(const lang of ['english','french']){
  const pkg='dev.ciban.'+lang,files=['frequency.tsv','user-choices.tsv','user-ngram.tsv'];
  let previous='engine-v1';
  try { const prefs=run(['exec-out','run-as',pkg,'cat','shared_prefs/installed-data.xml']).toString(); previous=prefs.match(/<string name="root">(engine-v2-[a-f0-9]{16})<\/string>/)?.[1]||previous; }
  catch { try { run(['shell','run-as',pkg,'ls','files/engine-v2']);previous='engine-v2'; } catch {} }
  const currentRoot='engine-'+fs.readFileSync(path.join(root,'mobile/android/app/src',lang,'assets/data/cache-version.txt'),'utf8').trim();
  const old=Object.fromEntries(files.map(n=>[n,sha(run(['exec-out','run-as',pkg,'cat','files/'+previous+'/'+n]))]));
  const apk=path.join(root,'deliverables/ciban-'+lang+'-demo.apk');
  if(!run(['install','-r',apk]).toString().includes('Success'))throw Error('Install failed');
  run(['shell','am','start','-n',pkg+'/dev.ciban.ime.MainActivity']);
  run(['shell','sleep','3']);
  const current=Object.fromEntries(files.map(n=>[n,sha(run(['exec-out','run-as',pkg,'cat','files/'+currentRoot+'/'+n]))]));
  if(files.some(n=>current[n]!==old[n]))throw Error('Learning data migration mismatch: '+lang);
  {
    for(const n of lang==='french'?['french-base.qj','french-lessons.qj']:['english-lessons.qj']){
      const installed=sha(run(['exec-out','run-as',pkg,'cat','files/'+currentRoot+'/'+n]));
      const bundled=sha(fs.readFileSync(path.join(root,'mobile/android/app/src',lang,'assets/data',n)));
      if(installed!==bundled)throw Error('Installed learning data differs: '+n);
    }
  }
  results.push({language:lang,status:'PASS',previousRoot:previous,currentRoot,apkSha256:sha(fs.readFileSync(apk)),learningBefore:old,learningAfter:current,frenchAssetsMatched:lang==='french'});
}
fs.writeFileSync(path.join(root,'deliverables/data-upgrade-verification.json'),JSON.stringify({version:'0.5.0-demo',generatedAt:new Date().toISOString(),results},null,2));
console.log('PASS: both APK upgrades, private learned-data preservation and French installed asset hashes');

