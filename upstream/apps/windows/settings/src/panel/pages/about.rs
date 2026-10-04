//! 「关于」页：版本、检查更新、许可证、随包数据的来源与署名（第三方许可要求署名在分发物里可见）、隐私与反馈。

use qingjian_platform::UpdateChannel;
use qingjian_update::Checker;
use windows_reactor::*;

use crate::panel::controls::{field, note, page};
use crate::panel::{Message, Settings};

/// QINGJIAN_VERSION 由 build.rs 给：-dev 版接 git 短哈希。
pub(crate) const VERSION: &str = env!("QINGJIAN_VERSION");

pub(crate) const WEBSITE_URL: &str = if qingjian_platform::product::IS_CIBAN { "https://maxnote.top/ciban/" } else { "https://qingjian.app" };

pub(crate) const REPOSITORY_URL: &str = if qingjian_platform::product::IS_CIBAN { "https://github.com/iwujian1988-rgb/shurufa" } else { "https://github.com/qingjian-team" };

/// 与仓库根 `LICENSE` 一致。
const LICENSE_NOTE: &str = "自由软件，GPL-3.0-or-later 许可证：可以自由使用、修改与再分发，修改后分发须同样开源。官方渠道免费。";

/// 与 macOS「关于」页一致。
const ATTRIBUTIONS: &[(&str, &str)] = &[
    (
        "词库",
        "通用规范汉字表；现代汉语常用词表（liuxilu 校对版）；THUOCL（清华大学自然语言处理实验室，MIT）；读音取自 Unihan（Unicode License v3）。",
    ),
    (
        "语言模型",
        "中文维基百科（CC BY-SA 4.0）与 LCCC（清华大学 CoAI，MIT）语料统计。",
    ),
    ("释义表", "由大语言模型（DeepSeek）生成，青简自建。"),
    ("emoji", "Unicode CLDR annotations（Unicode License v3）。"),
    (
        "英文词表",
        "ESDB / SCOWL（© Kevin Atkinson，按其许可保留版权声明）；CSpell 词典（MIT）。",
    ),
    (
        "词汇等级",
        "CEFR-J Wordlist v1.5（Yukio Tono，cefr-j.org）；Octanove Vocabulary Profile C1/C2（CC BY-SA 4.0）；JLPT 词表（tanos.co.uk，CC BY）。",
    ),
    (
        "五笔码表",
        "86 五笔极点码表（sxjudya/rime-wubi86-jidian，Apache-2.0）；编码来自上游，词频由青简词库按词面回填。",
    ),
    (
        "笔画码表",
        "CNS11643 全字庫筆順資料（數位發展部，政府資料開放授權條款第 1 版 / OFL-1.1）；大陆笔顺按通用规范字表校正。",
    ),
];

const PRIVACY_NOTE: &str = "青简不上传任何数据。开着「自动检查更新」时每天向官网读一次版本列表，请求不带任何标识，上面可以关。开着云联想时，光标附近的文字与拼音会发给你在「云服务」页填的 AI 服务商（缺省 DeepSeek）的服务器，不经过作者。「高级」页的输入日志只写在本机，可以关掉或清空。";

const FEEDBACK_NOTE: &str = "遇到问题点「打包日志到桌面」，把生成的 zip 发给作者即可（含三个进程的日志与配置文件，不含密钥）。缺省日志不含你敲的内容；排查排序问题时作者可能请你在「高级」页临时打开详细日志。";

/// 「立即检查」旁边那行字。
fn update_status(settings: &Settings) -> String {
    if settings.update_checking {
        return "正在检查…".to_owned();
    }
    if let Some(error) = &settings.update_error {
        return format!("检查失败：{error}");
    }
    let update = &settings.config.update;
    match Checker::available_in(&settings.update_state, VERSION, update) {
        Some(found) => format!("有新版本 {}", found.version),
        None if Checker::is_dev_version(VERSION) => "本地开发版，不检查更新".to_owned(),
        None if settings.update_state.checked_at > 0 => "已是最新版本".to_owned(),
        None => String::new(),
    }
}

pub(crate) fn view(settings: &Settings, context: &mut ViewContext<Settings>) -> View {
    if qingjian_platform::product::IS_CIBAN {
        return page("关于词伴", StackPanel::new().spacing(16.0).children([
            TextBlock::new().text(format!("{} · Windows 测试版", qingjian_platform::product::NAME)).font_size(24.0).font_weight(FontWeight::SEMI_BOLD).into(),
            note("打中文时顺手遇见英文或法文。候选译词用于辅助记忆，请结合完整词组和语境理解。"),
            note("PC 0.1.0-demo.1，基于青简 GPL-3.0-or-later 源码。英语与法语独立安装，共享输入引擎与读音匹配词义。源码和构建步骤在项目 GitHub。"),
            StackPanel::new().spacing(8.0).children([
                Button::new().on_click(context.message(Message::OpenWebsite)).content("打开词伴官网"),
                Button::new().on_click(context.message(Message::OpenRepository)).content("查看源码与反馈问题"),
                Button::new().on_click(context.message(Message::OpenDataDir)).content("打开个人配置与学习数据"),
                Button::new().on_click(context.message(Message::OpenLogDir)).content("打开诊断日志目录"),
            ]),
            note("中文词库、中文二元语言模型及英语基础释义沿用青简固定数据。法语基础词典为 CFDICT / Chine Informations / David Houstin 及贡献者，CC BY-SA 3.0；项目学习词与短语为 AI 整理，GPL-3.0-or-later，尚未独立语言编辑校审。所有随包许可见安装目录 licenses。"),
            note("输入内容日志、云预测和自动更新默认关闭。输入习惯学习保存在本机，可在高级页关闭。若自行启用云服务，相关上下文会发到您指定的服务商。密码框不会学习。"),
            note("当前测试包尚未签名；个别系统或商店应用可能遮挡候选窗口，管理员应用尚未完成兼容验收。任意新词组的整组翻译、完整法语纠错与变位尚未实现。"),
        ]));
    }
    let update = &settings.config.update;
    let available = Checker::available_in(&settings.update_state, VERSION, update).is_some();
    let mut update_buttons: Vec<View> = vec![
        Button::new()
            .on_click(context.message(Message::CheckUpdateNow))
            .content("立即检查"),
    ];
    if available {
        update_buttons.push(
            Button::new()
                .on_click(context.message(Message::OpenDownload))
                .content("下载新版"),
        );
    }
    update_buttons.push(note(&update_status(settings)));
    let mut attributions: Vec<View> = Vec::with_capacity(ATTRIBUTIONS.len());
    for (name, text) in ATTRIBUTIONS {
        attributions.push(note(&format!("{name}：{text}")));
    }
    let body = StackPanel::new().spacing(12.0).children([
        TextBlock::new()
            .text(format!("青简 Windows {VERSION}"))
            .font_size(16.0)
            .font_weight(FontWeight::SEMI_BOLD)
            .into(),
        // QINGJIAN_BUILD 由 build.rs 从 git 取
        note(&format!(
            "构建 {}",
            option_env!("QINGJIAN_BUILD").unwrap_or("本地构建")
        )),
        StackPanel::new()
            .orientation(Orientation::Horizontal)
            .spacing(12.0)
            .children((
                Button::new()
                    .on_click(context.message(Message::OpenWebsite))
                    .content("官网"),
                Button::new()
                    .on_click(context.message(Message::OpenRepository))
                    .content("GitHub"),
                Button::new()
                    .on_click(context.message(Message::OpenDataDir))
                    .content("打开数据目录"),
                Button::new()
                    .on_click(context.message(Message::OpenLogDir))
                    .content("打开日志目录"),
                Button::new()
                    .on_click(context.message(Message::ExportLogs))
                    .content("打包日志到桌面"),
            )),
        note(LICENSE_NOTE),
        field(
            "自动检查更新",
            "每天向官网读一次版本列表，有新版在这里提示，不会自动下载安装。",
            ToggleSwitch::new()
                .is_on(update.check)
                .on_toggled(context.callback(Message::UpdateCheck)),
        ),
        field(
            "更新渠道",
            "测试版渠道还会提示 alpha / beta / rc 版本。",
            ComboBox::new()
                .items_source(UpdateChannel::ALL.iter().map(|channel| channel.label()))
                .selected_index(
                    UpdateChannel::ALL
                        .iter()
                        .position(|channel| *channel == update.channel)
                        .unwrap_or(0),
                )
                .on_selection_changed(context.callback(Message::UpdateChannel)),
        ),
        StackPanel::new()
            .orientation(Orientation::Horizontal)
            .spacing(12.0)
            .keyed_children(
                update_buttons
                    .into_iter()
                    .enumerate()
                    .map(|(index, view)| KeyedView::new(format!("update-{index}"), view)),
            ),
        TextBlock::new()
            .text("数据来源与署名")
            .font_weight(FontWeight::SEMI_BOLD)
            .into(),
        StackPanel::new().spacing(6.0).keyed_children(
            attributions
                .into_iter()
                .enumerate()
                .map(|(index, view)| KeyedView::new(index.to_string(), view)),
        ),
        note(PRIVACY_NOTE),
        note(FEEDBACK_NOTE),
    ]);
    page("关于", body)
}
