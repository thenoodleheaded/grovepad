import XCTest
import GrovepadCore
import GrovepadChrome
import GrovepadCloud
@testable import GrovepadApp

/// The account behaviour ported from the web on 19 Sep 2026: the sign-out
/// wipe (`signOutTeardown.ts`), the opt-in sync switch, the offline login
/// rule (`authGate.ts`), the typed deletion word, the profile drafts, the
/// guest backup reminder and the Google Calendar service.
@MainActor
final class AccountParityTests: XCTestCase {
    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("account")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    // MARK: - Sign-out wipe

    func testSignOutTeardownLeavesNothingOfTheAccountOnTheDevice() throws {
        let timers = ManualTimerSource()
        let coordinator = AppFixtures.coordinator(directory: directory, timers: timers, transport: FakeCloudTransport())
        coordinator.start()
        defer { coordinator.dispose() }
        coordinator.adoptAccount(AppFixtures.account())
        let session = coordinator.makeSession()
        let id = try XCTUnwrap(coordinator.document.createWidget(type: "text", at: .zero, title: "Private"))
        coordinator.flushAll()
        _ = try coordinator.store.saveSnapshot(coordinator.document.board, label: "Before")
        try coordinator.localMedia.write("media-1", MediaBlob(bytes: [1, 2, 3], type: "image/png"))
        coordinator.subscriptions.cache.write(SubscriptionCacheStore.Entry(userId: "user-1", record: nil, fetchedAt: 1))
        coordinator.noteWidget.setSelectedWidgetId(id)
        var cleared = false
        coordinator.onAccountDataCleared = { cleared = true }

        coordinator.clearAccountData()

        XCTAssertNil(coordinator.document.widget(id), "the board in memory is replaced")
        XCTAssertEqual(coordinator.document.board.widgets.count, 0)
        XCTAssertEqual(coordinator.document.board.workspaces.count, 1, "one empty workspace to carry on in")
        let reloaded = try XCTUnwrap(try LocalBoardStore(directory: directory).loadBoard())
        XCTAssertEqual(reloaded.widgets.count, 0, "the stored board is the empty one")
        XCTAssertTrue(coordinator.store.listSnapshots().isEmpty, "snapshots held the account's boards")
        XCTAssertFalse(coordinator.localMedia.contains("media-1"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: coordinator.subscriptions.cache.directory.path))
        XCTAssertNil(coordinator.noteWidget.selectedWidgetId, "the home-screen Note mirror is cleared")
        XCTAssertFalse(coordinator.isGuest)
        XCTAssertTrue(cleared, "the calendar token is dropped through the hook")
        XCTAssertEqual(session.environment.tabs.openTabs.count, 1)
        XCTAssertEqual(coordinator.document.activeCanvasId, coordinator.document.board.activeCanvasId)
    }

    // MARK: - Sync switch

    func testCloudSyncIsOptInAndRemembered() {
        let settings = InMemoryKeyValueStore()
        var deps = AppCoordinator.Dependencies(storeDirectory: directory)
        deps.settingsStore = settings
        deps.timers = ManualTimerSource()
        deps.heartbeat = FakeHeartbeat()
        deps.cloud = AppCoordinator.CloudServices(board: CloudBoardClient(transport: FakeCloudTransport()), media: FakeMediaTransport())
        let coordinator = AppCoordinator(dependencies: deps)
        XCTAssertFalse(coordinator.cloudSyncEnabled, "off until the person turns it on, as on the web")
        XCTAssertEqual(coordinator.sync?.syncEnabled, false)
        coordinator.setCloudSyncEnabled(true)
        XCTAssertEqual(settings.string(forKey: AppCoordinator.cloudSyncKey), "on")
        XCTAssertEqual(coordinator.sync?.syncEnabled, true)
        coordinator.setCloudSyncEnabled(false)
        XCTAssertEqual(settings.string(forKey: AppCoordinator.cloudSyncKey), "off")

        settings.set("on", forKey: AppCoordinator.cloudSyncKey)
        let next = AppCoordinator(dependencies: deps)
        XCTAssertTrue(next.cloudSyncEnabled)
        XCTAssertEqual(next.sync?.syncEnabled, true)
    }

    // MARK: - Login gate

    func testOfflineBootWithARememberedAccountSkipsTheLoginWall() throws {
        let suite = "grovepad-account-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let remembered = RememberedAccountStore(defaults: defaults, mirrorDirectory: directory)
        let configuration = try XCTUnwrap(CloudConfiguration.make(urlString: "https://example.supabase.co", anonKey: "anon"))
        let client = AuthSession.makeClient(configuration, storage: DurableAuthStorage(defaults: defaults, mirrorDirectory: directory))

        func coordinator(online: Bool) -> AppCoordinator {
            let reachability = ManualReachability()
            reachability.setOnline(online)
            var deps = AppCoordinator.Dependencies(storeDirectory: directory.appendingPathComponent(UUID().uuidString))
            deps.settingsStore = InMemoryKeyValueStore()
            deps.timers = ManualTimerSource()
            deps.heartbeat = FakeHeartbeat()
            deps.reachability = reachability
            deps.cloud = AppCoordinator.CloudServices(board: CloudBoardClient(transport: FakeCloudTransport()), media: FakeMediaTransport(), auth: AuthSession(client: client, remembered: remembered))
            let coordinator = AppCoordinator(dependencies: deps)
            coordinator.start()
            coordinator.adoptAccount(nil)
            return coordinator
        }

        let fresh = coordinator(online: false)
        XCTAssertTrue(fresh.needsLogin, "nobody was ever signed in here: the login page is the only way forward")
        fresh.dispose()

        remembered.write(RememberedAccount(id: "user-1", name: "Ada", color: "#34d399"))
        let offline = coordinator(online: false)
        XCTAssertFalse(offline.needsLogin, "a signed-in person offline gets their board, not a form that cannot succeed")
        offline.dispose()

        let online = coordinator(online: true)
        XCTAssertTrue(online.needsLogin, "online, a lapsed session asks again")
        online.dispose()
    }

    // MARK: - Settings ▸ Account

    func testDeletionArmsOnlyOnTheTypedWord() {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        let model = AccountViewModel(coordinator: coordinator)
        model.confirmingDeletion = true
        XCTAssertFalse(model.deletionArmed)
        model.deletionWord = "delet"
        XCTAssertFalse(model.deletionArmed)
        model.deletionWord = "  Delete "
        XCTAssertTrue(model.deletionArmed, "trimmed and case-insensitive, as on the web")
        model.confirmingDeletion = false
        XCTAssertEqual(model.deletionWord, "", "cancelling clears the word")
    }

    func testProfileDraftsFollowTheSavedProfile() {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        var metadata = JSONObject()
        metadata["full_name"] = .string("Ada Lovelace")
        metadata["profile_color"] = .string("#a78bfa")
        coordinator.adoptAccount(AccountSnapshot(userId: "user-1", email: "ada@example.com", metadata: metadata, providers: ["email"]))
        let model = AccountViewModel(coordinator: coordinator)
        model.syncDrafts()
        XCTAssertEqual(model.draftName, "Ada Lovelace")
        XCTAssertEqual(model.draftColor, "#a78bfa")
        XCTAssertFalse(model.profileChanged)
        model.draftName = "Ada Lovelace  "
        XCTAssertFalse(model.profileChanged, "surrounding spaces are not a change")
        model.draftColor = "#818cf8"
        XCTAssertTrue(model.canSaveProfile)
        model.draftName = "   "
        XCTAssertFalse(model.canSaveProfile, "an empty name never saves")
    }

    func testTheGuestReminderAppearsAtFifteenCards() {
        XCTAssertFalse(GuestBackupNudgeRule.isVisible(hasAccountService: true, signedIn: false, widgetCount: 14, dismissed: false, shaping: false))
        XCTAssertTrue(GuestBackupNudgeRule.isVisible(hasAccountService: true, signedIn: false, widgetCount: 15, dismissed: false, shaping: false))
        XCTAssertFalse(GuestBackupNudgeRule.isVisible(hasAccountService: true, signedIn: true, widgetCount: 40, dismissed: false, shaping: false))
        XCTAssertFalse(GuestBackupNudgeRule.isVisible(hasAccountService: true, signedIn: false, widgetCount: 40, dismissed: true, shaping: false))
        XCTAssertFalse(GuestBackupNudgeRule.isVisible(hasAccountService: true, signedIn: false, widgetCount: 40, dismissed: false, shaping: true))
        XCTAssertFalse(GuestBackupNudgeRule.isVisible(hasAccountService: false, signedIn: false, widgetCount: 40, dismissed: false, shaping: false), "nothing to sign in to")
    }

    // MARK: - Google Calendar

    private func response(_ status: Int, _ body: String, _ request: URLRequest) -> (Data, URLResponse) {
        (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    func testCalendarGrantKeepsTheTokenOnTheDeviceAndLoadsTheMonth() async throws {
        let store = InMemoryKeyValueStore()
        var requests: [URLRequest] = []
        let service = GoogleCalendarService(store: store, grant: { "provider-token" }) { request in
            requests.append(request)
            if request.url!.path.hasSuffix("calendarList") {
                return self.response(200, ##"{"items":[{"id":"me","summary":"Me","primary":true,"backgroundColor":"#16a765"}]}"##, request)
            }
            return self.response(200, ##"{"items":[{"id":"e1","summary":"Lecture","start":{"dateTime":"2026-09-22T10:00:00Z"},"end":{"dateTime":"2026-09-22T11:00:00Z"}}]}"##, request)
        }
        var connected = false
        service.onConnected = { connected = true }
        XCTAssertEqual(service.connectedProviders(), [])
        try await service.connect(.google)
        XCTAssertTrue(connected)
        XCTAssertEqual(store.string(forKey: ExternalCalendarRules.googleTokenKey), "provider-token")
        XCTAssertNil(store.string(forKey: ExternalCalendarRules.pendingProviderKey))
        XCTAssertEqual(service.connectedProviders(), [.google])

        let feed = try await service.loadMonth(.google, year: 2026, month: 8)
        XCTAssertEqual(feed.calendars.map(\.name), ["Me"])
        XCTAssertEqual(feed.events.map(\.title), ["Lecture"])
        XCTAssertEqual(requests.first?.value(forHTTPHeaderField: "Authorization"), "Bearer provider-token")

        service.forgetAll()
        XCTAssertEqual(service.connectedProviders(), [], "sign-out drops the token")
    }

    func testExpiredCalendarAccessDisconnects() async throws {
        let store = InMemoryKeyValueStore()
        store.set("stale", forKey: ExternalCalendarRules.googleTokenKey)
        let service = GoogleCalendarService(store: store, grant: nil) { request in self.response(401, "{}", request) }
        do {
            _ = try await service.loadMonth(.google, year: 2026, month: 8)
            XCTFail("a 401 must throw")
        } catch {
            XCTAssertEqual((error as? ExternalCalendarError)?.description, "Calendar access expired. Reconnect Google.")
        }
        XCTAssertEqual(service.connectedProviders(), [])
    }

    func testAProviderTokenIsKeptOnlyForAPendingGrantOrAGoogleAccount() {
        let store = InMemoryKeyValueStore()
        let service = GoogleCalendarService(store: store, grant: nil)
        service.noteProviderToken("apple-token", accountProvider: "apple")
        XCTAssertNil(store.string(forKey: ExternalCalendarRules.googleTokenKey))
        service.noteProviderToken("google-token", accountProvider: "google")
        XCTAssertEqual(store.string(forKey: ExternalCalendarRules.googleTokenKey), "google-token")
        store.set(nil, forKey: ExternalCalendarRules.googleTokenKey)
        store.set("google", forKey: ExternalCalendarRules.pendingProviderKey)
        service.noteProviderToken("linked-token", accountProvider: "email")
        XCTAssertEqual(store.string(forKey: ExternalCalendarRules.googleTokenKey), "linked-token", "a pending grant claims the token")
        XCTAssertNil(store.string(forKey: ExternalCalendarRules.pendingProviderKey))
    }

    func testAGrantWithoutAConfiguredBackendExplainsItself() async {
        let service = GoogleCalendarService(store: InMemoryKeyValueStore(), grant: nil)
        do {
            try await service.connect(.google)
            XCTFail("no backend, no grant")
        } catch {
            XCTAssertEqual((error as? ExternalCalendarError)?.description, "Cloud sign-in must be configured before a calendar can connect.")
        }
    }
}
