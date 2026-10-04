//! Shared pronunciation-aware learning annotations for Android and Windows.
pub mod english;
pub mod french;

use qingjian_core::{Candidate, CandidateKind, Language, Sense, Translation};
use serde_json::Value;
use std::path::Path;
use english::EnglishLexicon;
use french::FrenchLexicon;

pub enum LearningLexicon {
    English(EnglishLexicon),
    French(FrenchLexicon),
}

impl LearningLexicon {
    pub fn load(language: Language, root: &Path) -> Result<Self, String> {
        match language {
            Language::English => EnglishLexicon::load(root).map(Self::English),
            Language::French => FrenchLexicon::load(root).map(Self::French),
            _ => Err("Unsupported Ciban learning language".into()),
        }
    }

    pub fn annotate(&self, candidate: &mut Candidate) -> Option<Value> {
        let detail = if matches!(candidate.kind, CandidateKind::Chinese | CandidateKind::Sentence) {
            match self {
                Self::English(lexicon) => lexicon.lookup(&candidate.text, &candidate.syllables, candidate.translation.as_ref()),
                Self::French(lexicon) => lexicon.lookup(&candidate.text, &candidate.syllables),
            }
        } else { None };
        candidate.translation = short_translation(detail.as_ref(), self.language());
        detail
    }

    pub fn language(&self) -> Language {
        match self { Self::English(_) => Language::English, Self::French(_) => Language::French }
    }
}

pub fn short_translation(detail: Option<&Value>, language: Language) -> Option<Translation> {
    detail?.get("short")?.as_array().map(|short| Translation::new(language,
        short.iter().filter_map(Value::as_str).map(|text| Sense {
            text: text.to_owned(), part_of_speech: None, reading: None, fresh: false,
        }).collect()))
}
