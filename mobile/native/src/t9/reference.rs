// Frozen 0.4 decoder used only for ranking equivalence tests.
//! 九宫格的词库索引与有界解码，数字编码独立于上游全拼缓冲区。
use qingjian_dictionary::Dictionary;
use std::collections::BTreeMap;

const BEAM: usize = 8;

pub struct ReferenceT9Index {
    words: BTreeMap<String, Vec<(String, u32)>>,
    syllables: BTreeMap<String, u32>,
}

impl ReferenceT9Index {
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
        Self { words, syllables }
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
            for (code, variants) in self.words.range(suffix.to_owned()..) {
                if !code.starts_with(suffix) {
                    break;
                }
                if code.len() == suffix.len() {
                    continue;
                }
                for (spelling, frequency) in variants {
                    // 只补全当前音节，不凭一个数字补出长短语。
                    let before_last = spelling
                        .rsplit_once('\'')
                        .map_or(0, |(head, _)| Self::encode(head).len());
                    if before_last >= suffix.len() {
                        continue;
                    }
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
                                    - (code.len() - suffix.len()) as f64,
                            ));
                        }
                    }
                }
                if completed.len() > BEAM * 16 {
                    Self::prune(&mut completed);
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
            .filter(|(s, _)| rest.starts_with(&Self::encode(s)))
            .collect();
        options.sort_by(|a, b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));
        options.into_iter().map(|(s, _)| s.clone()).collect()
    }
}
