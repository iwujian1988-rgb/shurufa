//! Audit the exact mmap French files packaged in this release.
use ciban_native::french::FrenchLexicon;
use qingjian_dictionary::Dictionary;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("missing project root")?);
    let assets = root.join("mobile/android/app/src");
    let dictionary = Dictionary::from_path(assets.join("main/assets/data/dict.qj"))?;
    let lexicon = FrenchLexicon::load(&assets.join("french/assets/data"))?;
    let mut frequencies = HashMap::new();
    let mut covered = HashSet::new();
    let mut covered_readings = 0;
    for entry in dictionary.entries() {
        frequencies
            .entry(entry.text)
            .and_modify(|f: &mut u32| *f = (*f).max(entry.frequency))
            .or_insert(entry.frequency);
        if lexicon
            .lookup(
                entry.text,
                &entry
                    .pinyin
                    .split(' ')
                    .map(str::to_owned)
                    .collect::<Vec<_>>(),
            )
            .is_some()
        {
            covered.insert(entry.text);
            covered_readings += 1;
        }
    }
    let mut ordered: Vec<_> = frequencies.into_iter().collect();
    ordered.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
    let top: Vec<_> = [1000, 5000].into_iter().map(|n|serde_json::json!({"wordCount":n,"coveredWords":ordered.iter().take(n).filter(|(w,_)|covered.contains(w)).count()})).collect();
    for (word, pinyin, expected) in [
        ("的", "de", "liaison"),
        ("行", "hang", "ligne"),
        ("行", "xing", "marcher"),
        ("还", "hai", "encore"),
        ("还", "huan", "rendre"),
        ("我觉得", "wo jue de", "pense"),
        ("不知道", "bu zhi dao", "savoir"),
    ] {
        let data = lexicon
            .lookup(
                word,
                &pinyin.split(' ').map(str::to_owned).collect::<Vec<_>>(),
            )
            .ok_or("missing regression annotation")?;
        if !data["short"].to_string().contains(expected) {
            return Err(format!("wrong annotation for {word} / {pinyin}").into());
        }
    }
    let bank = lexicon
        .lookup("银行", &["yin".to_owned(), "hang".to_owned()])
        .ok_or("missing bank lesson")?;
    if bank["senses"][0]["gender"] != "阴性" {
        return Err("bank gender regression".into());
    }
    let report = serde_json::json!({"version":"0.4.0-demo","dictionaryEntries":dictionary.len(),"distinctChineseWords":ordered.len(),"frenchCoveredWords":covered.len(),"frenchCoveredReadingEntries":covered_readings,"topByDictionaryStaticFrequency":top,"independentLanguageReview":false,"scope":"exact headword with at least one matching toneless pronunciation; not accuracy or usage-weighted coverage","readingAndLessonRegressions":"PASS"});
    let json = serde_json::to_string_pretty(&report)?;
    std::fs::write(
        root.join("deliverables/french-data-coverage.json"),
        format!("{json}\n"),
    )?;
    println!("{json}");
    Ok(())
}
