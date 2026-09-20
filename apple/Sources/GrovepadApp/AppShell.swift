import Foundation
import Observation
import GrovepadCore
import GrovepadHomeWidget
import GrovepadCanvas
import GrovepadChrome
import GrovepadCloud

// ---------------------------------------------------------------------------
// The process-wide assembly the Xcode target boots: reads the bundle's
// cloud entries, builds the Supabase client and transports when they are
// present, and hands the coordinator its dependencies. One per process;
// the scene creates it, the Mac app delegate reaches it through `current`.
// ---------------------------------------------------------------------------

/// Device-local picker preferences in UserDefaults (`useWidgetPickerPrefsStore`).
public final class UserDefaultsWidgetPickerPrefs: WidgetPickerPrefs {
    public static let key = "grovepad:widget-picker-prefs:v1"
    private let defaults: UserDefaults
    private let memory: InMemoryWidgetPickerPrefs

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        var favorites: [String] = []
        var recents: [String] = []
        if let raw = defaults.string(forKey: Self.key), let object = try? JSONParser.parse(raw).objectValue {
            favorites = (object.array("favorites") ?? []).compactMap(\.stringValue)
            recents = (object.array("recents") ?? []).compactMap(\.stringValue)
        }
        memory = InMemoryWidgetPickerPrefs(favorites: favorites, recents: recents)
    }

    public var favoriteTypes: [String] { memory.favoriteTypes }
    public var recentTypes: [String] { memory.recentTypes }

    public func toggleFavorite(_ type: String) {
        memory.toggleFavorite(type)
        persist()
    }

    public func recordRecent(_ type: String) {
        memory.recordRecent(type)
        persist()
    }

    private func persist() {
        var object = JSONObject()
        object["favorites"] = .array(memory.favoriteTypes.map(JSONValue.string))
        object["recents"] = .array(memory.recentTypes.map(JSONValue.string))
        defaults.set(JSONWriter.stringify(.object(object)), forKey: Self.key)
    }
}

extension SupabaseSubscriptionSource: SubscriptionRowSource {}

@MainActor
@Observable
public final class AppShell {
    public nonisolated(unsafe) static weak var current: AppShell?
    private static var retained: AppShell?

    /// The one shell of the process: the scene takes it, and an App Intent
    /// arriving before any window opened builds it first (one store, one
    /// coordinator — never two over the same files).
    public static func obtain() -> AppShell {
        if let current { return current }
        let shell = AppShell()
        retained = shell
        return shell
    }

    public let coordinator: AppCoordinator
    public let configuration: CloudConfiguration?
    /// The login screen's account service (nil in guest-only builds).
    public let authenticator: SessionAuthenticator?
    /// Google Calendar for the calendar widget's connected skin.
    public let calendars: GoogleCalendarService?
    @ObservationIgnored private var stopStoreKitUpdates: (() -> Void)?

    public init(bundle: Bundle = .main, root: URL? = nil) {
        let root = root ?? AppPaths.applicationSupport(bundleIdentifier: bundle.bundleIdentifier)
        var deps = AppCoordinator.Dependencies(storeDirectory: AppPaths.storeDirectory(in: root))
        deps.appVersion = (bundle.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "dev"
        deps.pickerPrefs = UserDefaultsWidgetPickerPrefs()
        deps.reachability = PathMonitorReachability()
        // The home-screen widget reads its mirror from the App Group; a build
        // without one (local signing) writes beside the store instead.
        deps.homeWidgetFolder = HomeWidgetFolder.appGroup()?.url
        #if canImport(StoreKit)
        let storeKit = StoreKitTransactionSource()
        deps.entitlements = storeKit
        #endif

        let configuration = CloudSettings.configuration(bundle: bundle)
        self.configuration = configuration
        if let configuration {
            let storage = DurableAuthStorage(mirrorDirectory: AppPaths.authMirrorDirectory(in: root))
            let remembered = RememberedAccountStore(mirrorDirectory: AppPaths.authMirrorDirectory(in: root))
            let client = AuthSession.makeClient(configuration, storage: storage)
            let session = AuthSession(client: client, remembered: remembered)
            session.appleRevoker = AppleRevocation(session: session)
            deps.cloud = AppCoordinator.CloudServices(
                board: CloudBoardClient(transport: SupabaseCloudTransport(client: client)),
                media: SupabaseMediaTransport(client: client),
                auth: session,
                subscriptionRows: SupabaseSubscriptionSource(client: client),
                collaboration: { try await SupabaseCollaborationRepository.authorised(client: client) }
            )
            authenticator = SessionAuthenticator(session: session, configuration: configuration)
            calendars = GoogleCalendarService(store: deps.settingsStore, session: session, redirectTo: configuration.redirectURL)
        } else {
            authenticator = nil
            calendars = nil
        }
        coordinator = AppCoordinator(dependencies: deps)
        if let calendars {
            let coordinator = coordinator
            calendars.onConnected = { if coordinator.isGuest { coordinator.leaveGuestMode() } }
            coordinator.auth?.onProviderToken = { token, provider in
                Task { @MainActor in calendars.noteProviderToken(token, accountProvider: provider) }
            }
            coordinator.onAccountDataCleared = { calendars.forgetAll() }
            ExternalCalendars.shared.service = calendars
        }
        AppShell.current = self
        #if canImport(StoreKit)
        let subscriptions = coordinator.subscriptions
        stopStoreKitUpdates = storeKit.observeUpdates { subscriptions.refresh() }
        #endif
    }

    public func start() { coordinator.start() }

    public func shutDown() {
        stopStoreKitUpdates?()
        stopStoreKitUpdates = nil
        coordinator.dispose()
    }
}
