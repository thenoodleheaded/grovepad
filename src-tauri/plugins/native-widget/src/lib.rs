use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(desktop)]
mod desktop;
mod error;
#[cfg(mobile)]
mod mobile;
mod models;

#[cfg(desktop)]
use desktop::NativeWidget;
pub use error::{Error, Result};
#[cfg(mobile)]
use mobile::NativeWidget;
pub use models::{SyncRequest, SyncResult};

pub trait NativeWidgetExt<R: Runtime> {
    fn native_widget(&self) -> &NativeWidget<R>;
}

impl<R: Runtime, T: Manager<R>> NativeWidgetExt<R> for T {
    fn native_widget(&self) -> &NativeWidget<R> {
        self.state::<NativeWidget<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-widget")
        .setup(|app, api| {
            #[cfg(mobile)]
            let native_widget = mobile::init(app, api)?;
            #[cfg(desktop)]
            let native_widget = desktop::init(app, api)?;
            app.manage(native_widget);
            Ok(())
        })
        .build()
}
