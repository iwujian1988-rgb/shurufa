// Separate licensed base dictionary and independently authored lesson overlay.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'), dir=path.join(root,'data/french-release');
fs.mkdirSync(dir,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const lines=p=>read(p).split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t'));
const canonical=p=>p.toLowerCase().replace(/u:|ü/g,'v').replace(/[1-5]/g,'').trim().replace(/\s+/g,' ');
const valid=p=>/^[a-z]+(?: [a-z]+)*$/.test(p);
const chinese=JSON.parse(read('data/french-research/chinese-entries.json'));
const pronunciations=new Map();
for(const e of chinese){if(!pronunciations.has(e.word))pronunciations.set(e.word,new Set());pronunciations.get(e.word).add(canonical(e.pinyin));}
const source=read('data/french-research/cfdict-records.jsonl').trim().split('\n').map(JSON.parse);
const base=new Map(), blocked=[];
for(const record of source){
  const groups=new Map();
  for(const e of record.entries){
    const p=canonical(e.pinyin);
    if(!valid(p)){blocked.push({word:record.word,pinyin:e.pinyin,reason:'nonstandard pronunciation'});continue;}
    if(!groups.has(p))groups.set(p,[]);groups.get(p).push(e);
  }
  for(const [p,entries] of groups){
    const senses=[...new Set(entries.flatMap(e=>e.senses))];
    const usable=senses.filter(s=>!/^\(?\s*(voir |variante de |forme (?:ancienne|traditionnelle|simplifiée) de )/i.test(s));
    if(!usable.length){blocked.push({word:record.word,pinyin:p,reason:'reference only'});continue;}
    const data={word:record.word,pinyin:p,short:usable.slice(0,2),senses:senses.map(text=>({text})),
      note:'词典义项供参考；词义需结合完整句子。',source:'CFDICT · Chine Informations',
      sourceUrl:'https://chine.in/mandarin/dictionnaire/CFDICT/',license:'CC-BY-SA-3.0',
      review:'未独立法语编辑校审',sourceLines:entries.map(e=>e.sourceLine)};
    base.set(record.word+'#'+p,data);
  }
}
const posNames={'n.':'名词','v.':'动词 / 动词短语','adj.':'形容词','adv.':'副词','pron.':'代词','conj.':'连词','num.':'数词','int.':'叹词 / 礼貌表达','phr.':'短语','part.':'助词 / 语法说明','prep.':'介词'};
const genders={'下午':'阳性','小时':'阴性','夏天':'阳性','秋天':'阳性','星星':'阴性','学校':'阴性','大学':'阴性','学生':'通性（un / une élève）','考试':'阳性','朋友':'阳性形式；女性用 une amie','孩子':'通性（un / une enfant）','妻子':'阴性','男人':'阳性','公司':'阴性','失败':'阳性','机会':'阴性','经验':'阴性','医院':'阳性','眼睛':'阳性','耳朵':'阴性','水':'阴性','鸡蛋':'阳性','橙子':'阴性','钱':'阳性','地址':'阴性','飞机':'阳性','机场':'阳性','酒店':'阳性','电脑':'阳性','动物':'阳性','鸟':'阳性','树':'阳性','作业':'阳性复数','面条':'阴性复数','现金':'阴性复数','厕所':'阴性复数','同事':'通性（un / une collègue）'};
const fixes={'今天':['adv. aujourd’hui'],'明天':['adv. demain'],'昨天':['adv. hier'],'远':['adv. loin'],'学习':['v. apprendre','v. étudier'],'眼睛':['n. les yeux','n. un œil'],'衣服':['n. les vêtements'],'请':['phr. s’il vous plaît'],'老师':['n. le professeur','n. la professeure']};
const onlyReadings={'还':['hai'],'好':['hao'],'和':['he'],'给':['gei'],'觉':['jue'],'乐':['le'],'重':['zhong'],'长':['chang'],'数':['shu'],'会':['hui'],'得':['de'],'地':['di'],'的':['de'],'了':['le']};
const overlay=new Map();
function put(word,p,data){if(!valid(p))throw Error('Invalid lesson pinyin: '+word+' '+p);overlay.set(word+'#'+p,{word,pinyin:p,...data,source:'词伴常用词与短语整理（AI）',license:'GPL-3.0-or-later',review:'未独立法语编辑校审'});}
for(const [word,...original] of lines('data/glossary-fr.tsv')){
  const fields=fixes[word]||original;
  const senses=fields.map(s=>{
    const m=s.match(/^(\S+\.) (.*)$/);if(!m)throw Error('Missing lesson POS: '+word);
    const [,pos,text]=m;const detail={text,pos:posNames[pos]||pos};
    if(pos==='n.'){
      detail.gender=genders[word]||(/^le /.test(text)?'阳性':/^la /.test(text)?'阴性':'');
      detail.lemma=text.replace(/^(?:le |la |les |un |une |l['’])/,'');
      detail.article=text.match(/^(le |la |les |un |une |l['’])/u)?.[0].trim()||'';
    }else if(pos==='v.')detail.lemma=text;
    return detail;
  });
  const ps=onlyReadings[word]||[...(pronunciations.get(word)||[])];
  // Never invent pinyin or apply wildcard lessons to unrelated readings.
  for(const p of ps)put(word,p,{short:senses.map(s=>s.text),senses,note:'常用译法，词形和具体含义需随语境调整。'});
}
const phrases=lines('data/french-phrases.tsv');
const phraseReadings={'我明白了':'wo ming bai le','我很好':'wo hen hao','你好吗':'ni hao ma','很高兴认识你':'hen gao xing ren shi ni','请稍等':'qing shao deng','一会儿见':'yi hui er jian','下次见':'xia ci jian','回头见':'hui tou jian','旅途愉快':'lv tu yu kuai','我渴了':'wo ke le','我累了':'wo lei le','我生病了':'wo sheng bing le','我迷路了':'wo mi lu le','帮帮我':'bang bang wo','请帮我':'qing bang wo','我要买':'wo yao mai','便宜一点':'pian yi yi dian','我来自中国':'wo lai zi zhong guo','我住在':'wo zhu zai','去机场':'qu ji chang','去车站':'qu che zhan','一张票':'yi zhang piao','洗手间在哪里':'xi shou jian zai na li','别着急':'bie zhao ji'};
for(const [word,gloss,note] of phrases){
  for(const p of pronunciations.get(word)||[phraseReadings[word]].filter(Boolean)){const short=gloss.split(' ; ');put(word,p,{short,senses:short.map(text=>({text,pos:'会话表达 / 短语'})),note});}
}
const poly=lines('data/french-polyphones.tsv');
// An explicit duplicate reading is invalid; fix source instead of last-write-wins.
const seenPoly=new Set();
const polyPos={"d'accord":'phr.','un responsable':'n.','une réunion':'n.','pour':'prep.','à':'prep.','cible':'n.','vrai':'adj.','particule de complément':'part.','obtenir':'v.','la joie':'n.','un nombre':'n.','alors':'adv.','aimer':'v.','avec':'prep.','une religion':'n.'};
for(const [word,p,gloss,pos,note] of poly){
  const key=word+'#'+p;if(seenPoly.has(key))throw Error('Duplicate polyphone '+key);seenPoly.add(key);
  const short=gloss.split(' ; ');put(word,p,{short,senses:short.map(text=>{
    const actualPos=polyPos[text]||pos, sense={text,pos:posNames[actualPos]||actualPos};
    if(actualPos==='n.'){sense.gender=/^(?:la|une) /.test(text)?'阴性':/^(?:le|un) /.test(text)?'阳性':'';sense.lemma=text.replace(/^(?:le |la |un |une )/,'');}
    else if(actualPos==='v.')sense.lemma=text;
    return sense;
  }),note});
}
// Explicit common-word additions; never route unrelated pronunciations or invent gender.
const priority=lines('data/french-priority.tsv'), prioritySeen=new Set(), priorityKeys=new Set(), chineseAdditions=new Map();
const priorityReadings=JSON.parse(read('data/french-priority-readings.json'));
for(const [head,pos,gloss,note='常用表达；词形、主语和时态需随语境变化。'] of priority){
  const [word,supplied]=head.split('#'), explicit=supplied||priorityReadings[word];
  if(prioritySeen.has(head))throw Error('Duplicate priority source '+head);prioritySeen.add(head);
  if(!posNames[pos]||!gloss||/[\u4e00-\u9fff]/u.test(gloss)||/INVALID/.test(gloss))throw Error('Invalid priority translation '+head);
  const known=[...(pronunciations.get(word)||[])];
  if(!known.length&&!explicit)throw Error('Priority word requires explicit reading: '+word);
  if(known.length>1&&!explicit)throw Error('Priority polyphone requires explicit reading: '+word+' '+known.join('/'));
  const readings=explicit?[canonical(explicit)]:known;
  if(!known.length)for(const p of readings)chineseAdditions.set(word+'#'+p,[word,p]);
  if(known.length&&readings.some(p=>!known.includes(p)))throw Error('Priority reading does not match dictionary: '+head);
  const short=gloss.split(' ; ');
  const senses=short.map(text=>{
    const sense={text,pos:posNames[pos]};
    if(pos==='n.'){
      const article=text.match(/^(le |la |les |un |une |l[’'])/u)?.[0].trim()||'';
      sense.article=article;sense.lemma=text.replace(/^(le |la |les |un |une |l[’'])/u,'');
      if(/^(le|un)$/.test(article))sense.gender='阳性';
      if(/^(la|une)$/.test(article))sense.gender='阴性';
      // l’ and les do not establish noun gender; keep it unknown unless stated in note.
    }
    if(pos==='v.')sense.lemma=text;
    return sense;
  });
  for(const p of readings){const key=word+'#'+p;if(overlay.has(key))continue;put(word,p,{short,senses,note,category:'priority-common-2026-10-04'});priorityKeys.add(key);}
}
function output(name,map,license){
  const a=[...map].sort(([a],[b])=>a<b?-1:a>b?1:0);
  for(const [key,value]of a){
    if(/[\t\n|]/.test(key)||value.short.some(s=>!s.trim()))throw Error('Invalid glossary record '+key);
    // JSON string escapes keep each record on one TSV line. No literal pipe delimiter.
    const json=JSON.stringify(value).replace(/\|/g,'\\u007c');JSON.parse(json);
  }
  fs.writeFileSync(path.join(dir,name+'.tsv'),'# '+license+'; pronunciation-aware learning records\n'+a.map(([k,v])=>k+'\t'+JSON.stringify(v).replace(/\|/g,'\\u007c')).join('\n')+'\n');
}
output('base',base,'CFDICT / CC BY-SA 3.0');output('lessons',overlay,'词伴 AI / GPL-3.0-or-later');
fs.writeFileSync(path.join(dir,'chinese-additions.tsv'),'# 词伴日用词（AI） / GPL-3.0-or-later; frequency 1000 is a project default, not measured usage\n'+[...chineseAdditions.values()].map(([word,p])=>`${word}\t${p}\t1000`).join('\n')+'\n');
const covered=new Set(chinese.filter(e=>overlay.has(e.word+'#'+canonical(e.pinyin))||base.has(e.word+'#'+canonical(e.pinyin))).map(e=>e.word));
const top=JSON.parse(read('data/french-research/top5000.json'));
const topCoverage=[1000,5000].map(n=>({wordCount:n,coveredWords:top.slice(0,n).filter(e=>covered.has(e.word)).length}));
const missing=top.filter(e=>!covered.has(e.word));
fs.writeFileSync(path.join(dir,'review-queue.jsonl'),top.map(e=>JSON.stringify({...e,covered:covered.has(e.word),review:'pending-independent-language-review'})).join('\n')+'\n');
fs.writeFileSync(path.join(dir,'blocked-source.jsonl'),blocked.map(e=>JSON.stringify(e)).join('\n')+'\n');
fs.writeFileSync(path.join(dir,'remaining-top5000.jsonl'),missing.map(e=>JSON.stringify({...e,reason:'needs-context-or-separate-review'})).join('\n')+'\n');
const report={version:'fr-2026-10-04-v3',prioritySourceEntries:priority.length,priorityReadingEntries:priorityKeys.size,addedChineseWordReadings:chineseAdditions.size,baseReadingEntries:base.size,lessonReadingEntries:overlay.size,
  lessonHeadwords:new Set([...overlay.values()].map(x=>x.word)).size,phraseSourceEntries:phrases.length,
  phraseHeadwordsInstalled:new Set([...overlay.values()].filter(x=>x.senses[0].pos==='会话表达 / 短语').map(x=>x.word)).size,
  phraseHeadwordsOutsideWordDictionary:phrases.filter(([w])=>!pronunciations.has(w)).map(([w])=>w),
  explicitPolyphoneReadingEntries:seenPoly.size,baseHeadwords:new Set([...base.values()].map(x=>x.word)).size,
  lessonSensesWithPOS:[...overlay.values()].flatMap(x=>x.senses).filter(s=>s.pos).length,
  lessonSensesWithGender:[...overlay.values()].flatMap(x=>x.senses).filter(s=>s.gender).length,
  lessonSensesWithLemma:[...overlay.values()].flatMap(x=>x.senses).filter(s=>s.lemma).length,
  distinctChineseWords:new Set(chinese.map(x=>x.word)).size,coveredChineseWords:covered.size,topByDictionaryStaticFrequency:topCoverage,
  blockedSourceRecords:blocked.length,remainingTop5000Words:missing.length,independentLanguageReview:false,
  scope:'Exact Chinese headwords with at least one matching toneless pronunciation; not translation accuracy or usage-weighted coverage',
  licenses:{base:'CC-BY-SA-3.0',lessons:'GPL-3.0-or-later'},
  hashes:Object.fromEntries(['base.tsv','lessons.tsv','chinese-additions.tsv'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')]))};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
