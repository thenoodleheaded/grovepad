use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::{Error, Result, SyncResult};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<NativeWidget<R>> {
    Ok(NativeWidget(app.clone()))
}

pub struct NativeWidget<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn grovepad_sync_note_widget(payload: *const std::ffi::c_char) -> i32;
}

impl<R: Runtime> NativeWidget<R> {
    pub async fn sync(&self, payload: String) -> Result<SyncResult> {
        #[cfg(target_os = "macos")]
        {
            let payload = std::ffi::CString::new(payload).map_err(|_| Error::MacOsBridge(-2))?;
            // SAFETY: the Swift bridge reads the valid C string synchronously
            // and never retains the pointer after returning.
            let code = unsafe { grovepad_sync_note_widget(payload.as_ptr()) };
            return match code {
                0 => Ok(SyncResult {
                    supported: true,
                    changed: false,
                }),
                1 => Ok(SyncResult {
                    supported: true,
                    changed: true,
                }),
                error => Err(Error::MacOsBridge(error)),
            };
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = payload;
            Ok(SyncResult {
                supported: false,
                changed: false,
            })
        }
    }
}
