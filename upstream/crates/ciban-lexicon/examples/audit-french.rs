//! Verify generated French data through the same real mmap lookup used by desktop/Android.
use ciban_lexicon::french::FrenchLexicon;
use qingjian_dictionary::Dictionary;
use serde_json::{Value, json};
use std::{collections::{HashMap, HashSet}, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("project root")?);
    let data = PathBuf::from(std::env::args().nth(2).ok_or("staged data root")?);
    let output = PathBuf::from(std::env::args().nth(3).ok_or("report path")?);
    let lexicon = FrenchLexicon::load(&data)?;
    let table = fs::read_to_string(root.join("data/french-release/lessons.tsv"))?;
    let mut new_records = 0;
    for line in table.lines().filter(|line| !line.is_empty() && !line.starts_with('#')) {
        let (_, record) = line.split_once('\t').ok_or("invalid lesson")?;
        let record: Value = serde_json::from_str(record)?;
        if record["category"] != "priority-common-2026-10-04" { continue; }
        let reading: Vec<String> = record["pinyin"].as_str().ok_or("pinyin")?.split_whitespace().map(str::to_owned).collect();
        let actual = lexicon.lookup(record["word"].as_str().ok_or("word")?, &reading).ok_or("new priority meaning missing from actual mmap")?;
        assert_eq!(actual["short"], record["short"], "staged data must preserve exact authored meaning");
        new_records += 1;
    }
    for (word, pinyin, expected) in [("瓶盖", "ping gai", "le bouchon"), ("平菇", "ping gu", "le pleurote"),
        ("保鲜膜", "bao xian mo", "le film alimentaire"), ("充电宝", "chong dian bao", "la batterie externe")] {
        let reading: Vec<String> = pinyin.split_whitespace().map(str::to_owned).collect();
        assert_eq!(lexicon.lookup(word, &reading).ok_or("daily vocabulary missing")?["short"][0], expected);
        assert!(lexicon.lookup(word, &["invalid-reading".to_owned()]).is_none());
    }
    let dictionary = Dictionary::from_path(root.join(".cache/runtime-data/data/generated/dict.qj"))?;
    let staged_dictionary = Dictionary::from_path(data.join("dict.qj"))?;
    let staged: HashMap<_,_> = staged_dictionary.entries().map(|entry| ((entry.text.to_owned(),entry.pinyin.to_owned()),entry.frequency)).collect();
    for entry in dictionary.entries() {
        assert_eq!(staged.get(&(entry.text.to_owned(),entry.pinyin.to_owned())),Some(&entry.frequency),"upstream Chinese reading/frequency must remain unchanged");
    }
    let mut frequencies: HashMap<String,u32> = HashMap::new();
    let mut covered = HashSet::new();
    for entry in dictionary.entries() {
        frequencies.entry(entry.text.to_owned()).and_modify(|frequency| *frequency=(*frequency).max(entry.frequency)).or_insert(entry.frequency);
        let reading: Vec<String> = entry.pinyin.split_whitespace().map(str::to_owned).collect();
        if lexicon.lookup(entry.text, &reading).is_some() { covered.insert(entry.text.to_owned()); }
    }
    let mut ordered: Vec<_> = frequencies.iter().collect();
    ordered.sort_by(|a,b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));
    let top: Vec<_> = [1000,5000].into_iter().map(|limit| json!({"words":limit,"covered":ordered.iter().take(limit).filter(|(word,_)| covered.contains(word.as_str())).count()})).collect();
    let manifest: Value = serde_json::from_str(&fs::read_to_string(root.join("data/french-release/manifest.json"))?)?;
    assert_eq!(new_records as u64, manifest["priorityReadingEntries"].as_u64().unwrap());
    assert_eq!(covered.len() as u64, manifest["coveredChineseWords"].as_u64().unwrap());
    let report = json!({"version":manifest["version"],"actualMmapPriorityRecordsPassed":new_records,
        "uniqueOriginalChineseWords":frequencies.len(),"coveredOriginalChineseWords":covered.len(),"topByStaticFrequency":top,
        "addedChineseWordReadings":staged_dictionary.len()-dictionary.len(),"upstreamReadingsAndFrequenciesPreserved":true,
        "fixture":"bottle cap / oyster mushroom / cling film / power bank; wrong reading stays unmatched",
        "independentLanguageReview":false,"scope":"reading-matched coverage; not usage-weighted coverage or independent French accuracy approval"});
    fs::write(output, serde_json::to_string_pretty(&report)?)?;
    println!("{}", report);
    Ok(())
}
