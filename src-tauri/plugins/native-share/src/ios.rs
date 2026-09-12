use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{Result, ShareRequest};

tauri::ios_plugin_binding!(init_plugin_native_share);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<NativeShare<R>> {
    Ok(NativeShare(
        api.register_ios_plugin(init_plugin_native_share)?,
    ))
}

pub struct NativeShare<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeShare<R> {
    /// Resolves when the sheet has been PRESENTED, not when the person has
    /// chosen something. What they do with the file afterwards is between them
    /// and iOS; the app only needs to know the sheet is up so it can stop
    /// waiting and not fall back to a download that cannot work here.
    pub async fn share(&self, file_name: String, base64: String) -> Result<()> {
        self.0
            .run_mobile_plugin_async::<()>("shareFile", ShareRequest { file_name, base64 })
            .await
            .map_err(Into::into)
    }
}
