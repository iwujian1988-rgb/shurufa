//! Audit staged French dictionary against the actual Android Chinese dictionary.
use qingjian_core::{Language, Translator};
use qingjian_dictionary::Dictionary;
use qingjian_translate::Glossary;
use std::collections::HashMap;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("missing project path")?);
    let dictionary =
        Dictionary::from_path(root.join(".cache/runtime-data/data/generated/dict.qj"))?;
    let research = root.join("data/french-research");
    let candidate = Glossary::from_path(
        Language::French,
        research.join("glossary-fr-cfdict-candidate.tsv"),
    )?;
    let current = Glossary::from_path(Language::French, root.join("data/glossary-fr.tsv"))?;
    let mut words: HashMap<&str, u32> = HashMap::new();
    for entry in dictionary.entries() {
        words
            .entry(entry.text)
            .and_modify(|frequency| *frequency = (*frequency).max(entry.frequency))
            .or_insert(entry.frequency);
    }
    let mut ordered: Vec<_> = words.into_iter().collect();
    ordered.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
    std::fs::write(
        research.join("chinese-entries.json"),
        serde_json::to_string(&dictionary.entries().map(|e| serde_json::json!({"word":e.text,"pinyin":e.pinyin,"frequency":e.frequency})).collect::<Vec<_>>())?,
    )?;
    std::fs::write(
        research.join("top5000.json"),
        serde_json::to_string(
            &ordered
                .iter()
                .take(5000)
                .map(|(w, f)| serde_json::json!({"word":w,"frequency":f}))
                .collect::<Vec<_>>(),
        )?,
    )?;
    let covered = |word: &str| candidate.translate(word).is_some();
    let top: Vec<_> = [1000, 5000, 10000]
        .into_iter()
        .map(|limit| serde_json::json!({
            "wordCount":limit,
            "candidateCoveredWords":ordered.iter().take(limit).filter(|(w, _)| covered(w)).count(),
            "currentCoveredWords":ordered.iter().take(limit).filter(|(w, _)| current.translate(w).is_some()).count()
        }))
        .collect();
    let missing: String = ordered
        .iter()
        .take(10000)
        .filter(|(w, _)| !covered(w))
        .map(|(w, f)| format!("{w}\t{f}\n"))
        .collect();
    std::fs::write(research.join("missing-top10000.tsv"), missing)?;
    let report = serde_json::json!({
        "dictionaryEntries":dictionary.len(), "distinctChineseWords":ordered.len(),
        "candidateGlossaryEntries":candidate.len(),
        "candidateCoveredWords":ordered.iter().filter(|(w, _)| covered(w)).count(),
        "candidatePlusCurrentCoveredWords":ordered.iter().filter(|(w, _)| covered(w) || current.translate(w).is_some()).count(),
        "currentCoveredWords":ordered.iter().filter(|(w, _)| current.translate(w).is_some()).count(),
        "topByDictionaryStaticFrequency":top,
        "ranking":"maximum static frequency across pronunciations of each exact Chinese headword; ties lexicographic",
        "independentLanguageReview":false,"deployedToApk":false,
        "scope":"exact word count matches, not usage-weighted coverage, translation accuracy or sentence translation"
    });
    let json = serde_json::to_string_pretty(&report)?;
    std::fs::write(research.join("coverage.json"), format!("{json}\n"))?;
    println!("{json}");
    Ok(())
}
