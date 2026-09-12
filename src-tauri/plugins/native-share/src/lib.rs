//! The system share sheet.
//!
//! iOS is the only platform that needs this, and it needs it badly: WKWebView
//! ignores an `<a download>` click entirely, so every export in the app was a
//! button that did nothing. Elsewhere the web download path works, so this is
//! an iOS implementation plus a "not handled" answer that tells the caller to
//! fall back rather than pretending it saved something.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod error;
#[cfg(target_os = "ios")]
mod ios;
mod models;
#[cfg(not(target_os = "ios"))]
mod unsupported;

pub use error::{Error, Result};
#[cfg(target_os = "ios")]
use ios::NativeShare;
pub use models::ShareRequest;
#[cfg(not(target_os = "ios"))]
use unsupported::NativeShare;

pub trait NativeShareExt<R: Runtime> {
    fn native_share(&self) -> &NativeShare<R>;
}

impl<R: Runtime, T: Manager<R>> NativeShareExt<R> for T {
    fn native_share(&self) -> &NativeShare<R> {
        self.state::<NativeShare<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-share")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            let native_share = ios::init(app, api)?;
            #[cfg(not(target_os = "ios"))]
            let native_share = unsupported::init(app, api)?;
            app.manage(native_share);
            Ok(())
        })
        .build()
}
