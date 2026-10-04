//! 统计当前随包中文词库的释义覆盖，不将示例条数当作完整词典。
use ciban_native::english::EnglishLexicon;
use ciban_native::french::FrenchLexicon;
use qingjian_core::{Language, Translator};
use qingjian_dictionary::Dictionary;
use qingjian_translate::Glossary;
use std::collections::HashSet;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("missing project path")?);
    let source = root.join(".cache/runtime-data/data/generated");
    let dictionary = Dictionary::from_path(source.join("dict.qj"))?;
    let words: HashSet<_> = dictionary.entries().map(|e| e.text).collect();
    let english = Glossary::from_path(Language::English, source.join("glossary-en.qj"))?;
    let english_lessons =
        EnglishLexicon::load(&root.join("mobile/android/app/src/english/assets/data"))?;
    let english_words: HashSet<_> = dictionary
        .entries()
        .filter(|e| {
            english_lessons
                .lookup(
                    e.text,
                    &e.pinyin.split(' ').map(str::to_owned).collect::<Vec<_>>(),
                    english.translate(e.text).as_ref(),
                )
                .and_then(|v| v["short"].as_array().map(|a| !a.is_empty()))
                .unwrap_or(false)
        })
        .map(|e| e.text)
        .collect();
    let french_root = root.join("mobile/android/app/src/french/assets/data");
    let french = FrenchLexicon::load(&french_root)?;
    let base = Glossary::from_path(Language::French, french_root.join("french-base.qj"))?;
    let lessons = Glossary::from_path(Language::French, french_root.join("french-lessons.qj"))?;
    let french_words: HashSet<_> = dictionary
        .entries()
        .filter(|e| {
            french
                .lookup(
                    e.text,
                    &e.pinyin.split(' ').map(str::to_owned).collect::<Vec<_>>(),
                )
                .is_some()
        })
        .map(|e| e.text)
        .collect();
    let output = serde_json::json!({
        "dictionaryEntries":dictionary.len(),"distinctChineseWords":words.len(),
        "englishGlossaryEntries":english.len(),"englishUpstreamCoveredWords":words.iter().filter(|w| english.translate(w).is_some()).count(),"englishCoveredWords":english_words.len(),
        "frenchBaseReadingEntries":base.len(),"frenchLessonReadingEntries":lessons.len(),"frenchCoveredWords":french_words.len(),
        "version":"0.4.0-demo","independentLanguageReview":false,"scope":"Word with >=1 annotated dictionary reading; English includes curated readings and unresolved-reading guards. Not frequency weighted, translation accuracy or sentence translation."
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}
