const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../mobile/android/app/src');
for(const lang of ['english','french']){
  const h=crypto.createHash('sha256');
  for(const [directory,names] of [['main',['dict.qj','lm.qj','english.tsv']],[lang,lang==='french'?['glossary.qj','french-base.qj','french-lessons.qj']:['glossary.qj','english-lessons.qj']]]){
    for(const name of names){h.update(name);h.update(fs.readFileSync(path.join(root,directory,'assets/data',name)));}
  }
  fs.writeFileSync(path.join(root,lang,'assets/data/cache-version.txt'),'v2-'+h.digest('hex').slice(0,16)+'\n');
}
