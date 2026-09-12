use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::{Error, Result};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<NativeShare<R>> {
    Ok(NativeShare(app.clone()))
}

pub struct NativeShare<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> NativeShare<R> {
    /// Deliberately an error rather than a silent success. Every other platform
    /// has a working download path, and the caller must be told to take it — a
    /// quiet `Ok` here would look exactly like a file that saved and vanished.
    pub async fn share(&self, file_name: String, base64: String) -> Result<()> {
        let _ = (file_name, base64);
        Err(Error::Unsupported)
    }
}
