// The frontend reaches this plugin through the app's own `sign_in_with_apple`
// command, never directly, so the plugin exposes no ACL commands.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
