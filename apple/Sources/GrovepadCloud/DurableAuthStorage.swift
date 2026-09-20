import Foundation
import GrovepadCore
import Supabase

// ---------------------------------------------------------------------------
// Port of `src/lib/durableAuthStorage.ts`: where the signed-in session lives.
//
// The key is ours and never moves (`grovepad:auth:v1`), and every write is
// mirrored to a file, so a boot that finds the defaults empty restores from
// the mirror instead of showing the login page. Signing out clears both.
// Keychain-free on purpose: the web keeps the session in web storage and the
// port keeps the same shape (UserDefaults + a file under Application
// Support), which also survives an app update.
// ---------------------------------------------------------------------------

public final class DurableAuthStorage: AuthLocalStorage, @unchecked Sendable {
    /// Ours, not the SDK's — a changed project reference must not sign anyone out.
    public static let storageKey = "grovepad:auth:v1"

    private let defaults: UserDefaults
    private let mirrorDirectory: URL
    private let lock = NSLock()

    public init(defaults: UserDefaults = .standard, mirrorDirectory: URL) {
        self.defaults = defaults
        self.mirrorDirectory = mirrorDirectory
    }

    /// `<Application Support>/Grovepad/auth`.
    public static func defaultMirrorDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("Grovepad", isDirectory: true).appendingPathComponent("auth", isDirectory: true)
    }

    private func defaultsKey(_ key: String) -> String { "grovepad.auth." + key }

    func mirrorURL(_ key: String) -> URL {
        mirrorDirectory.appendingPathComponent(SyncBaselineStore.fileName(key) + ".bin")
    }

    public func store(key: String, value: Data) throws {
        lock.lock(); defer { lock.unlock() }
        defaults.set(value, forKey: defaultsKey(key))
        do {
            try FileManager.default.createDirectory(at: mirrorDirectory, withIntermediateDirectories: true)
            try value.write(to: mirrorURL(key), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            // The defaults already hold the live copy; the mirror is the backup.
        }
    }

    public func retrieve(key: String) throws -> Data? {
        lock.lock(); defer { lock.unlock() }
        if let live = defaults.data(forKey: defaultsKey(key)) { return live }
        guard let mirrored = try? Data(contentsOf: mirrorURL(key)) else { return nil }
        // Put it back where the synchronous paths expect to find it.
        defaults.set(mirrored, forKey: defaultsKey(key))
        return mirrored
    }

    public func remove(key: String) throws {
        lock.lock(); defer { lock.unlock() }
        defaults.removeObject(forKey: defaultsKey(key))
        try? FileManager.default.removeItem(at: mirrorURL(key))
    }
}
