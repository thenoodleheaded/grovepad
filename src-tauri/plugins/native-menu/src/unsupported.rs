use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::{Error, MenuChoice, PresentMenuRequest, Result};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<NativeMenu<R>> {
    Ok(NativeMenu(app.clone()))
}

pub struct NativeMenu<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> NativeMenu<R> {
    /// An error, not an empty choice: every other platform draws its own menu,
    /// and the caller must be told to do that rather than concluding the person
    /// dismissed a sheet they were never shown.
    pub async fn present(&self, request: PresentMenuRequest) -> Result<MenuChoice> {
        let _ = request;
        Err(Error::Unsupported)
    }
}
