use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{Result, SyncRequest, SyncResult};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_widget);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<NativeWidget<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.grovepad.nativewidget", "NativeWidgetPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_native_widget)?;
    Ok(NativeWidget(handle))
}

pub struct NativeWidget<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeWidget<R> {
    pub async fn sync(&self, payload: String) -> Result<SyncResult> {
        self.0
            .run_mobile_plugin_async("syncNoteWidget", SyncRequest { payload })
            .await
            .map_err(Into::into)
    }
}
