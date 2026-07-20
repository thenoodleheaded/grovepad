use base64::Engine;
use tauri::{Emitter, Manager};
use tauri_plugin_native_widget::{NativeWidgetExt, SyncResult};

/// Payload sent to the frontend: raw file bytes, base64-encoded for IPC. Only
/// the Rust side ever touches the filesystem — the webview never gets an fs
/// permission scope, it just receives bytes.
#[derive(Clone, serde::Serialize)]
struct OpenFilePayload {
    name: String,
    base64: String,
}

/// Holds a `.grovepad` path passed on the OS launch line until the frontend's
/// listener has mounted and can pull it — avoids a startup race where Rust
/// emits before anyone is listening.
struct AppState {
    pending_open: std::sync::Mutex<Option<std::path::PathBuf>>,
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

/// Cold-start pull: the frontend calls this once on mount to ask "was I
/// launched with a file?" instead of racing a pushed event against its own
/// listener registration.
#[tauri::command]
fn take_pending_open_file(state: tauri::State<AppState>) -> Option<OpenFilePayload> {
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
    attribution: String,
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
        || note.attribution.chars().count() > 120
        || !matches!(
            note.color.as_str(),
            "yellow" | "pink" | "blue" | "green" | "purple"
        )
        || !matches!(note.mode.as_str(), "plain" | "sticky" | "quote")
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
                emit_open_file(app, &path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = tauri::Builder::default();

    builder
        .plugin(tauri_plugin_native_widget::init())
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
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_open_file,
            sync_note_widget
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS: "Open With" on an already-running app arrives as this
            // Apple Event rather than a new process launch.
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        emit_open_file(app_handle, &path);
                    }
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::validate_note_widget_payload;

    #[test]
    fn validates_note_widget_contract_and_clear_payload() {
        assert!(validate_note_widget_payload(r#"{"schemaVersion":1,"note":null}"#).is_ok());
        assert!(validate_note_widget_payload(
            r#"{"schemaVersion":1,"note":{"id":"n","title":"Title","text":"Body","color":"yellow","mode":"plain","attribution":""}}"#,
        )
        .is_ok());
        assert!(validate_note_widget_payload(
            r#"{"schemaVersion":1,"note":{"id":"n","title":"Title","text":"Body","color":"orange","mode":"plain","attribution":""}}"#,
        )
        .is_err());
    }
}
