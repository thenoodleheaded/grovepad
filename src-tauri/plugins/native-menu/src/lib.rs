//! The system action sheet, used as the context menu on iOS.
//!
//! The web menu this replaces draws rows about 24px tall, well under the 44px
//! pointer floor the touch contract requires, and it carries desktop affordances
//! that mean nothing on a phone. iOS already has the right surface for "here are
//! the things you can do to this" — and because it is the system's, nobody
//! expects it to wear the app's glass.

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
use ios::NativeMenu;
pub use models::{MenuChoice, MenuItem, PresentMenuRequest, SourceRect};
#[cfg(not(target_os = "ios"))]
use unsupported::NativeMenu;

pub trait NativeMenuExt<R: Runtime> {
    fn native_menu(&self) -> &NativeMenu<R>;
}

impl<R: Runtime, T: Manager<R>> NativeMenuExt<R> for T {
    fn native_menu(&self) -> &NativeMenu<R> {
        self.state::<NativeMenu<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-menu")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            let native_menu = ios::init(app, api)?;
            #[cfg(not(target_os = "ios"))]
            let native_menu = unsupported::init(app, api)?;
            app.manage(native_menu);
            Ok(())
        })
        .build()
}
