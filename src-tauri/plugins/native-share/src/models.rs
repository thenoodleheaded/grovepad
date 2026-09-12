use serde::{Deserialize, Serialize};

/// One file on its way to the system share sheet. The bytes travel base64
/// encoded because the IPC channel carries JSON, and the name travels with them
/// so the sheet offers a real filename rather than a temporary one.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareRequest {
    pub file_name: String,
    pub base64: String,
}
