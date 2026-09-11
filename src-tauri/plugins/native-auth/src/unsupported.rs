use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::{AppleSignInResult, Error, Result};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<NativeAuth<R>> {
    Ok(NativeAuth(app.clone()))
}

pub struct NativeAuth<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> NativeAuth<R> {
    pub async fn sign_in_with_apple(&self, nonce: String) -> Result<AppleSignInResult> {
        let _ = nonce;
        Err(Error::Unsupported)
    }
}
