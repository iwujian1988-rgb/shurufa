//! Audit actual mmap data and effective pronunciation-aware English coverage.
use ciban_native::english::EnglishLexicon;
use qingjian_core::{Language, Translator};
use qingjian_dictionary::Dictionary;
use qingjian_translate::Glossary;
use serde_json::{Value, json};
use std::{collections::HashSet, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("missing project path")?);
    let assets = root.join("mobile/android/app/src");
    let dict = Dictionary::from_path(assets.join("main/assets/data/dict.qj"))?;
    let en = assets.join("english/assets/data");
    let glossary = Glossary::from_path(Language::English, en.join("glossary.qj"))?;
    let lessons = EnglishLexicon::load(&en)?;
    let source = fs::read_to_string(root.join("data/english-release/lessons.tsv"))?;
    let mut records = 0;
    let mut guards = 0;
    for line in source
        .lines()
        .filter(|l| !l.starts_with('#') && !l.is_empty())
    {
        let (_, text) = line.split_once('\t').ok_or("invalid source row")?;
        let expected: Value = serde_json::from_str(text)?;
        let word = expected["word"].as_str().ok_or("missing word")?;
        let syllables = expected["pinyin"]
            .as_str()
            .ok_or("missing reading")?
            .split(' ')
            .map(str::to_owned)
            .collect::<Vec<_>>();
        let actual = lessons
            .lookup(word, &syllables, glossary.translate(word).as_ref())
            .ok_or("missing packed row")?;
        if actual != expected {
            return Err(format!("packed metadata differs: {word}").into());
        }
        records += 1;
        if actual["blocked"] == true {
            guards += 1;
        }
        if actual["senses"]
            .as_array()
            .is_some_and(|s| s.iter().any(|s| s.get("gender").is_some()))
        {
            return Err("French gender leaked into English".into());
        }
    }
    let mut words = HashSet::new();
    let mut legacy = HashSet::new();
    let mut covered = HashSet::new();
    let mut covered_readings = 0;
    for entry in dict.entries() {
        words.insert(entry.text.to_owned());
        let fallback = glossary.translate(entry.text);
        if fallback.is_some() {
            legacy.insert(entry.text.to_owned());
        }
        let syllables = entry
            .pinyin
            .split(' ')
            .map(str::to_owned)
            .collect::<Vec<_>>();
        if lessons
            .lookup(entry.text, &syllables, fallback.as_ref())
            .and_then(|v| v["short"].as_array().map(|a| !a.is_empty()))
            .unwrap_or(false)
        {
            covered.insert(entry.text.to_owned());
            covered_readings += 1;
        }
    }
    let lookup = |word: &str, reading: &str| {
        lessons
            .lookup(
                word,
                &reading.split(' ').map(str::to_owned).collect::<Vec<_>>(),
                glossary.translate(word).as_ref(),
            )
            .unwrap()
    };
    assert_eq!(lookup("行", "hang")["short"][0], "line");
    assert_eq!(lookup("行", "xing")["short"][1], "walk");
    assert_eq!(lookup("还", "hai")["short"][0], "still");
    assert_eq!(lookup("还", "huan")["short"][0], "return");
    assert_eq!(lookup("地", "de")["short"][0], "adverbial particle");
    assert_eq!(lookup("地", "di")["short"][0], "ground");
    assert_eq!(lookup("单", "shan")["blocked"], true);
    assert!(lookup("单", "shan")["short"].as_array().unwrap().is_empty());
    assert_eq!(lookup("银行", "yin hang")["countability"], "可数名词");
    assert_eq!(lookup("信息", "xin xi")["countability"], "不可数名词");
    assert!(
        lookup("孩子", "hai zi")["forms"]
            .as_str()
            .unwrap()
            .contains("children")
    );
    let top: Vec<Value> = serde_json::from_str(&fs::read_to_string(
        root.join("data/french-research/top5000.json"),
    )?)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "version":"0.4.0-demo","distinctChineseWords":words.len(),"upstreamCoveredWords":legacy.len(),
            "effectiveCoveredWords":covered.len(),"effectiveCoveredReadings":covered_readings,
            "missingOrGuardedWords":words.len()-covered.len(),"packedRowsChecked":records,"unresolvedReadingGuards":guards,
        "topCoverage":([1000,5000].map(|n|json!({"words":n,"covered":top.iter().take(n).filter(|e|e["word"].as_str().is_some_and(|w|covered.contains(w))).count()}))),
            "independentLanguageReview":false,"scope":"Word-count coverage with >=1 dictionary reading annotated; not frequency weighted or translation accuracy. Unresolved multi-reading glosses deliberately hidden. All authored/guard mmap records compared with source."
        }))?
    );
    Ok(())
}
