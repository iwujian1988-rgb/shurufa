//! 真实青简引擎的状态协议：候选身份随代次校验，不在平台层重排。
use crate::t9::T9Index;
use qingjian_core::{
    Candidate, CandidateKind, CandidateList, Engine, Language,
};
use qingjian_dictionary::{Dictionary, WordList};
use qingjian_learning::FrequencyLearner;
use qingjian_lm::BigramModel;
use qingjian_translate::Glossary;
use std::path::Path;

pub struct Session {
    engine: Engine,
    revision: u64,
    candidates: Vec<Candidate>,
    marked: String,
    t9: T9Index,
    nine: bool,
    digits: String,
    locked: Vec<String>,
    readings: Vec<String>,
    french: Option<crate::french::FrenchLexicon>,
    english: Option<crate::english::EnglishLexicon>,
    details: Vec<Option<serde_json::Value>>,
}

impl Session {
    pub fn load(root: &Path, language: &str) -> Result<Self, String> {
        let language = language.parse::<Language>().map_err(|e| e.to_string())?;
        let dictionary = Dictionary::from_path(root.join("dict.qj")).map_err(|e| e.to_string())?;
        let glossary =
            Glossary::from_path(language, root.join("glossary.qj")).map_err(|e| e.to_string())?;
        let english = WordList::from_path(root.join("english.tsv")).map_err(|e| e.to_string())?;
        let learner =
            FrequencyLearner::from_path(root.join("frequency.tsv")).map_err(|e| e.to_string())?;
        let model = BigramModel::from_path(&root.join("lm.qj")).map_err(|e| e.to_string())?;
        let french = if language == Language::French {
            Some(crate::french::FrenchLexicon::load(root)?)
        } else {
            None
        };
        let mut session = Self::new(
            Engine::new(dictionary)
                .with_translator(Box::new(glossary))
                .with_language_model(Box::new(model))
                .with_english(english)
                .with_learner(Box::new(learner)),
        );
        session.french = french;
        if language == Language::English {
            session.english = Some(crate::english::EnglishLexicon::load(root)?);
        }
        Ok(session)
    }

    fn new(engine: Engine) -> Self {
        let t9 = T9Index::new(engine.dictionary());
        Self {
            engine,
            revision: 0,
            candidates: Vec::new(),
            marked: String::new(),
            t9,
            nine: false,
            digits: String::new(),
            locked: Vec::new(),
            readings: Vec::new(),
            french: None,
            english: None,
            details: Vec::new(),
        }
    }

    pub fn dispatch(&mut self, request: &serde_json::Value) -> serde_json::Value {
        let mut commit = String::new();
        let mut delete = false;
        let mut rejected = false;
        match request["op"].as_str().unwrap_or("") {
            "layout" => {
                let nine = request["text"].as_str() == Some("t9");
                if nine != self.nine {
                    if nine && !self.engine.english_mode() {
                        self.digits = T9Index::encode(&self.engine.raw_preedit().text);
                    } else if !self.engine.english_mode()
                        && self.engine.raw_preedit().text.is_empty()
                    {
                        for c in self.digits.chars() {
                            self.engine.push(c);
                        }
                    }
                    self.nine = nine;
                    if !nine {
                        self.digits.clear();
                    }
                    self.locked.clear();
                }
            }
            "digit" => {
                let text = request["text"].as_str().unwrap_or("");
                if self.nine
                    && !self.engine.english_mode()
                    && self.digits.len() + text.len() <= 32
                    && text.bytes().all(|c| (b'2'..=b'9').contains(&c))
                {
                    self.digits.push_str(text);
                } else {
                    rejected = true;
                }
            }
            "syllable" => {
                let text = request["text"].as_str().unwrap_or("");
                if request["revision"].as_u64() == Some(self.revision)
                    && self
                        .t9
                        .options(&self.digits, &self.locked)
                        .iter()
                        .any(|s| s == text)
                {
                    self.locked.push(text.to_owned());
                } else {
                    rejected = true;
                }
            }
            "unlock" => {
                self.locked.clear();
            }
            "input" => {
                let input = request["text"].as_str().unwrap_or("");
                if self.engine.raw_preedit().text.len() + input.len() <= 64 {
                    for c in input
                        .chars()
                        .filter(|c| c.is_ascii_alphabetic() || *c == '\'')
                    {
                        self.engine.push(c);
                    }
                }
            }
            "delete" => {
                if self.nine && !self.engine.english_mode() && !self.digits.is_empty() {
                    self.digits.pop();
                    while self
                        .locked
                        .iter()
                        .map(|s| T9Index::encode(s).len())
                        .sum::<usize>()
                        > self.digits.len()
                    {
                        self.locked.pop();
                    }
                } else {
                    delete = !self.engine.backspace();
                }
            }
            "choose" => {
                if request["revision"].as_u64() != Some(self.revision) {
                    rejected = true;
                } else if let Some(candidate) = request["index"]
                    .as_u64()
                    .and_then(|i| self.candidates.get(i as usize))
                    .cloned()
                {
                    commit = self
                        .commit_candidate(&candidate, request["index"].as_u64().unwrap() as usize);
                } else {
                    rejected = true;
                }
            }
            "space" => {
                if let Some(candidate) = self.candidates.first().cloned() {
                    commit = self.commit_candidate(&candidate, 0);
                } else if self.engine.raw_preedit().text.is_empty() && self.digits.is_empty() {
                    commit = " ".to_owned();
                } else {
                    commit = self.take_raw();
                }
            }
            "raw" => {
                commit = self.take_raw();
            }
            "mode" => {
                commit = self.take_raw();
                self.engine
                    .set_english_mode(request["english"].as_bool().unwrap_or(false));
            }
            "reset" => {
                self.engine.discard_input();
                self.digits.clear();
                self.locked.clear();
                self.engine
                    .set_private(request["private"].as_bool().unwrap_or(false));
                self.engine
                    .set_english_mode(request["english"].as_bool().unwrap_or(false));
            }
            "flush" => {
                self.engine.flush_learning();
            }
            "state" => {}
            _ => rejected = true,
        }
        self.refresh();
        self.annotate_learning();
        let raw = if self.nine && !self.engine.english_mode() {
            self.digits.clone()
        } else {
            self.engine.raw_preedit().text
        };
        let mut syllables = if self.nine && !self.engine.english_mode() {
            self.t9.options(&self.digits, &self.locked)
        } else {
            Vec::new()
        };
        if let Some(reading) = self
            .readings
            .first()
            .and_then(|p| p.split('\'').nth(self.locked.len()))
            && let Some(index) = syllables.iter().position(|p| p == reading)
        {
            let preferred = syllables.remove(index);
            syllables.insert(0, preferred);
        }
        serde_json::json!({"revision":self.revision,"raw":raw,"marked":self.marked,
            "layout":if self.nine {"t9"} else {"qwerty"},"syllables":syllables,"locked":self.locked.join("'"),
            "commit":commit,"delete":delete,"rejected":rejected,
            "candidates":self.candidates.iter().enumerate().map(|(index,c)| serde_json::json!({
                "index":index,"text":c.text,"pinyin":c.syllables.join(" "),"detail":self.details.get(index).and_then(|d|d.as_ref()),"gloss":c.translation.as_ref().map(|t| t.senses().iter()
                    .map(|s| s.text.as_str()).collect::<Vec<_>>().join(" · ")).unwrap_or_default()
            })).collect::<Vec<_>>()})
    }

    fn annotate_learning(&mut self) {
        self.details.clear();
        if self.french.is_none() && self.english.is_none() {
            return;
        }
        for candidate in &mut self.candidates {
            let detail = if matches!(
                candidate.kind,
                CandidateKind::Chinese | CandidateKind::Sentence
            ) {
                if let Some(lexicon) = &self.french {
                    lexicon.lookup(&candidate.text, &candidate.syllables)
                } else {
                    self.english.as_ref().and_then(|lexicon| {
                        lexicon.lookup(
                            &candidate.text,
                            &candidate.syllables,
                            candidate.translation.as_ref(),
                        )
                    })
                }
            } else {
                None
            };
            // Never retain a word-only legacy annotation for a mismatched reading.
            candidate.translation = ciban_lexicon::short_translation(
                detail.as_ref(), if self.french.is_some() { Language::French } else { Language::English }
            );
            self.details.push(detail);
        }
    }

    fn refresh(&mut self) {
        self.revision += 1;
        self.candidates.clear();
        self.readings.clear();
        if self.nine && !self.engine.english_mode() {
            self.refresh_t9();
            return;
        }
        self.marked = self.engine.raw_preedit().text;
        if let Ok(mut query) = self.engine.query() {
            query.candidates.items.truncate(60);
            self.engine.annotate(&mut query.candidates);
            self.marked = query.marked_text();
            self.candidates = query.candidates.items.into_iter().take(60).collect();
        }
    }

    fn replay(&mut self, spelling: &str) {
        self.engine.clear();
        for c in spelling.chars() {
            self.engine.push(c);
        }
    }

    fn take_raw(&mut self) -> String {
        let raw = if self.nine && !self.engine.english_mode() {
            self.engine.clear();
            std::mem::take(&mut self.digits)
        } else {
            self.engine.take_raw()
        };
        self.locked.clear();
        raw
    }

    fn commit_candidate(&mut self, candidate: &Candidate, index: usize) -> String {
        if self.nine && !self.engine.english_mode() && !self.digits.is_empty() {
            let spelling = self.readings[index].clone();
            self.replay(&spelling);
            let covered = T9Index::encode(&candidate.syllables.join("'"))
                .len()
                .min(self.digits.len());
            self.digits.drain(..covered);
            let mut removed = 0;
            while self
                .locked
                .first()
                .is_some_and(|s| removed + s.len() <= covered)
            {
                removed += self.locked.remove(0).len();
            }
        }
        self.engine.commit(candidate)
    }

    fn refresh_t9(&mut self) {
        let paths = self.t9.decode(&self.digits, &self.locked);
        let primary = paths.first().map(|(p, _)| p.clone()).unwrap_or_default();
        let mut ranked = Vec::new();
        for (spelling, score) in paths {
            self.replay(&spelling);
            if let Ok(query) = self.engine.query() {
                for (rank, candidate) in query.candidates.items.into_iter().enumerate().take(30) {
                    if !matches!(
                        candidate.kind,
                        CandidateKind::Chinese | CandidateKind::Sentence
                    ) {
                        continue;
                    }
                    if !candidate
                        .syllables
                        .iter()
                        .zip(&self.locked)
                        .all(|(p, selected)| p == selected)
                    {
                        continue;
                    }
                    let code = T9Index::encode(&candidate.syllables.join("'"));
                    if code.is_empty()
                        || !(self.digits.starts_with(&code) || code.starts_with(&self.digits))
                    {
                        continue;
                    }
                    let full = code.len() >= self.digits.len();
                    ranked.push((
                        candidate,
                        spelling.clone(),
                        full,
                        score - (rank as f64 + 1.0).ln(),
                    ));
                }
            }
        }
        ranked.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| b.3.total_cmp(&a.3)));
        let mut seen = std::collections::HashSet::new();
        for (candidate, spelling, _, _) in ranked {
            if seen.insert(candidate.text.clone()) {
                self.candidates.push(candidate);
                self.readings.push(spelling);
                if self.candidates.len() == 60 {
                    break;
                }
            }
        }
        // Annotate only the deduplicated displayed candidates, rather than every
        // candidate from all eight decoding paths. Translation never affects ranking.
        let mut list = CandidateList {
            items: std::mem::take(&mut self.candidates),
        };
        self.engine.annotate(&mut list);
        self.candidates = list.items;
        self.replay(&primary);
        self.marked = if self.digits.is_empty() {
            String::new()
        } else if primary.is_empty() {
            self.digits.clone()
        } else {
            format!("{primary} · {}", self.digits)
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session() -> Session {
        let dictionary =
            Dictionary::parse("你好\tni hao\t100\n你\tni\t50\n好\thao\t20\n学习\txue xi\t100")
                .unwrap();
        let glossary =
            Glossary::parse(Language::French, "你好\tbonjour\n学习\tv. apprendre").unwrap();
        Session::new(Engine::new(dictionary).with_translator(Box::new(glossary)))
    }
    #[test]
    fn french_query_and_commit_use_real_engine() {
        let mut s = session();
        let state = s.dispatch(&serde_json::json!({"op":"input","text":"nihao"}));
        assert_eq!(state["candidates"][0]["text"], "你好");
        assert_eq!(state["candidates"][0]["gloss"], "bonjour");
        let next =
            s.dispatch(&serde_json::json!({"op":"choose","index":0,"revision":state["revision"]}));
        assert_eq!(next["commit"], "你好");
        assert_eq!(next["raw"], "");
    }
    #[test]
    fn stale_candidate_cannot_commit_another_word() {
        let mut s = session();
        let state = s.dispatch(&serde_json::json!({"op":"input","text":"ni"}));
        s.dispatch(&serde_json::json!({"op":"input","text":"hao"}));
        let next =
            s.dispatch(&serde_json::json!({"op":"choose","index":0,"revision":state["revision"]}));
        assert_eq!(next["rejected"], true);
        assert_eq!(next["commit"], "");
        assert_eq!(next["raw"], "nihao");
    }
    #[test]
    fn private_reset_discards_old_input_and_delete_falls_through() {
        let mut s = session();
        s.dispatch(&serde_json::json!({"op":"input","text":"xuexi"}));
        let state = s.dispatch(&serde_json::json!({"op":"reset","private":true}));
        assert_eq!(state["raw"], "");
        assert!(s.engine.is_private());
        assert_eq!(
            s.dispatch(&serde_json::json!({"op":"delete"}))["delete"],
            true
        );
    }
    #[test]
    fn prefix_commit_keeps_remaining_composition() {
        let mut s = session();
        let state = s.dispatch(&serde_json::json!({"op":"input","text":"nihaoxuexi"}));
        let index = state["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .position(|c| c["text"] == "你好")
            .unwrap();
        let state = s.dispatch(
            &serde_json::json!({"op":"choose","index":index,"revision":state["revision"]}),
        );
        assert_eq!(state["commit"], "你好");
        assert_eq!(state["raw"], "xuexi");
    }

    #[test]
    fn t9_phrase_prefix_commit_and_delete_preserve_digits() {
        let mut s = session();
        s.dispatch(&serde_json::json!({"op":"layout","text":"t9"}));
        let state = s.dispatch(&serde_json::json!({"op":"digit","text":"6442698394"}));
        let candidates = state["candidates"].as_array().unwrap();
        let index = candidates.iter().position(|c| c["text"] == "你好").unwrap();
        let next = s.dispatch(
            &serde_json::json!({"op":"choose","index":index,"revision":state["revision"]}),
        );
        assert_eq!(next["commit"], "你好");
        assert_eq!(next["raw"], "98394");
        assert!(
            next["candidates"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c["text"] == "学习")
        );
        let next = s.dispatch(&serde_json::json!({"op":"delete"}));
        assert_eq!(next["raw"], "9839");
        assert_eq!(next["delete"], false);
    }

    #[test]
    fn t9_syllable_revision_layout_and_private_reset_are_safe() {
        let mut s = session();
        s.dispatch(&serde_json::json!({"op":"layout","text":"t9"}));
        let state = s.dispatch(&serde_json::json!({"op":"digit","text":"64426"}));
        let selected = s.dispatch(
            &serde_json::json!({"op":"syllable","text":"ni","revision":state["revision"]}),
        );
        assert_eq!(selected["locked"], "ni");
        assert!(
            selected["syllables"]
                .as_array()
                .unwrap()
                .iter()
                .any(|s| s == "hao")
        );
        let stale = s.dispatch(
            &serde_json::json!({"op":"syllable","text":"hao","revision":state["revision"]}),
        );
        assert_eq!(stale["rejected"], true);
        assert_eq!(stale["locked"], "ni");
        let switched = s.dispatch(&serde_json::json!({"op":"layout","text":"qwerty"}));
        assert_eq!(switched["raw"], "ni'hao");
        let reset = s.dispatch(&serde_json::json!({"op":"reset","private":true,"english":true}));
        assert_eq!(reset["raw"], "");
        assert!(s.engine.is_private());
        assert_eq!(
            s.dispatch(&serde_json::json!({"op":"digit","text":"6"}))["rejected"],
            true
        );
        assert_eq!(
            s.dispatch(&serde_json::json!({"op":"input","text":"a"}))["raw"],
            "a"
        );
    }

    #[test]
    fn t9_no_match_can_be_confirmed_without_stuck_composition() {
        let mut s = session();
        s.dispatch(&serde_json::json!({"op":"layout","text":"t9"}));
        s.dispatch(&serde_json::json!({"op":"digit","text":"22222222222222222222222222222222"}));
        let state = s.dispatch(&serde_json::json!({"op":"space"}));
        assert_eq!(state["commit"], "22222222222222222222222222222222");
        assert_eq!(state["raw"], "");
    }

    #[test]
    fn selected_syllable_excludes_other_readings_of_the_same_digit_code() {
        let dictionary = Dictionary::parse(
            "你\tni\t100\n米\tmi\t1000\n你好\tni hao\t100\n米好\tmi hao\t1000\n好\thao\t100",
        )
        .unwrap();
        let mut s = Session::new(Engine::new(dictionary));
        s.dispatch(&serde_json::json!({"op":"layout","text":"t9"}));
        let state = s.dispatch(&serde_json::json!({"op":"digit","text":"64426"}));
        let state = s.dispatch(
            &serde_json::json!({"op":"syllable","text":"ni","revision":state["revision"]}),
        );
        let list = state["candidates"].as_array().unwrap();
        assert!(list.iter().any(|c| c["text"] == "你好"));
        assert!(
            list.iter()
                .all(|c| !c["text"].as_str().unwrap().starts_with('米'))
        );
    }
}
