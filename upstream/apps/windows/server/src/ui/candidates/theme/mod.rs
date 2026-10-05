//! 候选窗口主题：字体、颜色、间距。视觉层级对齐 macOS 端；GDI 没有随外观切换的语义色，浅 / 深各写一套（[`Palette`]）。

mod palette;

use windows::Win32::Foundation::COLORREF;
use windows::Win32::Graphics::Gdi::{
    CLEARTYPE_QUALITY, CLIP_DEFAULT_PRECIS, CreateFontW, DEFAULT_CHARSET, DeleteObject,
    FF_DONTCARE, HFONT, OUT_TT_PRECIS, VARIABLE_PITCH,
};
use windows::core::{PCWSTR, w};

use self::palette::Palette;

/// 常规字重；windows crate 未导出。
const FW_NORMAL: i32 = 400;

/// COLORREF 低位到高位是 R、G、B。
pub(super) const fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    COLORREF((r as u32) | ((g as u32) << 8) | ((b as u32) << 16))
}

/// 一套配色 + 按 DPI 造好的字体。字体是 GDI 资源，`Drop` 里删。
pub(crate) struct Theme {
    pub text_font: HFONT,

    pub annotation_font: HFONT,

    pub index_font: HFONT,

    /// 符号字体（状态条的齿轮 ⚙）：雅黑没有这些字形。
    pub symbol_font: HFONT,

    pub text_color: COLORREF,

    pub gloss_color: COLORREF,

    pub pos_color: COLORREF,

    /// 生词译文，比普通译文醒目。
    pub fresh_color: COLORREF,

    pub index_color: COLORREF,

    /// 云联想的云朵与文字。
    pub cloud_color: COLORREF,

    pub background: COLORREF,

    /// 当前候选的高亮底色（mac 的半透明蓝预混成不透明值，GDI 无 alpha）。
    pub highlight: COLORREF,

    /// 窗口内边距（已按 DPI 缩放）。
    pub padding: i32,

    /// 行内上下留白。
    pub row_padding: i32,

    /// 列间距。
    pub column_gap: i32,

    /// 窗口圆角半径。
    pub corner_radius: i32,
}

impl Theme {
    /// `dpi` 96 为 100%。
    pub(crate) fn new(dpi: u32, dark: bool) -> Self {
        let scale = |px: i32| (px * dpi as i32) / 96;
        // 负高度 = 字符高度（不含内部行距）。
        let font = |px: i32| create_font(-scale(px), w!("Microsoft YaHei UI"));
        let mut palette = if dark {
            Palette::dark()
        } else {
            Palette::light()
        };
        if qingjian_platform::product::IS_CIBAN {
            let colors = qingjian_render::Theme::ciban(dark).colors;
            let convert = |color: qingjian_render::Color| rgb(color.r, color.g, color.b);
            palette.text_color = convert(colors.text); palette.gloss_color = convert(colors.gloss);
            palette.pos_color = convert(colors.pos); palette.fresh_color = convert(colors.fresh);
            palette.index_color = convert(colors.index); palette.cloud_color = convert(colors.cloud);
            palette.background = convert(colors.background); palette.highlight = convert(colors.highlight);
        }
        Self {
            text_font: font(if qingjian_platform::product::IS_CIBAN { 15 } else { 16 }),
            annotation_font: font(if qingjian_platform::product::IS_CIBAN { 13 } else { 12 }),
            index_font: font(11),
            symbol_font: create_font(-scale(15), w!("Segoe UI Symbol")),
            text_color: palette.text_color,
            gloss_color: palette.gloss_color,
            pos_color: palette.pos_color,
            fresh_color: palette.fresh_color,
            index_color: palette.index_color,
            cloud_color: palette.cloud_color,
            background: palette.background,
            highlight: palette.highlight,
            padding: scale(if qingjian_platform::product::IS_CIBAN { 10 } else { 8 }),
            row_padding: scale(if qingjian_platform::product::IS_CIBAN { 3 } else { 4 }),
            column_gap: scale(if qingjian_platform::product::IS_CIBAN { 16 } else { 8 }),
            corner_radius: scale(if qingjian_platform::product::IS_CIBAN { 10 } else { 8 }),
        }
    }
}

impl Drop for Theme {
    fn drop(&mut self) {
        for font in [
            self.text_font,
            self.annotation_font,
            self.index_font,
            self.symbol_font,
        ] {
            if !font.is_invalid() {
                let _ = unsafe { DeleteObject(font.into()) };
            }
        }
    }
}

/// 缺字由 GDI 字体链回落。`height` 为负的字符高度。
fn create_font(height: i32, face: PCWSTR) -> HFONT {
    unsafe {
        CreateFontW(
            height,
            0,
            0,
            0,
            FW_NORMAL,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            OUT_TT_PRECIS,
            CLIP_DEFAULT_PRECIS,
            CLEARTYPE_QUALITY,
            (VARIABLE_PITCH.0 | FF_DONTCARE.0) as u32,
            face,
        )
    }
}
