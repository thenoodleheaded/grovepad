use serde::{Deserialize, Serialize};

/// One row of the sheet. `danger` marks a destructive action, which iOS draws
/// in red without being asked — the same meaning the web menu gives the flag.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuItem {
    pub label: String,
    #[serde(default)]
    pub danger: bool,
}

/// Where the press happened, in CSS pixels from the top-left of the web view.
///
/// iPhone ignores this — the sheet always rises from the bottom — but iPad
/// presents the same sheet as a popover and RAISES without an anchor. Since
/// the webview's zoom is pinned to 1 (`ios_disable_webview_zoom`), a CSS pixel
/// is a point, so these numbers cross into UIKit unscaled.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentMenuRequest {
    pub title: Option<String>,
    pub items: Vec<MenuItem>,
    pub source_rect: SourceRect,
}

/// Which row was chosen, or `None` for a dismissal. Cancelling is an ordinary
/// outcome here, not an error: tapping outside a sheet is how iOS says "never
/// mind", and a caller must be able to tell that apart from a failure.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuChoice {
    pub index: Option<usize>,
}
