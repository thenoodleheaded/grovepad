//! The Taptic Engine, reachable from the web layer.
//!
//! iOS is the only platform here that needs a bridge at all: the web Vibration
//! API covers Android, and no desktop Grovepad ships on has a haptic surface an
//! app can drive. So this plugin is an iOS implementation plus a no-op for
//! everywhere else, rather than the usual mobile/desktop split — registering an
//! Android plugin that does not exist would fail at startup on that platform.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod error;
#[cfg(target_os = "ios")]
mod ios;
#[cfg(not(target_os = "ios"))]
mod silent;
mod models;

pub use error::{Error, Result};
#[cfg(target_os = "ios")]
use ios::NativeHaptics;
pub use models::TapRequest;
#[cfg(not(target_os = "ios"))]
use silent::NativeHaptics;

pub trait NativeHapticsExt<R: Runtime> {
    fn native_haptics(&self) -> &NativeHaptics<R>;
}

impl<R: Runtime, T: Manager<R>> NativeHapticsExt<R> for T {
    fn native_haptics(&self) -> &NativeHaptics<R> {
        self.state::<NativeHaptics<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-haptics")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            let native_haptics = ios::init(app, api)?;
            #[cfg(not(target_os = "ios"))]
            let native_haptics = silent::init(app, api)?;
            app.manage(native_haptics);
            Ok(())
        })
        .build()
}
