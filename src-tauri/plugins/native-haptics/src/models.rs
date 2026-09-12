use serde::{Deserialize, Serialize};

/// The three ticks the interface can ask for. These are the web-side
/// `HapticKind` names exactly, so one vocabulary crosses the bridge and the
/// Swift side owns the translation into UIKit's generators.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TapRequest {
    pub kind: String,
}
