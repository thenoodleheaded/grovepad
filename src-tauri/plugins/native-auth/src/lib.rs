//! Native Sign in with Apple for Grovepad's iOS app.
//!
//! A web OAuth redirect cannot return into the app (the page lives at
//! tauri://localhost), so iOS shows Apple's own sheet and hands the ID token to
//! the frontend, which trades it for a Supabase session. Every other platform
//! reports the feature as unavailable and keeps using the web flow.

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
use ios::NativeAuth;
pub use models::{AppleSignInRequest, AppleSignInResult};
#[cfg(not(target_os = "ios"))]
use unsupported::NativeAuth;

pub trait NativeAuthExt<R: Runtime> {
    fn native_auth(&self) -> &NativeAuth<R>;
}

impl<R: Runtime, T: Manager<R>> NativeAuthExt<R> for T {
    fn native_auth(&self) -> &NativeAuth<R> {
        self.state::<NativeAuth<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-auth")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            let native_auth = ios::init(app, api)?;
            #[cfg(not(target_os = "ios"))]
            let native_auth = unsupported::init(app, api)?;
            app.manage(native_auth);
            Ok(())
        })
        .build()
}
