//! Offline visual check of actual IPC frames using the shipping candidate row converter.
//! These images are renderer evidence, never claimed as live Windows screenshots.
#[path = "../src/ui/candidates/row.rs"]
mod row;
use qingjian_render::{FontLibrary, Frame, Layout, Preedit, Renderer, Shadow, Theme};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input = std::env::args().nth(1).ok_or("input frame JSON")?;
    let output = std::env::args().nth(2).ok_or("output prefix")?;
    let source: qingjian_platform::protocol::Frame = serde_json::from_str(&std::fs::read_to_string(&input)?)?;
    let text: String = source.preedit.iter().map(|part| part.text.as_str()).collect();
    let frame = Frame {
        preedit: Some(Preedit::plain(&text, source.cursor)),
        rows: source.candidates.items.iter().enumerate().map(|(index, candidate)| row::from_candidate(index, candidate, false)).collect(),
        highlighted: Some(source.highlight),
        footer: Some(format!("{}  ·  {}/{}", if input.contains("french") { "法语" } else { "英语" }, source.page + 1, source.page_count.max(1))),
        ..Default::default()
    };
    let mut renderer = Renderer::new(FontLibrary::system("zh-CN")?);
    for (name, theme) in [("light", Theme::ciban(false)), ("dark", Theme::ciban(true))] {
        for (scale_name, scale) in [("100",1.0), ("150",1.5)] {
            let shadow = Shadow { blur: 6.0, offset_y: 2.0, color: qingjian_render::Color::gray(0, 38) };
            let bitmap = renderer.render(&frame, Layout::Vertical, &theme, scale, Some(&shadow))?;
            let path = format!("{output}-{name}-{scale_name}.png");
            bitmap.pixmap.save_png(&path)?;
            println!("actual-frame renderer: {} x {} -> {path}", bitmap.pixmap.width(), bitmap.pixmap.height());
        }
    }
    Ok(())
}
