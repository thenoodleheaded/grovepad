use base64::Engine;
use tauri::{Emitter, Manager};
use tauri_plugin_native_auth::{AppleSignInResult, NativeAuthExt};
use tauri_plugin_native_widget::{NativeWidgetExt, SyncResult};

/// Payload sent to the frontend: raw file bytes, base64-encoded for IPC. Only
/// the Rust side ever touches the filesystem — the webview never gets an fs
/// permission scope, it just receives bytes.
#[derive(Clone, serde::Serialize)]
struct OpenFilePayload {
    name: String,
    base64: String,
}

/// Holds a `.grovepad` path until the frontend's listener has mounted and can
/// pull it — avoids a startup race where Rust emits before anyone is listening.
/// Filled from the OS launch line on Windows/Linux, and from the macOS
/// `RunEvent::Opened` Apple Event, which is the ONLY way a double-clicked
/// document reaches a bundled .app (macOS never puts it in argv).
struct AppState {
    pending_open: std::sync::Mutex<Option<std::path::PathBuf>>,
    /// Flipped the first time the frontend pulls. Until then a pushed event has
    /// no listener yet, so an open request must be parked instead of emitted.
    frontend_ready: std::sync::atomic::AtomicBool,
}

fn is_grovepad_path(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("grovepad"))
}

/// The OS launch line is `[executable, ...os-supplied flags, opened-file-path]`
/// on Windows/Linux double-click. Only ever one file is opened at a time.
fn extract_grovepad_arg(args: &[String]) -> Option<std::path::PathBuf> {
    args.iter()
        .skip(1)
        .map(std::path::PathBuf::from)
        .find(|path| is_grovepad_path(path))
}

fn read_open_file_payload(path: &std::path::Path) -> Option<OpenFilePayload> {
    let bytes = std::fs::read(path).ok()?;
    let name = path.file_name()?.to_string_lossy().to_string();
    Some(OpenFilePayload {
        name,
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

/// Push a file straight to a frontend that is already listening — the app was
/// already running when the OS delivered the open request.
fn emit_open_file(app: &tauri::AppHandle, path: &std::path::Path) {
    if let Some(payload) = read_open_file_payload(path) {
        let _ = app.emit("grovepad://open-file", payload);
    }
}

/// Hand an OS open request to the frontend by whichever route can actually
/// reach it. Emitting only works once the webview has registered its listener;
/// before that — a cold start, where macOS delivers the document as an Apple
/// Event long before any JS runs — the event would fall on the floor and the
/// board would never load. So park the path instead and let the frontend's
/// one mount-time pull collect it.
fn deliver_open_file(app: &tauri::AppHandle, path: std::path::PathBuf) {
    let state = app.state::<AppState>();
    if state
        .frontend_ready
        .load(std::sync::atomic::Ordering::Acquire)
    {
        emit_open_file(app, &path);
    } else if let Ok(mut pending) = state.pending_open.lock() {
        *pending = Some(path);
    }
}

/// Cold-start pull: the frontend calls this once on mount to ask "was I
/// launched with a file?" instead of racing a pushed event against its own
/// listener registration. Reaching here also proves the listener is up, so
/// every later open request can be pushed.
#[tauri::command]
fn take_pending_open_file(state: tauri::State<AppState>) -> Option<OpenFilePayload> {
    state
        .frontend_ready
        .store(true, std::sync::atomic::Ordering::Release);
    let path = state.pending_open.lock().ok()?.take()?;
    read_open_file_payload(&path)
}

const NOTE_WIDGET_PAYLOAD_MAX_BYTES: usize = 24 * 1024;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteWidgetEnvelope {
    schema_version: u8,
    note: Option<NoteWidgetData>,
}

#[derive(serde::Deserialize)]
struct NoteWidgetData {
    id: String,
    title: String,
    text: String,
    color: String,
    mode: String,
}

fn validate_note_widget_payload(payload: &str) -> Result<(), String> {
    if payload.len() > NOTE_WIDGET_PAYLOAD_MAX_BYTES {
        return Err("Note widget payload is too large".into());
    }
    let envelope: NoteWidgetEnvelope =
        serde_json::from_str(payload).map_err(|_| "Invalid Note widget payload".to_string())?;
    if envelope.schema_version != 1 {
        return Err("Unsupported Note widget payload version".into());
    }
    let Some(note) = envelope.note else {
        return Ok(());
    };
    if note.id.is_empty()
        || note.id.chars().count() > 120
        || note.title.chars().count() > 120
        || note.text.chars().count() > 4_096
        || !matches!(
            note.color.as_str(),
            "yellow" | "pink" | "blue" | "green" | "purple"
        )
        || !matches!(note.mode.as_str(), "plain" | "sticky")
    {
        return Err("Invalid Note widget fields".into());
    }
    Ok(())
}

/// Persist a pre-rendered Note snapshot for the native widget extension.
/// The Rust boundary validates size and schema before any platform bridge sees it.
#[tauri::command]
async fn sync_note_widget(app: tauri::AppHandle, payload: String) -> Result<SyncResult, String> {
    validate_note_widget_payload(&payload)?;
    app.native_widget()
        .sync(payload)
        .await
        .map_err(|error| error.to_string())
}

/// Show Apple's native Sign in with Apple sheet (iOS app only). `nonce` is the
/// SHA-256 hex of the raw nonce the frontend keeps for Supabase, so the returned
/// ID token can only be redeemed by the request that asked for it.
#[tauri::command]
async fn sign_in_with_apple(app: tauri::AppHandle, nonce: String) -> Result<AppleSignInResult, String> {
    if nonce.len() != 64 || !nonce.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Apple sign-in needs a SHA-256 hex nonce".into());
    }
    app.native_auth()
        .sign_in_with_apple(nonce)
        .await
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Windows/Linux: a second launch (double-clicking another .grovepad file
    // while the app is already running) forwards its argv here instead of
    // opening a duplicate window. macOS reuses the running instance directly
    // via `RunEvent::Opened` and does not need this plugin, but registering
    // it is harmless there.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = extract_grovepad_arg(&argv) {
                deliver_open_file(app, path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = tauri::Builder::default();

    builder
        .plugin(tauri_plugin_native_widget::init())
        .plugin(tauri_plugin_native_auth::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let initial_open = extract_grovepad_arg(&std::env::args().collect::<Vec<_>>());
            app.manage(AppState {
                pending_open: std::sync::Mutex::new(initial_open),
                frontend_ready: std::sync::atomic::AtomicBool::new(false),
            });
            #[cfg(target_os = "ios")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.with_webview(|webview| {
                    let inner = webview.inner();
                    ios_disable_safe_area_insets(inner);
                    ios_disable_webview_zoom(inner);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_open_file,
            sync_note_widget,
            sign_in_with_apple
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS delivers EVERY document open as this Apple Event — both
            // "Open With" on a running app and a cold-start double-click, which
            // never reaches argv. On a cold start this fires long before the
            // webview has a listener, so route it through deliver_open_file:
            // it parks the path until the frontend's mount-time pull, and only
            // emits once that pull has proved someone is listening.
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        deliver_open_file(app_handle, path);
                    }
                }
            }
        });
}

/// Let the page own the whole screen on iOS.
///
/// UIKit's default `contentInsetAdjustmentBehavior` (automatic) insets the
/// WKWebView's scroll view by both safe areas, while wry still lays the page out
/// from the top edge. On an iPhone with a Dynamic Island that left the web
/// content 96pt short (62pt top + 34pt bottom) with a dead band beneath it.
/// `viewport-fit=cover` and the CSS `env(safe-area-inset-*)` padding already keep
/// the interface clear of the notch and home indicator, so the scroll view must
/// not inset a second time. wry exposes no setting for this.
#[cfg(target_os = "ios")]
fn ios_disable_safe_area_insets(webview: *mut std::ffi::c_void) {
    use objc2::runtime::AnyObject;
    // UIScrollViewContentInsetAdjustmentBehaviorNever
    const NEVER: isize = 2;
    if webview.is_null() {
        return;
    }
    unsafe {
        let webview = &*(webview as *const AnyObject);
        let scroll_view: *mut AnyObject = objc2::msg_send![webview, scrollView];
        if let Some(scroll_view) = scroll_view.as_ref() {
            let _: () = objc2::msg_send![scroll_view, setContentInsetAdjustmentBehavior: NEVER];
        }
    }
}

/// Stop the webview zooming the interface.
///
/// WKWebView ships UIScrollView's own pinch-to-zoom and double-tap-to-zoom, and
/// neither belongs in an app: the canvas already owns two-finger pinch as its
/// camera zoom (`gestureEngine`), and double-tap is one of the three presses in
/// the touch vocabulary (`tapGesture`). Left enabled, UIKit and the page fight
/// over the same fingers and the whole interface scales instead of the board.
///
/// Pinning both ends of the zoom range to 1 is the load-bearing part — it is
/// also what stops UIKit auto-zooming when a text field under 16px takes focus.
/// Disabling the recognizer only covers the deliberate gesture, so both are set.
/// `user-scalable=no` in the viewport meta would be the web answer, but WebKit
/// has ignored it since iOS 10; this is the only route left.
#[cfg(target_os = "ios")]
fn ios_disable_webview_zoom(webview: *mut std::ffi::c_void) {
    use objc2::runtime::{AnyObject, Bool};
    if webview.is_null() {
        return;
    }
    unsafe {
        let webview = &*(webview as *const AnyObject);
        let scroll_view: *mut AnyObject = objc2::msg_send![webview, scrollView];
        let Some(scroll_view) = scroll_view.as_ref() else {
            return;
        };
        let _: () = objc2::msg_send![scroll_view, setMinimumZoomScale: 1.0f64];
        let _: () = objc2::msg_send![scroll_view, setMaximumZoomScale: 1.0f64];
        let _: () = objc2::msg_send![scroll_view, setBouncesZoom: Bool::NO];
        let pinch: *mut AnyObject = objc2::msg_send![scroll_view, pinchGestureRecognizer];
        if let Some(pinch) = pinch.as_ref() {
            let _: () = objc2::msg_send![pinch, setEnabled: Bool::NO];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::validate_note_widget_payload;

    #[test]
    fn validates_note_widget_contract_and_clear_payload() {
        assert!(validate_note_widget_payload(r#"{"schemaVersion":1,"note":null}"#).is_ok());
        assert!(validate_note_widget_payload(
            r#"{"schemaVersion":1,"note":{"id":"n","title":"Title","text":"Body","color":"yellow","mode":"plain"}}"#,
        )
        .is_ok());
        assert!(validate_note_widget_payload(
            r#"{"schemaVersion":1,"note":{"id":"n","title":"Title","text":"Body","color":"orange","mode":"plain"}}"#,
        )
        .is_err());
    }
}
