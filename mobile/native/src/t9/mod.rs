//! 九宫格的词库索引与有界解码，数字编码独立于上游全拼缓冲区。
use qingjian_dictionary::Dictionary;
use std::collections::BTreeMap;

const BEAM: usize = 8;

pub struct T9Index {
    words: BTreeMap<String, Vec<(String, u32)>>,
    completions: BTreeMap<String, Vec<(String, u32, usize)>>,
    syllables: Vec<(String, String, u32)>,
}

impl T9Index {
    pub fn new(dictionary: &Dictionary) -> Self {
        let mut words: BTreeMap<String, Vec<(String, u32)>> = BTreeMap::new();
        let mut syllables: BTreeMap<String, u32> = BTreeMap::new();
        for entry in dictionary.entries() {
            let spelling = entry.pinyin.replace(' ', "'");
            let code = Self::encode(&spelling);
            if code.is_empty() || code.len() > 32 {
                continue;
            }
            let variants = words.entry(code).or_default();
            if let Some(existing) = variants.iter_mut().find(|(p, _)| p == &spelling) {
                existing.1 = existing.1.max(entry.frequency);
            } else {
                variants.push((spelling, entry.frequency));
            }
            for syllable in entry.pinyin.split(' ') {
                let frequency = syllables.entry(syllable.to_owned()).or_default();
                *frequency = (*frequency).max(entry.frequency);
            }
        }
        for variants in words.values_mut() {
            variants.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        }
        // Materialize only legal last-syllable completions. The old prefix range scanned
        // thousands of long words and re-encoded each pronunciation on every keystroke.
        let mut completions: BTreeMap<String, Vec<(String, u32, usize)>> = BTreeMap::new();
        for (code, variants) in &words {
            for (spelling, frequency) in variants {
                let before_last = spelling
                    .rsplit_once('\'')
                    .map_or(0, |(head, _)| Self::encode(head).len());
                for length in before_last + 1..code.len() {
                    completions
                        .entry(code[..length].to_owned())
                        .or_default()
                        .push((spelling.clone(), *frequency, code.len()));
                }
            }
        }
        let syllables = syllables
            .into_iter()
            .map(|(s, f)| {
                let code = Self::encode(&s);
                (s, code, f)
            })
            .collect();
        Self {
            words,
            completions,
            syllables,
        }
    }

    pub fn encode(pinyin: &str) -> String {
        pinyin
            .bytes()
            .filter_map(|c| match c.to_ascii_lowercase() {
                b'a'..=b'c' => Some('2'),
                b'd'..=b'f' => Some('3'),
                b'g'..=b'i' => Some('4'),
                b'j'..=b'l' => Some('5'),
                b'm'..=b'o' => Some('6'),
                b'p'..=b's' => Some('7'),
                b't'..=b'v' => Some('8'),
                b'w'..=b'z' => Some('9'),
                _ => None,
            })
            .collect()
    }

    fn compatible(spelling: &str, locked: &[String]) -> bool {
        spelling
            .split('\'')
            .zip(locked)
            .all(|(p, selected)| p == selected)
    }

    fn prune(paths: &mut Vec<(String, f64)>) {
        paths.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        let mut seen = std::collections::HashSet::new();
        paths.retain(|(p, _)| seen.insert(p.clone()));
        paths.truncate(BEAM);
    }

    /// 以词为边做有界搜索，最后一个词允许尚未输入完；不枚举 4^n 字母组合。
    pub fn decode(&self, digits: &str, locked: &[String]) -> Vec<(String, f64)> {
        if digits.is_empty()
            || digits.len() > 32
            || !digits.bytes().all(|c| (b'2'..=b'9').contains(&c))
        {
            return Vec::new();
        }
        let mut paths = vec![Vec::<(String, f64)>::new(); digits.len() + 1];
        paths[0].push((String::new(), 0.0));
        let mut completed = Vec::new();
        for start in 0..digits.len() {
            Self::prune(&mut paths[start]);
            let prefixes = paths[start].clone();
            if prefixes.is_empty() {
                continue;
            }
            for end in start + 1..=digits.len() {
                let code = &digits[start..end];
                if let Some(variants) = self.words.get(code) {
                    for (spelling, frequency) in variants {
                        for (prefix, score) in &prefixes {
                            let joined = if prefix.is_empty() {
                                spelling.clone()
                            } else {
                                format!("{prefix}'{spelling}")
                            };
                            if Self::compatible(&joined, locked) {
                                paths[end].push((
                                    joined,
                                    score + (f64::from(*frequency) + 1.0).ln() - 16.0,
                                ));
                            }
                        }
                    }
                    if paths[end].len() > BEAM * 8 {
                        Self::prune(&mut paths[end]);
                    }
                }
            }
            // 只有最后一条边可以补全，不让补全插入未输入的中间音节。
            let suffix = &digits[start..];
            if let Some(variants) = self.completions.get(suffix) {
                for (spelling, frequency, code_length) in variants {
                    for (prefix, score) in &prefixes {
                        let joined = if prefix.is_empty() {
                            spelling.clone()
                        } else {
                            format!("{prefix}'{spelling}")
                        };
                        if Self::compatible(&joined, locked) {
                            completed.push((
                                joined,
                                score + (f64::from(*frequency) + 1.0).ln()
                                    - 16.0
                                    - 3.0
                                    - (code_length - suffix.len()) as f64,
                            ));
                        }
                    }
                    if completed.len() > BEAM * 16 {
                        Self::prune(&mut completed);
                    }
                }
            }
        }
        completed.append(&mut paths[digits.len()]);
        Self::prune(&mut completed);
        completed
    }

    pub fn options(&self, digits: &str, locked: &[String]) -> Vec<String> {
        let consumed: usize = locked.iter().map(|s| Self::encode(s).len()).sum();
        let rest = digits.get(consumed..).unwrap_or("");
        if rest.is_empty() {
            return Vec::new();
        }
        let mut options: Vec<_> = self
            .syllables
            .iter()
            .filter(|(_, code, _)| rest.starts_with(code))
            .collect();
        options.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| a.0.cmp(&b.0)));
        options.into_iter().map(|(s, _, _)| s.clone()).collect()
    }
}

#[cfg(test)]
mod reference;
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires generated Android dictionary; run explicitly in release"]
    fn packed_dictionary_paths_match_reference() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../android/app/src/main/assets/data/dict.qj");
        let dictionary = Dictionary::from_path(path).unwrap();
        let indexed = T9Index::new(&dictionary);
        let reference = reference::ReferenceT9Index::new(&dictionary);
        let mut checks = 0;
        for (entry_index, entry) in dictionary.entries().enumerate() {
            if entry_index % 900 != 0 {
                continue;
            }
            let code = T9Index::encode(entry.pinyin);
            if code.is_empty() || code.len() > 32 {
                continue;
            }
            let first = entry.pinyin.split(' ').next().unwrap().to_owned();
            for length in 1..=code.len() {
                for locked in [vec![], vec![first.clone()]] {
                    assert_eq!(
                        indexed.decode(&code[..length], &locked),
                        reference.decode(&code[..length], &locked),
                        "{} / {length} / {locked:?}",
                        entry.text
                    );
                    assert_eq!(
                        indexed.options(&code[..length], &locked),
                        reference.options(&code[..length], &locked)
                    );
                    checks += 1;
                }
            }
        }
        println!(
            "PASS: {checks} actual packed-dictionary prefix/lock cases match frozen 0.4 decoding paths, scores and syllable choices"
        );
    }
    #[test]
    fn completion_index_preserves_old_paths_scores_and_syllable_choices() {
        let dictionary = Dictionary::parse("你好\tni hao\t100\n米\tmi\t200\n你\tni\t80\n好\thao\t90\n学习\txue xi\t100\n绿\tlv\t10\n西安\txi an\t10\n行\txing\t200\n行\thang\t180\n银行\tyin hang\t160\n苹果\tping guo\t150\n披萨\tpi sa\t140").unwrap();
        let indexed = T9Index::new(&dictionary);
        let reference = reference::ReferenceT9Index::new(&dictionary);
        for code in [
            "6442698394",
            "9464264",
            "74644867472",
            "9464",
            "4264",
            "222222222",
        ] {
            for length in 1..=code.len() {
                for locked in [
                    vec![],
                    vec!["ni".into()],
                    vec!["yin".into()],
                    vec!["pi".into()],
                ] {
                    assert_eq!(
                        indexed.decode(&code[..length], &locked),
                        reference.decode(&code[..length], &locked),
                        "{code}/{length}/{locked:?}"
                    );
                    assert_eq!(
                        indexed.options(&code[..length], &locked),
                        reference.options(&code[..length], &locked)
                    );
                }
            }
        }
    }
    #[test]
    fn dictionary_word_paths_and_explicit_syllables_are_bounded() {
        let dictionary = Dictionary::parse("你好\tni hao\t100\n米\tmi\t200\n你\tni\t80\n好\thao\t90\n学习\txue xi\t100\n绿\tlv\t10\n西安\txi an\t10").unwrap();
        let t9 = T9Index::new(&dictionary);
        assert_eq!(T9Index::encode("ni'hao"), "64426");
        assert_eq!(T9Index::encode("lv"), "58");
        assert!(
            t9.decode("6442698394", &[])
                .iter()
                .any(|(p, _)| p == "ni'hao'xue'xi")
        );
        assert!(
            t9.decode("64", &["ni".into()])
                .iter()
                .all(|(p, _)| p.starts_with("ni"))
        );
        assert!(t9.options("64426", &[]).contains(&"ni".into()));
        assert!(t9.options("64426", &["ni".into()]).contains(&"hao".into()));
        assert!(t9.decode(&"2".repeat(33), &[]).is_empty());
        assert!(t9.decode("invalid", &[]).is_empty());
    }
}
