import Foundation
import SwiftUI
import Observation
import GrovepadCore

// ---------------------------------------------------------------------------
// Settings (`store/useSettingsStore.ts`, `SettingsPanel.tsx`,
// `settingsContracts.test.ts`), the parts that exist natively: General
// (visual quality, motion, ambient glow, magnetic hover, reset), Hotkeys
// (the shortcut table), Canvas (name, dot-grid strength, link lines — through
// the document), Account (a placeholder until phase 6), Data (usage counting
// with its plain-words state). Preferences persist through an injectable
// key-value store under the web's key, as one JSON object.
// ---------------------------------------------------------------------------

public protocol KeyValueStore: AnyObject {
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
}

public final class InMemoryKeyValueStore: KeyValueStore {
    public private(set) var values: [String: String] = [:]
    public init() {}
    public func string(forKey key: String) -> String? { values[key] }
    public func set(_ value: String?, forKey key: String) { values[key] = value }
}

extension UserDefaults: KeyValueStore {
    public func set(_ value: String?, forKey key: String) {
        if let value { set(value as Any?, forKey: key) } else { removeObject(forKey: key) }
    }
}

/// `VisualQuality`, richest first.
public enum VisualQuality: String, CaseIterable, Sendable {
    case high, balanced, low

    public var label: String {
        switch self {
        case .high: return "Full"
        case .balanced: return "Balanced"
        case .low: return "Light"
        }
    }

    public var hint: String {
        switch self {
        case .high: return "Everything on: frosted glass, ambient glow behind your cards, full animation."
        case .balanced: return "Same look with lighter effects — softer frosting, no coloured glow, quicker movement."
        case .low: return "Flat surfaces, no frosting, no glow, no animation. Best on older machines or on battery."
        }
    }

    /// `sanitizeVisualQuality`.
    public static func sanitize(_ raw: String?) -> VisualQuality { raw.flatMap(VisualQuality.init(rawValue:)) ?? .high }
}

/// The theme. The web has dark and light; a native app also offers to
/// follow the system, like every other Mac and iOS app, and does so by default.
public enum Appearance: String, CaseIterable, Sendable {
    case system, light, dark

    public var label: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    public var symbol: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max"
        case .dark: return "moon"
        }
    }
}

public struct AppPreferences: Equatable, Sendable {
    public var reduceMotion = false
    public var canvasAura = true
    public var magneticHover = true
    public var visualQuality = VisualQuality.high
    /// Device-local consent for anonymous usage counting; on by default.
    public var usageAnalytics = true
    public var appearance = Appearance.system

    public init() {}
    public static let defaults = AppPreferences()
}

/// `AnalyticsState`, in the words Settings → Data shows.
public enum AnalyticsState: String, Sendable {
    case counting, optedOut = "opted-out", unconfigured

    public var hint: String {
        switch self {
        case .counting: return "On. One anonymous count each time the app opens — nothing about your boards, your text, or who you are. No other event exists."
        case .optedOut: return "Off. Nothing is sent, and the counting code is never downloaded in the first place."
        case .unconfigured: return "Nothing is counted in this build — no counting service is set up, so this switch has nothing to send to."
        }
    }

    public static func resolve(configured: Bool, optedIn: Bool) -> AnalyticsState {
        if !configured { return .unconfigured }
        return optedIn ? .counting : .optedOut
    }
}

@Observable
public final class SettingsModel {
    public static let storageKey = "grovepad:settings:v1"

    public let document: BoardDocument
    public let chrome: ChromeState
    public private(set) var preferences: AppPreferences
    /// Whether a counting key exists in this build.
    public let analyticsConfigured: Bool
    @ObservationIgnored private let store: KeyValueStore
    @ObservationIgnored public var toast: ((String) -> Void)?

    public init(document: BoardDocument, chrome: ChromeState, store: KeyValueStore, analyticsConfigured: Bool = false) {
        self.document = document
        self.chrome = chrome
        self.store = store
        self.analyticsConfigured = analyticsConfigured
        preferences = SettingsModel.load(from: store)
        preferencesObserver = NotificationCenter.default.addObserver(forName: SettingsModel.preferencesDidChange, object: nil, queue: .main) { [weak self] note in
            guard let self, (note.object as AnyObject?) !== self else { return }
            self.reload()
        }
    }

    deinit {
        if let preferencesObserver { NotificationCenter.default.removeObserver(preferencesObserver) }
    }

    @ObservationIgnored private var preferencesObserver: NSObjectProtocol?

    /// The colour scheme the scene root asks for: nil follows the system.
    public var preferredColorScheme: ColorScheme? {
        switch preferences.appearance {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    public static let sections = SettingsSection.allCases

    public var section: SettingsSection {
        get { chrome.settingsSection }
        set { chrome.settingsSection = newValue }
    }

    public var isOpen: Bool {
        get { chrome.settingsOpen }
        set { chrome.settingsOpen = newValue }
    }

    // MARK: Preferences

    /// `loadPreferences`: unknown or corrupt data falls back per field.
    static func load(from store: KeyValueStore) -> AppPreferences {
        var preferences = AppPreferences.defaults
        guard let raw = store.string(forKey: storageKey), let object = try? JSONParser.parse(raw).objectValue else { return preferences }
        preferences.reduceMotion = object.bool("reduceMotion") ?? preferences.reduceMotion
        preferences.canvasAura = object.bool("canvasAura") ?? preferences.canvasAura
        preferences.magneticHover = object.bool("magneticHover") ?? preferences.magneticHover
        preferences.visualQuality = VisualQuality.sanitize(object.string("visualQuality"))
        preferences.usageAnalytics = object.bool("usageAnalytics") ?? preferences.usageAnalytics
        preferences.appearance = object.string("appearance").flatMap(Appearance.init(rawValue:)) ?? preferences.appearance
        return preferences
    }

    static func serialize(_ preferences: AppPreferences) -> String {
        var object = JSONObject()
        object["reduceMotion"] = .bool(preferences.reduceMotion)
        object["canvasAura"] = .bool(preferences.canvasAura)
        object["magneticHover"] = .bool(preferences.magneticHover)
        object["visualQuality"] = .string(preferences.visualQuality.rawValue)
        object["usageAnalytics"] = .bool(preferences.usageAnalytics)
        object["appearance"] = .string(preferences.appearance.rawValue)
        return JSONWriter.stringify(.object(object))
    }

    public func update(_ mutate: (inout AppPreferences) -> Void) {
        var next = preferences
        mutate(&next)
        preferences = next
        store.set(SettingsModel.serialize(next), forKey: SettingsModel.storageKey)
        NotificationCenter.default.post(name: SettingsModel.preferencesDidChange, object: self)
    }

    /// Posted after any window changes a preference, so the other windows'
    /// models (one per window) pick the change up without a relaunch.
    public static let preferencesDidChange = Notification.Name("app.grovepad.preferences-did-change")

    /// Re-read the store (another window wrote it).
    public func reload() {
        let next = SettingsModel.load(from: store)
        if next != preferences { preferences = next }
    }

    public func reset() {
        preferences = .defaults
        store.set(SettingsModel.serialize(.defaults), forKey: SettingsModel.storageKey)
        toast?("Settings reset")
    }

    /// `applyPreferences`: the lightweight tier is motion-free by definition,
    /// and the system's own Reduce Motion always wins.
    public func motionReduced(systemReduceMotion: Bool) -> Bool {
        systemReduceMotion || preferences.reduceMotion || preferences.visualQuality == .low
    }

    /// The sun/moon button: light goes dark, anything else goes light.
    public func toggleAppearance() {
        update { $0.appearance = $0.appearance == .light ? .dark : .light }
    }

    // MARK: Canvas

    public var activeCanvas: CanvasMeta? { document.canvas(document.activeCanvasId) }
    /// Realtime collaboration (the Shared switch, a pasted link); nil when
    /// the build has no cloud backend.
    public var collaboration: CollaborationChromeModel?
    /// A Viewer or Commenter on the shared canvas cannot change its settings.
    public var canvasLocked: Bool { document.editingLocked }
    public var gridIntensity: Double { activeCanvas?.gridIntensity ?? 100 }
    public var linksVisible: Bool { activeCanvas?.linksVisible ?? true }

    public func setGridIntensity(_ value: Double) {
        document.updateCanvasSettings(document.activeCanvasId, gridIntensity: value)
    }

    public func setLinksVisible(_ visible: Bool) {
        document.updateCanvasSettings(document.activeCanvasId, linksVisible: visible)
    }

    public func renameActiveCanvas(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        document.renameCanvas(document.activeCanvasId, name: trimmed)
    }

    // MARK: Data

    public var analyticsState: AnalyticsState {
        AnalyticsState.resolve(configured: analyticsConfigured, optedIn: preferences.usageAnalytics)
    }

    // MARK: Account (phase 6 fills this)

    public enum AccountStatus: Equatable, Sendable {
        case signedOut
        case signedIn(email: String)
    }

    public var account: AccountStatus = .signedOut

    /// The signed-in profile's display name and colour (`user_metadata`),
    /// which the account avatar wears; nil when signed out.
    public struct AccountBadge: Equatable, Sendable {
        public let name: String
        public let colorHex: String
        public init(name: String, colorHex: String) {
            self.name = name
            self.colorHex = colorHex
        }
    }

    public var accountBadge: AccountBadge?
    /// The app target's account section (identity, sync, subscription,
    /// sign out, delete). When set, the view draws it instead of the hint.
    @ObservationIgnored public var accountContent: (() -> AnyView)?
    /// Swaps the whole window to the app target's sign-in scene when a guest
    /// presses the account button (nil: no account service, no sign-in).
    @ObservationIgnored public var openSignIn: (() -> Void)?
    /// The app target's account panel (the card's body — identity, plan,
    /// Log out — and its extra round buttons), shown when a signed-in person
    /// presses the account button. nil: the button opens Settings ▸ Account.
    @ObservationIgnored public var accountPanelContent: ((AccountPanelActions) -> AccountPanelParts)?
    public var accountHint: String {
        switch account {
        case .signedOut: return "Sign in to sync boards across devices. Accounts arrive with the next phase."
        case .signedIn(let email): return email
        }
    }
}
