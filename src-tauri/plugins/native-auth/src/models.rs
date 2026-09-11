use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleSignInRequest {
    /// SHA-256 hex of the raw nonce the frontend keeps for Supabase.
    pub nonce: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleSignInResult {
    pub identity_token: String,
    pub authorization_code: Option<String>,
    /// Apple sends the name only on the very first sign-in for this app.
    pub given_name: Option<String>,
    pub family_name: Option<String>,
}
