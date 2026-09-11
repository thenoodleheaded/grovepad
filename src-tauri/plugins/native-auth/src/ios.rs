use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{AppleSignInRequest, AppleSignInResult, Result};

tauri::ios_plugin_binding!(init_plugin_native_auth);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<NativeAuth<R>> {
    let handle = api.register_ios_plugin(init_plugin_native_auth)?;
    Ok(NativeAuth(handle))
}

pub struct NativeAuth<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeAuth<R> {
    pub async fn sign_in_with_apple(&self, nonce: String) -> Result<AppleSignInResult> {
        self.0
            .run_mobile_plugin_async("signInWithApple", AppleSignInRequest { nonce })
            .await
            .map_err(Into::into)
    }
}
