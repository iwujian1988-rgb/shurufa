const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'deliverables');
const read=name=>JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const apk=Object.fromEntries(['english','french'].map(l=>[l,sha(path.join(out,`ciban-${l}-demo.apk`))]));
const letters=read('0.5-letters-phone-results.json'),t9=read('t9-phone-ui-results.json'),upgrade=read('data-upgrade-verification.json'),handoff=read('phone-handoff.json');
for(const [name,test,count] of [['letter/pool tests',letters,6],['T9/system tests',t9,4],['upgrade',upgrade,2]]) {
  if(test.version!=='0.5.0-demo'||test.results.length!==count||test.results.some(r=>r.status!=='PASS'))throw Error(name+' incomplete');
}
if(handoff.version!=='0.5.0-demo'||!handoff.inputViewShown||handoff.product!=='dev.ciban.english'||handoff.layout!=='t9'||handoff.heightPreset!=='comfortable')throw Error('Phone handoff incomplete');
const baseline=read('0.5-performance-english-baseline.json'),provenance=read('0.5-baseline-provenance.json');
if(baseline.status!=='PASS'||baseline.version!=='0.4.0-demo'||provenance.status!=='PASS'||baseline.apkSha256!==provenance.baselineApkSha256||provenance.checks.some(c=>!c.matched))throw Error('Baseline proof differs');
if(sha(path.join(root,'mobile/android/app/src/main/java/dev/ciban/ime/KeyboardBenchmark.kt'))!==provenance.benchmarkSourceSha256)throw Error('Benchmark changed between baseline and final');
const performance={};
for(const language of ['english','french']) {
  if(letters.apkSha256[language]!==apk[language]||t9.apkSha256[language]!==apk[language]||upgrade.results.find(r=>r.language===language)?.apkSha256!==apk[language])throw Error('Physical test APK differs: '+language);
  const perf=read(`0.5-performance-${language}-optimized.json`);
  if(perf.status!=='PASS'||perf.version!=='0.5.0-demo'||perf.apkSha256!==apk[language]||perf.uiFirstDraw.samples!==276||perf.jni.samples!==460||!perf.burstInputPreserved)throw Error('Performance proof differs: '+language);
  const log=fs.readFileSync(path.join(out,`0.5-emulator-${language}-jni.txt`),'utf8');
  if(!log.includes('PASS:')||!log.includes(apk[language])||/FAIL:|crashed/.test(log))throw Error('JNI validation differs: '+language);
  const sig=fs.readFileSync(path.join(out,`0.5-${language}-signature.txt`),'utf8');
  if(!sig.includes(apk[language])||!sig.includes('16K zipalign: PASS')||!sig.includes('1b68adb82ee962491e70fe4364650370c45687a09ad49240271e3cea8abaaec3'))throw Error('Signature/alignment differs');
  performance[language]={firstDraw:{samples:perf.uiFirstDraw.samples,p50Ms:perf.uiFirstDraw.p50Ms,p95Ms:perf.uiFirstDraw.p95Ms,maxMs:perf.uiFirstDraw.maxMs},jni:{samples:perf.jni.samples,p50Ms:perf.jni.p50Ms,p95Ms:perf.jni.p95Ms},burstTenKeysToFinalDrawMs:perf.burstTenKeysToFinalDrawMs};
}
const rank=fs.readFileSync(path.join(out,'0.5-t9-ranking.txt'),'utf8');
if(!rank.includes('PASS: 1522')||!rank.includes('test result: ok.'))throw Error('Packed dictionary ranking checks incomplete');
const names=['ciban-english-demo.apk','ciban-french-demo.apk','ciban-demo-source.tar.gz'];
const artifacts=names.map(name=>({name,bytes:fs.statSync(path.join(out,name)).size,sha256:sha(path.join(out,name))}));
const manifest={version:'0.5.0-demo',generatedAt:new Date().toISOString(),upstream:JSON.parse(fs.readFileSync(path.join(root,'upstream-lock.json'),'utf8')),products:['dev.ciban.english','dev.ciban.french'],abis:['arm64-v8a','x86_64'],minSdk:26,targetSdk:36,signing:'Android Debug; existing certificate retained',layouts:['qwerty','t9'],t9PrimaryLabels:['标点','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ'],t9HeightPresets:['compact','comfortable','large'],defaultT9Height:'comfortable',performance,englishBaselineFirstDraw:{p50Ms:baseline.uiFirstDraw.p50Ms,p95Ms:baseline.uiFirstDraw.p95Ms},measurementScope:baseline.measurement,englishP95ReductionPercent:(1-performance.english.firstDraw.p95Ms/baseline.uiFirstDraw.p95Ms)*100,physicalDeviceTested:true,fullCompatibilityValidated:false,independentLanguageReview:false,arbitraryPhraseTranslationImplemented:false,languageData:'unchanged from 0.4; original coverage and independent-review limitations retained',testScope:'M2007J17C Android 12 ARM64: synthetic private input UI/JNI performance, actual letter keys/scroll/expand/detail and practice/system IME touch tests; Android 15 x86_64: real JNI and UI smoke including letter labels and touch identity during rebind. No all-app timing claim.',artifacts};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),artifacts.map(a=>`${a.sha256}  ${a.name}`).join('\n')+'\n');
console.log(JSON.stringify({version:manifest.version,performance,p95ReductionPercent:manifest.englishP95ReductionPercent,artifacts},null,2));
