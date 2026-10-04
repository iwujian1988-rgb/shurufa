//! English learning overlay; unresolved multiple readings never borrow a word-only gloss.
use qingjian_core::{Language, PartOfSpeech, Translation, Translator};
use qingjian_translate::Glossary;
use serde_json::{Value, json};
use std::path::Path;

pub struct EnglishLexicon {
    lessons: Glossary,
}

impl EnglishLexicon {
    pub fn load(root: &Path) -> Result<Self, String> {
        Ok(Self {
            lessons: Glossary::from_path(Language::English, root.join("english-lessons.qj"))
                .map_err(|e| e.to_string())?,
        })
    }

    pub fn lookup(
        &self,
        word: &str,
        syllables: &[String],
        fallback: Option<&Translation>,
    ) -> Option<Value> {
        let key = format!("{word}#{}", syllables.join(" ").to_lowercase());
        if let Some(translation) = self.lessons.translate(&key) {
            // Corrupt authored metadata must not silently enable a word-only fallback.
            return translation
                .senses()
                .first()
                .and_then(|s| serde_json::from_str(&s.text).ok());
        }
        let translation = fallback?;
        if translation.senses().is_empty() {
            return None;
        }
        Some(json!({
            "word":word,"pinyin":syllables.join(" "),
            "short":translation.senses().iter().map(|s|s.text.as_str()).collect::<Vec<_>>(),
            "senses":translation.senses().iter().map(|s|json!({"text":s.text,"pos":s.part_of_speech.map(pos_name).unwrap_or("")})).collect::<Vec<_>>(),
            "note":"上游词头释义；同一读音的不同声调、不同含义仍需结合完整词组和语境。未提供的词形与例句不作推断。",
            "source":"青简随包英语释义（上游机器生成）","review":"未独立英语编辑校审",
            "sourceUrl":"https://github.com/qingjian-team/qingjian","license":"随上游来源许可，见关于"
        }))
    }
}

fn pos_name(pos: PartOfSpeech) -> &'static str {
    match pos {
        PartOfSpeech::Noun => "名词",
        PartOfSpeech::Verb => "动词",
        PartOfSpeech::Adjective => "形容词",
        PartOfSpeech::Adverb => "副词",
        PartOfSpeech::Pronoun => "代词",
        PartOfSpeech::Preposition => "介词",
        PartOfSpeech::Conjunction => "连词",
        PartOfSpeech::Numeral => "数词",
        PartOfSpeech::Measure => "量词",
        PartOfSpeech::Particle => "助词",
        PartOfSpeech::Interjection => "叹词",
        PartOfSpeech::Phrase => "短语",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn overrides_and_guards_prevent_cross_reading_glosses() {
        let lessons = Glossary::parse(Language::English, "行#hang\t{\"short\":[\"line\"]}\n行#xing\t{\"short\":[\"walk\"]}\n单#shan\t{\"short\":[],\"blocked\":true}").unwrap();
        let legacy = Glossary::parse(Language::English, "单\tadj. single").unwrap();
        let lexicon = EnglishLexicon { lessons };
        let lookup =
            |word, p: &str| lexicon.lookup(word, &[p.into()], legacy.translate(word).as_ref());
        assert_eq!(lookup("行", "hang").unwrap()["short"][0], "line");
        assert_eq!(lookup("行", "xing").unwrap()["short"][0], "walk");
        assert_eq!(lookup("单", "shan").unwrap()["blocked"], true);
        assert_eq!(
            lookup("单", "shan").unwrap()["short"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
    }
    #[test]
    fn upstream_metadata_is_preserved_without_invented_grammar() {
        let lexicon = EnglishLexicon {
            lessons: Glossary::empty(Language::English),
        };
        let legacy = Glossary::parse(Language::English, "树\tn. tree").unwrap();
        let detail = lexicon
            .lookup("树", &["shu".into()], legacy.translate("树").as_ref())
            .unwrap();
        assert_eq!(detail["senses"][0]["pos"], "名词");
        assert!(detail["senses"][0].get("lemma").is_none());
        assert!(detail.get("example").is_none());
        assert!(lexicon.lookup("缺", &["que".into()], None).is_none());
    }
}
