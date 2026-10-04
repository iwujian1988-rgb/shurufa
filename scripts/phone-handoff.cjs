// Leave the final demo ready in its own blank test editor; retain all user data.
const fs=require('node:fs'),path=require('node:path');
const {root,run,nodes,tap,launch,screenshot}=require('./phone-ui.cjs')(process.argv[2]);
const lang=process.argv[3]||'english';if(!['english','french'].includes(lang))throw Error('Invalid product');
let list=launch(lang);if(list.some(n=>n.text==='全键盘')){tap(list.find(n=>n.text==='全键盘'));list=nodes();}
const settings=run(['exec-out','run-as','dev.ciban.'+lang,'cat','shared_prefs/settings.xml']);
if(!settings.includes('name="layout">t9')||!settings.includes('name="t9-height">comfortable'))throw Error('Expected comfortable T9 preference');
const ime='dev.ciban.'+lang+'/dev.ciban.ime.CibanIme';run(['shell','ime','enable',ime]);run(['shell','ime','set',ime]);
tap(list.find(n=>n.text==='系统键盘测试'));run(['shell','sleep','1']);
const state=run(['shell','dumpsys','input_method']);
if(!state.includes('mCurMethodId='+ime)||!state.includes('mInputShown=true')||!state.includes('mIsInputViewShown=true'))throw Error('Handoff keyboard not visible');
const pkg=run(['shell','dumpsys','package','dev.ciban.'+lang]);if(!pkg.includes('versionName=0.5.0-demo')||!pkg.includes('versionCode=5'))throw Error('Unexpected installed version');
screenshot('0.5-phone-ready.png');
fs.writeFileSync(path.join(root,'deliverables/phone-handoff.json'),JSON.stringify({version:'0.5.0-demo',generatedAt:new Date().toISOString(),product:'dev.ciban.'+lang,defaultInputMethod:ime,layout:'t9',heightPreset:'comfortable',inputViewShown:true},null,2));
console.log('PASS: installed 0.5 English/French demo handoff, '+lang+' comfortable T9 system keyboard ready');

