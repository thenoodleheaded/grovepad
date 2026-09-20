#if os(macOS)
import AppKit

// The preview shell is a bare executable, not a bundle: `.regular` makes
// `swift run` show a window and a menu bar and let the process take focus.
let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { PreviewAppDelegate() }
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
#else
print("GrovepadPreview runs on macOS only.")
#endif
