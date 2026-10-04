//! Pronunciation-aware French annotations. Source and lesson data stay separate.
use qingjian_core::{Language, Translator};
use qingjian_translate::Glossary;
use serde_json::Value;
use std::path::Path;

pub struct FrenchLexicon {
    base: Glossary,
    lessons: Glossary,
}

impl FrenchLexicon {
    pub fn load(root: &Path) -> Result<Self, String> {
        Ok(Self {
            base: Glossary::from_path(Language::French, root.join("french-base.qj"))
                .map_err(|e| e.to_string())?,
            lessons: Glossary::from_path(Language::French, root.join("french-lessons.qj"))
                .map_err(|e| e.to_string())?,
        })
    }

    pub fn lookup(&self, word: &str, syllables: &[String]) -> Option<Value> {
        let key = format!("{word}#{}", syllables.join(" ").to_lowercase());
        let translation = self
            .lessons
            .translate(&key)
            .or_else(|| self.base.translate(&key))?;
        serde_json::from_str(&translation.senses().first()?.text).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readings_never_fall_back_to_an_unrelated_sense() {
        let base = Glossary::parse(Language::French, "行#hang\t{\"short\":[\"ligne\"]}\n行#xing\t{\"short\":[\"marcher\"]}\n还#huan\t{\"short\":[\"rendre\"]}").unwrap();
        let lessons =
            Glossary::parse(Language::French, "还#hai\t{\"short\":[\"encore\"]}").unwrap();
        let lexicon = FrenchLexicon { base, lessons };
        let lookup = |word, reading: &str| lexicon.lookup(word, &[reading.to_string()]);
        assert_eq!(lookup("行", "hang").unwrap()["short"][0], "ligne");
        assert_eq!(lookup("行", "xing").unwrap()["short"][0], "marcher");
        assert_eq!(lookup("还", "hai").unwrap()["short"][0], "encore");
        assert_eq!(lookup("还", "huan").unwrap()["short"][0], "rendre");
        assert!(lookup("行", "unknown").is_none());
    }
}
