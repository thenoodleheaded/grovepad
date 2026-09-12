use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{Result, TapRequest};

tauri::ios_plugin_binding!(init_plugin_native_haptics);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<NativeHaptics<R>> {
    Ok(NativeHaptics(api.register_ios_plugin(
        init_plugin_native_haptics,
    )?))
}

pub struct NativeHaptics<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeHaptics<R> {
    /// Synchronous on purpose. A tick that arrives after the finger has moved
    /// on is worse than no tick, so this must not queue behind anything.
    pub fn tap(&self, kind: String) -> Result<()> {
        self.0
            .run_mobile_plugin::<()>("tap", TapRequest { kind })
            .map_err(Into::into)
    }
}
