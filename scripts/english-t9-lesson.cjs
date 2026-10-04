const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root,run,nodes,tap,longPress,screenshot,launch,expect}=require('./phone-ui.cjs')(process.argv[2]);
let list=launch('english');if(list.some(n=>n.text==='全键盘')){tap(list.find(n=>n.text==='全键盘'));list=nodes();}
for(const digit of '42494')tap(list.find(n=>n['content-desc']?.startsWith('九宫格 '+digit+' ')));
expect('42494');list=nodes();const candidate=list.find(n=>n['content-desc']?.startsWith('孩子，')&&n['content-desc'].includes('child'));
if(!candidate)throw Error('T9 child lesson candidate absent');longPress(candidate);list=nodes();
if(!list.some(n=>n.text.includes('children')))throw Error('T9 irregular plural absent');
expect('42494');screenshot('english-phone-haizi-detail.png');
tap(list.find(n=>n['content-desc']==='关闭词语用法，返回键盘'));tap(nodes().find(n=>n['content-desc']?.startsWith('孩子，')&&n.clickable==='true'));expect('孩子');
fs.writeFileSync(path.join(root,'deliverables/english-t9-lesson.json'),JSON.stringify({version:'0.4.0-demo',status:'PASS',runtime:'M2007J17C Android 12 ARM64',apkSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'deliverables/ciban-english-demo.apk'))).digest('hex'),scope:'Physical T9 42494 -> child lesson -> plural children -> no unintended commit -> return/commit 孩子'},null,2));
console.log('PASS English physical T9 child lesson and commit');
