import Foundation
import GrovepadCloud

// ---------------------------------------------------------------------------
// The Supabase project the app talks to, read from the bundle the way the
// web reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from its env: two
// Info.plist entries filled from an xcconfig. Both empty (the checked-in
// default) means no account service at all — the app runs as a guest with
// every local feature and never shows the login page. No key is ever
// hardcoded here.
// ---------------------------------------------------------------------------

public enum CloudSettings {
    public static let urlKey = "GROVEPAD_SUPABASE_URL"
    public static let anonKeyKey = "GROVEPAD_SUPABASE_ANON_KEY"

    /// The configuration, or nil when either entry is missing, blank or still
    /// a placeholder (`isConfigured` on the web).
    public static func configuration(from info: [String: Any]?) -> CloudConfiguration? {
        let url = (info?[urlKey] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = (info?[anonKeyKey] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return CloudConfiguration.make(urlString: url, anonKey: key)
    }

    public static func configuration(bundle: Bundle = .main) -> CloudConfiguration? {
        configuration(from: bundle.infoDictionary)
    }
}
