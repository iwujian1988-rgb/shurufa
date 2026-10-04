//! Offline visual check of actual IPC frames using the shipping candidate row converter.
//! These images are renderer evidence, never claimed as live Windows screenshots.
#[path = "../src/ui/candidates/row.rs"]
mod row;
use qingjian_render::{FontLibrary, Frame, Layout, Preedit, Renderer, Shadow, Theme};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input = std::env::args().nth(1).ok_or("input frame JSON")?;
    let output = std::env::args().nth(2).ok_or("output prefix")?;
    let source: qingjian_platform::protocol::Frame = serde_json::from_str(&std::fs::read_to_string(input)?)?;
    let text: String = source.preedit.iter().map(|part| part.text.as_str()).collect();
    let frame = Frame {
        preedit: Some(Preedit::plain(&text, source.cursor)),
        rows: source.candidates.items.iter().enumerate().map(|(index, candidate)| row::from_candidate(index, candidate, false)).collect(),
        highlighted: Some(source.highlight),
        ..Default::default()
    };
    let mut renderer = Renderer::new(FontLibrary::system("zh-CN")?);
    for (name, theme) in [("light", Theme::light()), ("dark", Theme::dark())] {
        for (scale_name, scale) in [("100",1.0), ("150",1.5)] {
            let bitmap = renderer.render(&frame, Layout::Vertical, &theme, scale, Some(&Shadow::mac_panel()))?;
            let path = format!("{output}-{name}-{scale_name}.png");
            bitmap.pixmap.save_png(&path)?;
            println!("actual-frame renderer: {} x {} -> {path}", bitmap.pixmap.width(), bitmap.pixmap.height());
        }
    }
    Ok(())
}
