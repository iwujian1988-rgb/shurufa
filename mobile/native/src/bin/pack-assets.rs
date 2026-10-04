//! 打包固定发布数据及本项目法语示例，不改写上游词条。
use qingjian_core::Language;
use qingjian_format::Metadata;
use qingjian_translate::Glossary;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("missing project path")?);
    // Optional destination preserves the same canonical packer for Windows staging.
    let assets = std::env::args().nth(2).map(PathBuf::from).unwrap_or_else(|| root.join("mobile/android/app/src"));
    let common = assets.join("main/assets/data");
    let english = assets.join("english/assets/data");
    let french = assets.join("french/assets/data");
    for path in [&common, &english, &french] {
        fs::create_dir_all(path)?;
    }
    let source = root.join(".cache/runtime-data/data/generated");
    for name in ["dict.qj", "lm.qj", "english.tsv"] {
        fs::copy(source.join(name), common.join(name))?;
    }
    fs::copy(source.join("glossary-en.qj"), english.join("glossary.qj"))?;
    let english_lessons = Glossary::from_path(
        Language::English,
        root.join("data/english-release/lessons.tsv"),
    )?;
    english_lessons.write_qj(
        &english.join("english-lessons.qj"),
        &Metadata {
            name: "词伴英语学习记录与多读音保护".into(),
            license: "GPL-3.0-or-later".into(),
            attribution: "词伴项目 AI 编写；未独立英语编辑校审".into(),
            source: "data/english-release/lessons.tsv".into(),
            version: "en-2026-10-04-v1".into(),
            entries: english_lessons.len() as u64,
            generator: "ciban pack-assets 0.4.0".into(),
        },
    )?;
    fs::copy(
        root.join("data/english-release/manifest.json"),
        english.join("english-data-manifest.json"),
    )?;
    let text = fs::read_to_string(root.join("data/glossary-fr.tsv"))?;
    let mut words = HashSet::new();
    for line in text
        .lines()
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
    {
        let word = line.split('\t').next().ok_or("missing word")?;
        if !words.insert(word) {
            return Err(format!("duplicate French word: {word}").into());
        }
    }
    let glossary = Glossary::parse(Language::French, &text)?;
    glossary.write_qj(
        &french.join("glossary.qj"),
        &Metadata {
            name: "词伴法语 demo 示例（未独立校审）".to_owned(),
            license: "GPL-3.0-or-later".to_owned(),
            attribution: "词伴项目，AI 编写；未独立校审".to_owned(),
            source: "data/glossary-fr.tsv".to_owned(),
            version: "2026-10-04-demo-v1".to_owned(),
            entries: words.len() as u64,
            generator: "ciban pack-assets 0.1.0".to_owned(),
        },
    )?;
    for (input, output, license, attribution) in [
        (
            "base.tsv",
            "french-base.qj",
            "CC-BY-SA-3.0",
            "CFDICT / Chine Informations / David Houstin 及贡献者；结构化并按读音分组；未独立校审",
        ),
        (
            "lessons.tsv",
            "french-lessons.qj",
            "GPL-3.0-or-later",
            "词伴 AI 常用词与短语整理；未独立法语编辑校审",
        ),
    ] {
        let table = Glossary::from_path(
            Language::French,
            root.join("data/french-release").join(input),
        )?;
        table.write_qj(
            &french.join(output),
            &Metadata {
                name: output.to_owned(),
                license: license.to_owned(),
                attribution: attribution.to_owned(),
                source: format!("data/french-release/{input}"),
                version: "fr-2026-10-04-v2".to_owned(),
                entries: table.len() as u64,
                generator: "ciban pack-assets 0.3.0".to_owned(),
            },
        )?;
    }
    let licenses = assets.join("main/assets/licenses");
    fs::create_dir_all(&licenses)?;
    for (path, name) in [
        ("upstream/LICENSE", "GPL-3.0.txt"),
        (
            "upstream/assets/lexicon/00_meta/THUOCL_LICENSE.txt",
            "THUOCL-MIT.txt",
        ),
        (
            "upstream/assets/lexicon/05_english/sources/ESDB_Copyright.txt",
            "ESDB-Copyright.txt",
        ),
        (
            "upstream/assets/lexicon/05_english/sources/CSpell_LICENSE-MIT.txt",
            "CSpell-MIT.txt",
        ),
        (
            "upstream/assets/lexicon/05_english/sources/typos_LICENSE-MIT.txt",
            "typos-MIT.txt",
        ),
        (
            "upstream/assets/emoji/LICENSE-unicode.txt",
            "Unicode-v3.txt",
        ),
        (
            "upstream/docs/design/landscape.md",
            "UPSTREAM-DATA-SOURCES.md",
        ),
        ("data/README.md", "DEMO-DATA.md"),
        (
            "data/french-research/LICENSE-CFDICT.md",
            "CFDICT-ATTRIBUTION.md",
        ),
        ("data/french-research/CC-BY-SA-3.0.txt", "CC-BY-SA-3.0.txt"),
    ] {
        fs::copy(root.join(path), licenses.join(name))?;
    }
    fs::copy(
        root.join("data/french-release/manifest.json"),
        french.join("french-data-manifest.json"),
    )?;
    println!(
        "已打包真实词库、二元模型、英语词表、法语读音词典与学习记录；保留兼容示例 {} 条。",
        words.len()
    );
    Ok(())
}
