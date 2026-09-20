import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port of the account half of `src/store/useAuthStore.ts`: the display name
// and colour derived from a session, and the account that was signed in last
// time, kept so a boot that cannot reach the auth server does not look like
// a sign-out. Written on every successful session and erased only when
// somebody actually signs out.
// ---------------------------------------------------------------------------

public struct RememberedAccount: Equatable {
    public var id: String
    public var name: String
    public var color: String

    public init(id: String, name: String, color: String) {
        self.id = id
        self.name = name
        self.color = color
    }

    public func serialized() -> JSONObject {
        var object = JSONObject()
        object["id"] = .string(id)
        object["name"] = .string(name)
        object["color"] = .string(color)
        return object
    }

    public static func parse(_ value: JSONValue?) -> RememberedAccount? {
        guard let object = value?.objectValue, object.isString("id"), object.isString("name"), object.isString("color"),
              let id = object.string("id"), let name = object.string("name"), let color = object.string("color") else { return nil }
        return RememberedAccount(id: id, name: name, color: color)
    }
}

/// The session facts the account helpers read, without the SDK's types so
/// they are testable from a JSON snapshot.
public struct AccountSnapshot: Equatable {
    public var userId: String
    public var email: String?
    /// `user_metadata`.
    public var metadata: JSONObject
    /// `app_metadata.providers` plus every identity's provider.
    public var providers: [String]

    public init(userId: String, email: String?, metadata: JSONObject, providers: [String]) {
        self.userId = userId
        self.email = email
        self.metadata = metadata
        self.providers = providers
    }
}

public enum AccountProfile {
    static let fallbackColors = ["#34d399", "#60a5fa", "#a78bfa", "#fb7185", "#fbbf24", "#22d3ee"]

    public static let profileColors = fallbackColors + ["#2dd4bf", "#a3e635", "#fb923c", "#f87171", "#e879f9", "#818cf8"]

    /// `fallbackProfileColor`: FNV-style hash over UTF-16 units with
    /// `Math.imul`, `Math.abs`, modulo six.
    static func fallbackColor(userId: String) -> String {
        var hash: Int32 = 0
        for unit in userId.utf16 {
            hash = (hash ^ Int32(unit)) &* 16_777_619
        }
        let index = Int(hash.magnitude) % fallbackColors.count
        return fallbackColors[index]
    }

    /// `accountDisplayName`.
    public static func displayName(_ account: AccountSnapshot?) -> String {
        guard let account else { return "Guest" }
        for key in ["full_name", "name", "user_name"] {
            if let named = account.metadata.string(key), account.metadata.isString(key) {
                let trimmed = named.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return String(trimmed.prefix(60)) }
            }
        }
        if let email = account.email, let local = email.split(separator: "@", omittingEmptySubsequences: false).first, !local.isEmpty {
            return String(local.prefix(60))
        }
        return "Grovepad user"
    }

    /// `accountProfileColor`.
    public static func profileColor(_ account: AccountSnapshot?) -> String {
        guard let account else { return profileColors[0] }
        if let color = account.metadata.string("profile_color"), account.metadata.isString("profile_color"), profileColors.contains(color) {
            return color
        }
        return fallbackColor(userId: account.userId)
    }

    /// `isAppleAccount`: any identity or provider named `apple`.
    public static func isAppleAccount(_ account: AccountSnapshot?) -> Bool {
        account?.providers.contains("apple") ?? false
    }

    public struct EditError: Error, Equatable, CustomStringConvertible {
        public let description: String
        public init(description: String) { self.description = description }
    }

    /// `updateProfile`'s checks: the name trimmed and cut to 60 UTF-16
    /// units, never empty; the colour one of `profileColors`.
    public static func validatedEdit(displayName: String, profileColor: String) throws -> (name: String, color: String) {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let units = Array(trimmed.utf16)
        let name = units.count <= 60 ? trimmed : String(decoding: units.prefix(60), as: UTF16.self)
        guard !name.isEmpty else { throw EditError(description: "Enter a display name") }
        guard profileColors.contains(profileColor) else { throw EditError(description: "Choose a profile color") }
        return (name, profileColor)
    }

    public static func remembered(_ account: AccountSnapshot) -> RememberedAccount {
        RememberedAccount(id: account.userId, name: displayName(account), color: profileColor(account))
    }
}

/// `grovepad:auth:last-account:v1` in UserDefaults with a file mirror, like
/// the session itself: both survive an app update, and both are erased by
/// sign-out only.
public final class RememberedAccountStore {
    public static let key = "grovepad:auth:last-account:v1"
    public static let guestKey = "grovepad:guest:v1"

    private let defaults: UserDefaults
    private let mirrorDirectory: URL

    public init(defaults: UserDefaults = .standard, mirrorDirectory: URL) {
        self.defaults = defaults
        self.mirrorDirectory = mirrorDirectory
    }

    private var mirrorURL: URL { mirrorDirectory.appendingPathComponent("last-account.json") }

    public func read() -> RememberedAccount? {
        if let text = defaults.string(forKey: Self.key), let value = try? JSONParser.parse(text), let account = RememberedAccount.parse(value) {
            return account
        }
        guard let data = try? Data(contentsOf: mirrorURL), let value = try? JSONParser.parse(data), let account = RememberedAccount.parse(value) else { return nil }
        defaults.set(JSONWriter.stringify(value), forKey: Self.key)
        return account
    }

    /// `rememberAccount`: nil forgets (sign-out or deletion only).
    public func write(_ account: RememberedAccount?) {
        guard let account else {
            defaults.removeObject(forKey: Self.key)
            try? FileManager.default.removeItem(at: mirrorURL)
            return
        }
        let text = JSONWriter.stringify(.object(account.serialized()))
        defaults.set(text, forKey: Self.key)
        do {
            try FileManager.default.createDirectory(at: mirrorDirectory, withIntermediateDirectories: true)
            try Data(text.utf8).write(to: mirrorURL, options: .atomic)
        } catch {
            // The defaults hold the live copy.
        }
    }

    /// The guest choice persists so returning guests go straight in.
    public var isGuest: Bool {
        get { defaults.bool(forKey: Self.guestKey) }
        set {
            if newValue { defaults.set(true, forKey: Self.guestKey) } else { defaults.removeObject(forKey: Self.guestKey) }
        }
    }
}
