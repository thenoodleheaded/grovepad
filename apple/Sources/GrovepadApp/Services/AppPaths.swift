import Foundation

// ---------------------------------------------------------------------------
// Where the app keeps its files. One folder under Application Support named
// after the bundle, with the board store inside it (the split index + one
// document per canvas the storage contract describes), the sync baselines
// and caches beside it, and the auth mirror the durable storage keeps.
// ---------------------------------------------------------------------------

public enum AppPaths {
    /// `~/Library/Application Support/<bundle id>` (inside the sandbox on
    /// iOS). A missing bundle id (tests, `swift run`) falls back to `Grovepad`.
    public static func applicationSupport(bundleIdentifier: String? = Bundle.main.bundleIdentifier, fileManager: FileManager = .default) -> URL {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent(bundleIdentifier ?? "Grovepad", isDirectory: true)
    }

    /// The board store folder: `index.json`, `canvases/`, `device.json`, `snapshots/`.
    public static func storeDirectory(in root: URL) -> URL {
        root.appendingPathComponent("board", isDirectory: true)
    }

    /// The durable auth storage's file mirror.
    public static func authMirrorDirectory(in root: URL) -> URL {
        root.appendingPathComponent("auth", isDirectory: true)
    }

    /// A scratch folder for share-sheet exports; cleaned on every write.
    public static func exportsDirectory(fileManager: FileManager = .default) -> URL {
        fileManager.temporaryDirectory.appendingPathComponent("grovepad-exports", isDirectory: true)
    }
}
