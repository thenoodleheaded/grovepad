use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{MenuChoice, PresentMenuRequest, Result};

tauri::ios_plugin_binding!(init_plugin_native_menu);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<NativeMenu<R>> {
    Ok(NativeMenu(api.register_ios_plugin(init_plugin_native_menu)?))
}

pub struct NativeMenu<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeMenu<R> {
    /// Resolves when the person has chosen or dismissed, so the caller can act
    /// on the answer. Unlike the share sheet there is nothing useful to do
    /// before that point — the whole purpose is the choice.
    pub async fn present(&self, request: PresentMenuRequest) -> Result<MenuChoice> {
        self.0
            .run_mobile_plugin_async("presentMenu", request)
            .await
            .map_err(Into::into)
    }
}
