use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::Result;

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<NativeHaptics<R>> {
    Ok(NativeHaptics(app.clone()))
}

pub struct NativeHaptics<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> NativeHaptics<R> {
    /// Android feels the web Vibration API and desktop has nothing to drive, so
    /// this succeeds silently. A tick is advisory — no caller may branch on it.
    pub fn tap(&self, kind: String) -> Result<()> {
        let _ = kind;
        Ok(())
    }
}
