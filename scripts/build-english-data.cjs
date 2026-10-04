// Independently authored English lessons; never translate the French glossary.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'data/english-release');
fs.mkdirSync(dir,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const rows=p=>read(p).split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t'));
const canonical=p=>p.toLowerCase().replace(/u:|ü/g,'v').replace(/[1-5]/g,'').trim().replace(/\s+/g,' ');
const valid=p=>/^[a-z]+(?: [a-z]+)*$/.test(p);
const chinese=JSON.parse(read('data/french-research/chinese-entries.json'));
const readings=new Map();
for(const e of chinese){const p=canonical(e.pinyin);if(!valid(p))throw Error('Invalid Chinese dictionary reading');if(!readings.has(e.word))readings.set(e.word,new Set());readings.get(e.word).add(p);}
// Only pronunciation identifiers from our GPL lessons are shared across products.
const phraseReadings=new Map();
for(const [key,json]of rows('data/french-release/lessons.tsv')){
  const data=JSON.parse(json);if(!phraseReadings.has(data.word))phraseReadings.set(data.word,new Set());phraseReadings.get(data.word).add(data.pinyin);
}
const names={'n.':'名词','v.':'动词 / 动词短语','adj.':'形容词','adv.':'副词','pron.':'代词','prep.':'介词','conj.':'连词','num.':'数词','part.':'助词 / 语法说明','int.':'叹词 / 礼貌表达','phr.':'会话表达 / 短语'};
const split=s=>s?s.split(' ; '):[];
const table=new Map(),curated=new Set(),ambiguous=new Set();
function put(word,p,data){
  if(!word||!valid(p)||/[\t\n#|]/.test(word))throw Error('Invalid lesson key '+word+'#'+p);
  const key=word+'#'+p;
  table.set(key,{word,pinyin:p,...data,source:'词伴 · AI 英语学习整理',license:'GPL-3.0-or-later',review:'未独立英语编辑校审'});curated.add(key);
}
for(const [word,ps]of readings){if(ps.size<2)continue;ambiguous.add(word);for(const p of ps)table.set(word+'#'+p,{word,pinyin:p,short:[],senses:[],note:'这个词有多个读音，当前读音尚未完成英语词义整理。请输入完整词组；不自动套用其他读音的释义。',source:'词伴 · 多读音保护',license:'GPL-3.0-or-later',review:'待按读音整理',blocked:true});}
const common=rows('data/english-common.tsv');
const seenCommon=new Set();
for(const r of common){
  if(r.length!==9)throw Error('Common lesson must have 9 columns: '+r[0]);
  const [word,p,gloss,pos,lemma,countability,forms,note,example]=r,key=word+'#'+p;
  if(seenCommon.has(key))throw Error('Duplicate common lesson '+key);seenCommon.add(key);
  const short=split(gloss),parts=split(pos),lemmas=split(lemma);
  if(!short.length||parts.length!==short.length)throw Error('Sense/POS mismatch '+word);
  put(word,p,{short,senses:short.map((text,i)=>({text,pos:names[parts[i]]||parts[i],...(lemmas[i]?{lemma:lemmas[i]}:{})})),countability,forms,note,example});
}
const phrases=rows('data/english-phrases.tsv'),seenPhrases=new Set();
for(const [word,gloss,note,example]of phrases){
  if(seenPhrases.has(word))throw Error('Duplicate phrase '+word);seenPhrases.add(word);
  const ps=readings.get(word)||phraseReadings.get(word);if(!ps?.size)throw Error('Missing explicit phrase reading '+word);
  if(ps.size!==1)throw Error('Phrase requires explicit reading selection '+word);
  for(const p of ps){const short=split(gloss);put(word,p,{short,senses:short.map(text=>({text,pos:'会话表达 / 短语'})),note,example});}
}
const poly=rows('data/english-polyphones.tsv'),seenPoly=new Set();
for(const [word,p,gloss,pos,note]of poly){
  const key=word+'#'+p;if(seenPoly.has(key))throw Error('Duplicate polyphone '+key);seenPoly.add(key);
  const short=split(gloss),parts=split(pos);if(!short.length||parts.length!==short.length)throw Error('Polyphone sense/POS mismatch '+key);
  const previous=table.get(key);
  put(word,p,{short,senses:short.map((text,i)=>({text,pos:names[parts[i]]||parts[i],...(/^[a-z]+$/.test(text)&&['n.','v.'].includes(parts[i])?{lemma:text}:{})})),note,...(previous?.example?{example:previous.example}:{})});
}
const sorted=[...table].sort(([a],[b])=>a<b?-1:a>b?1:0);
for(const [key,value]of sorted){if(value.short.length>2||value.short.some(s=>!s.trim())||value.short.length!==value.senses.length)throw Error('Invalid senses '+key);}
fs.writeFileSync(path.join(dir,'lessons.tsv'),'# GPL-3.0-or-later; English lessons and pronunciation guards\n'+sorted.map(([k,v])=>k+'\t'+JSON.stringify(v).replace(/\|/g,'\\u007c')).join('\n')+'\n');
const top=JSON.parse(read('data/french-research/top5000.json'));
fs.writeFileSync(path.join(dir,'review-queue.jsonl'),top.map(e=>JSON.stringify({...e,curated:[...(readings.get(e.word)||[])].some(p=>curated.has(e.word+'#'+p)),review:'pending-independent-english-review'})).join('\n')+'\n');
const sourceFiles=['data/english-common.tsv','data/english-phrases.tsv','data/english-polyphones.tsv','data/french-research/chinese-entries.json','data/french-release/lessons.tsv'];
const manifest={version:'en-2026-10-04-v1',license:'GPL-3.0-or-later',independentLanguageReview:false,commonSourceEntries:common.length,phraseSourceEntries:phrases.length,polyphoneSourceEntries:poly.length,curatedReadingEntries:curated.size,curatedHeadwords:new Set([...curated].map(k=>k.split('#')[0])).size,ambiguousDictionaryHeadwords:ambiguous.size,unresolvedReadingGuards:sorted.filter(([,v])=>v.blocked).length,tableEntries:table.size,sourceFiles:sourceFiles.map(file=>({file,sha256:crypto.createHash('sha256').update(read(file)).digest('hex')})),notes:'Keep upstream word glossary for other headwords. Curated entries use exact toneless readings; unresolved multi-reading entries deliberately hide word-only gloss. Same reading with different tones or meanings still needs context. Phrase examples are authoring, not independent review; some phrases require sentence generation.'};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({...manifest,sourceFiles:undefined},null,2));
