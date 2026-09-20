import Foundation
import Observation
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
import GrovepadCloud
import GrovepadCollaboration
import GrovepadHomeWidget
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

// ---------------------------------------------------------------------------
// The one owner of the document and every service around it: the local
// store at Application Support, autosave (500 ms after the last commit,
// flushed on background / quit), device state (camera per canvas, tabs),
// the circuit driver on a scene-aware heartbeat, cloud sync with the
// document as host, the media courier, the subscription state, the auth
// session, quit rules and `.grovepad` open / export. Windows are sessions
// (`WindowSession`) it mints; the SwiftUI scene reads it.
//
// Local work never waits on the cloud: every cloud path here is a
// consequence of an edit, never a gate on one. A missing Supabase config
// leaves `auth`, `sync` and `media` nil and the app in guest mode.
// ---------------------------------------------------------------------------

public enum ScenePhaseSignal: Equatable, Sendable {
    case active, inactive, background
}

/// What opening a package did.
public struct ImportOutcome: Equatable {
    public var mode: PackageImportMode
    public var title: String
    public var workspaceIds: [String]
    public var landingCanvasId: String
    public var widgetCount: Int
}

@MainActor
@Observable
public final class AppCoordinator {
    /// `scheduleSave` on the web: half a second after the last commit.
    public static let autosaveDelayMs = 500.0
    public static let deviceSaveDelayMs = 500.0

    /// The cloud half: a board service over the Supabase transport, the
    /// media bucket, and (in the app) the auth session. Tests hand in fakes.
    public struct CloudServices {
        public var board: CloudBoardService
        public var media: MediaTransport
        public var auth: AuthSession?
        public var subscriptionRows: SubscriptionRowSource?
        /// Realtime collaboration: a repository authorised for the signed-in
        /// account (`SupabaseCollaborationRepository.authorised`).
        public var collaboration: (() async throws -> CollaborationRepository?)?

        public init(board: CloudBoardService, media: MediaTransport, auth: AuthSession? = nil, subscriptionRows: SubscriptionRowSource? = nil, collaboration: (() async throws -> CollaborationRepository?)? = nil) {
            self.board = board
            self.media = media
            self.auth = auth
            self.subscriptionRows = subscriptionRows
            self.collaboration = collaboration
        }
    }

    public struct Dependencies {
        public var storeDirectory: URL
        public var timers: TimerSource = SystemTimerSource()
        public var clock: Clock = .system
        public var mint: IdMinter = .system
        public var heartbeat: HeartbeatScheduler = SceneHeartbeat()
        public var reachability: NetworkReachability? = nil
        public var cloud: CloudServices? = nil
        public var entitlements: StoreKitEntitlementSource? = nil
        public var settingsStore: KeyValueStore = UserDefaults.standard
        public var pickerPrefs: WidgetPickerPrefs = InMemoryWidgetPickerPrefs()
        public var toastScheduler: ToastScheduler = MainQueueToastScheduler()
        public var appVersion: String = "dev"
        public var frameScheduler: () -> FrameScheduler = { DisplayLinkScheduler() }
        // Phase 7 OS integration seams (nil = the real system service).
        /// The WidgetKit Note payload file; nil = the App Group container.
        public var noteWidgetFileURL: URL? = nil
        public var widgetReloader: WidgetTimelineReloader? = nil
        /// The home-screen widget's mirror folder; nil = a folder beside the
        /// store (tests, the preview shell). The app passes the App Group's.
        public var homeWidgetFolder: URL? = nil
        public var searchIndex: SearchableIndexing? = nil
        public var haptics: Haptics? = nil

        public init(storeDirectory: URL) {
            self.storeDirectory = storeDirectory
        }
    }

    public let store: LocalBoardStore
    public let document: BoardDocument
    public let undoManager: UndoManager
    public let clock: Clock
    public let mint: IdMinter
    public let timers: TimerSource
    public let appVersion: String
    public let heartbeat: HeartbeatScheduler
    public let settingsStore: KeyValueStore
    public let pickerPrefs: WidgetPickerPrefs
    public let toastScheduler: ToastScheduler
    public let driver: CircuitDriver
    public let sync: CloudSyncEngine?
    public let media: MediaSyncService?
    public let localMedia: LocalMediaStore
    public let subscriptions: SubscriptionController
    public let auth: AuthSession?
    public let reachability: NetworkReachability?
    public let baselines: SyncBaselineStore
    /// Phase 7: the Note widget mirror, the Spotlight index, the haptic ticks.
    public let noteWidget: NoteWidgetSync
    /// The "Grovepad Widget" mirror: every canvas and card, for the home screen.
    public let homeWidgets: HomeWidgetSync
    public let spotlight: SpotlightIndexer
    public let hapticWiring: HapticWiring
    @ObservationIgnored private let makeFrameScheduler: () -> FrameScheduler

    /// Why the stored board could not be opened, if it could not (the app
    /// runs on an empty board and the store refuses to overwrite).
    public private(set) var startupFailure: String?
    public private(set) var localSave: LocalSaveState = .idle
    public private(set) var syncStatus: CloudSyncStatus = .off
    public private(set) var account: AccountSnapshot?
    /// True until the stored session has been read once (nothing to gate on yet).
    public private(set) var authLoading: Bool
    public private(set) var isGuest: Bool
    /// `usePersistenceStatusStore.syncEnabled`: cloud sync is opt-in, kept
    /// per device under the web's key (`grovepad:cloud-sync:v1`, "on"/"off").
    public private(set) var cloudSyncEnabled: Bool
    /// `navigator.onLine`, for the login gate.
    public private(set) var networkOnline = true
    /// Runs after a sign-out or deletion wiped this device (the calendar
    /// token lives in the app's service, outside the coordinator).
    @ObservationIgnored public var onAccountDataCleared: (() -> Void)?
    public private(set) var subscription = SubscriptionState()
    public private(set) var canvasViews: OrderedMap<CanvasView>
    public private(set) var sessions: [WindowSession] = []
    public private(set) var activeSession: WindowSession?
    /// A `.grovepad` file waiting for the person to choose how to open it.
    public var pendingImport: URL?
    /// Realtime collaboration on shared canvases (nil without a cloud backend).
    public private(set) var collaboration: CollaborationRuntime?

    @ObservationIgnored private let syncState: DocumentSyncState
    @ObservationIgnored private let boardSaver: Debouncer
    @ObservationIgnored private let deviceSaver: Debouncer
    @ObservationIgnored private var pendingBoard: Board?
    @ObservationIgnored private var unsubscribeDocument: (() -> Void)?
    @ObservationIgnored private var disposeDriver: (() -> Void)?
    @ObservationIgnored private var started = false
    @ObservationIgnored private var disposed = false
    @ObservationIgnored private var initialDeviceState: DeviceState
    @ObservationIgnored private let makeCollaborationRepository: (() async throws -> CollaborationRepository?)?
    @ObservationIgnored private let collaborationDirectory: URL
    @ObservationIgnored private var collaborationAdapter: CollaborationBoardAdapter?
    @ObservationIgnored private var collaborationObservers: [() -> Void] = []

    public init(dependencies deps: Dependencies) {
        clock = deps.clock
        mint = deps.mint
        timers = deps.timers
        appVersion = deps.appVersion
        heartbeat = deps.heartbeat
        settingsStore = deps.settingsStore
        pickerPrefs = deps.pickerPrefs
        toastScheduler = deps.toastScheduler
        reachability = deps.reachability
        makeFrameScheduler = deps.frameScheduler
        makeCollaborationRepository = deps.cloud?.collaboration
        collaborationDirectory = deps.storeDirectory.deletingLastPathComponent().appendingPathComponent("collaboration", isDirectory: true)
        let store = LocalBoardStore(directory: deps.storeDirectory, clock: deps.clock)
        self.store = store
        localMedia = LocalMediaStore(storeDirectory: deps.storeDirectory)
        baselines = SyncBaselineStore(storeDirectory: deps.storeDirectory)

        var board: Board
        var failure: String?
        do {
            board = try store.loadBoard() ?? AppCoordinator.emptyBoard(mint: deps.mint, clock: deps.clock)
        } catch {
            failure = "\(error)"
            board = AppCoordinator.emptyBoard(mint: deps.mint, clock: deps.clock)
        }
        startupFailure = failure
        let deviceState = store.loadDeviceState(for: board, legacyFallback: DeviceStateCodec.legacyFallback(from: board), mint: deps.mint)
        initialDeviceState = deviceState
        canvasViews = deviceState.canvasViews
        board.activeWorkspaceId = deviceState.activeWorkspaceId
        board.activeCanvasId = deviceState.activeCanvasId

        let undo = UndoManager()
        undo.groupsByEvent = false
        undoManager = undo
        let document = BoardDocument(board: board, undoManager: undo, mint: deps.mint, clock: deps.clock)
        document.restingTileSize = WidgetRestContextFactory.restingTileSize
        self.document = document
        syncState = SyncHostRegistry.attach(document) { [weak store] in store?.writesLocked ?? false }
        boardSaver = Debouncer(delayMs: AppCoordinator.autosaveDelayMs, timers: deps.timers)
        deviceSaver = Debouncer(delayMs: AppCoordinator.deviceSaveDelayMs, timers: deps.timers)
        driver = CircuitDriver(host: document, scheduler: deps.heartbeat, clock: deps.clock, minter: deps.mint)

        let syncOptIn = deps.settingsStore.string(forKey: AppCoordinator.cloudSyncKey) == "on"
        cloudSyncEnabled = syncOptIn
        if let cloud = deps.cloud {
            sync = CloudSyncEngine(host: document, service: cloud.board, baselines: baselines, timers: deps.timers, clock: deps.clock, mint: deps.mint, syncEnabled: syncOptIn)
            media = MediaSyncService(local: localMedia, transport: cloud.media, timers: deps.timers) { [weak document] in
                document?.board.widgets.values.map(\.record) ?? []
            }
            auth = cloud.auth
        } else {
            sync = nil
            media = nil
            auth = nil
        }
        subscriptions = SubscriptionController(cache: SubscriptionCacheStore(storeDirectory: deps.storeDirectory), clock: deps.clock, rowSource: deps.cloud?.subscriptionRows, entitlementSource: deps.entitlements)
        noteWidget = NoteWidgetSync(
            document: document,
            fileURL: deps.noteWidgetFileURL ?? NoteWidgetContainer.url(fallback: deps.storeDirectory.appendingPathComponent("note-widget", isDirectory: true)),
            settings: deps.settingsStore,
            reloader: deps.widgetReloader ?? AppCoordinator.systemWidgetReloader(),
            timers: deps.timers
        )
        homeWidgets = HomeWidgetSync(
            document: document,
            folder: HomeWidgetFolder(url: deps.homeWidgetFolder ?? deps.storeDirectory.appendingPathComponent(HomeWidgetContract.folderName, isDirectory: true)),
            reloader: deps.widgetReloader ?? AppCoordinator.systemWidgetReloader(),
            timers: deps.timers,
            clock: deps.clock
        )
        spotlight = SpotlightIndexer(document: document, index: deps.searchIndex ?? AppCoordinator.systemSearchIndex(), timers: deps.timers)
        hapticWiring = HapticWiring(document: document, haptics: deps.haptics ?? Haptics.shared)
        authLoading = deps.cloud?.auth != nil
        isGuest = deps.cloud?.auth?.remembered.isGuest ?? true
        if failure != nil { localSave = .error }

        document.autosave = { [weak self] board in self?.scheduleSave(board) }
        document.onToast = { [weak self] message in self?.toast(message) }
        subscriptions.onChange = { [weak self] state in
            self?.subscription = state
            self?.refreshSettingsAccount()
        }
        sync?.onStatusChange = { [weak self] status in
            Task { @MainActor [weak self] in self?.syncStatus = status }
        }
        sync?.onNotice = { [weak self] notice in
            Task { @MainActor [weak self] in self?.announce(notice) }
        }
        auth?.onSession = { [weak self] snapshot in
            Task { @MainActor [weak self] in self?.adoptAccount(snapshot) }
        }
        auth?.clearLocalAccountData = { [weak self] in
            await MainActor.run { self?.clearAccountData() }
        }
    }

    static func systemWidgetReloader() -> WidgetTimelineReloader {
        #if canImport(WidgetKit)
        WidgetCenterReloader()
        #else
        RecordingWidgetReloader()
        #endif
    }

    static func systemSearchIndex() -> SearchableIndexing {
        #if canImport(CoreSpotlight)
        CoreSpotlightIndex()
        #else
        RecordingSearchableIndex()
        #endif
    }

    // MARK: - Empty board

    /// One workspace with one root canvas.
    nonisolated public static func emptyBoard(mint: IdMinter = .system, clock: Clock = .system) -> Board {
        let workspaceId = mint()
        let canvasId = mint()
        var board = Board()
        board.workspaces[workspaceId] = Workspace(id: workspaceId, name: "Workspace", rootCanvasId: canvasId, createdAt: clock.nowMs())
        board.canvases[canvasId] = CanvasMeta(id: canvasId, name: "Canvas", workspaceId: workspaceId, parentCanvasId: nil)
        board.activeWorkspaceId = workspaceId
        board.activeCanvasId = canvasId
        return board
    }

    // MARK: - Lifecycle

    /// Start the driver, the document subscription, sync, media, auth and
    /// reachability. Idempotent.
    public func start() {
        guard !started, !disposed else { return }
        started = true
        // The circuit system is frozen (`CircuitFeature`): wires keep their
        // bytes but carry nothing until it is switched back on.
        if CircuitFeature.isEnabled { disposeDriver = driver.start() }
        unsubscribeDocument = document.subscribe { [weak self] in self?.documentDidCommit() }
        if let sync {
            syncStatus = sync.status
            sync.start()
        }
        media?.start()
        auth?.start()
        reachability?.start { [weak self] in self?.sync?.noteNetworkReachable() }
        networkOnline = reachability?.isOnline ?? true
        reachability?.observeStatus { [weak self] online in self?.networkOnline = online }
        noteWidget.start()
        homeWidgets.start()
        spotlight.start()
        hapticWiring.start()
        startCollaboration()
        if let failure = startupFailure {
            toast("The stored board could not be opened; saving is paused to protect it. \(failure)")
        }
    }

    public func dispose() {
        guard !disposed else { return }
        flushAll()
        disposed = true
        hapticWiring.stop()
        unsubscribeDocument?()
        unsubscribeDocument = nil
        disposeDriver?()
        disposeDriver = nil
        sync?.dispose()
        media?.dispose()
        auth?.stop()
        reachability?.stop()
        for cancel in collaborationObservers { cancel() }
        collaborationObservers = []
        collaboration?.dispose()
        SyncHostRegistry.detach(document)
    }

    private func documentDidCommit() {
        syncState.epoch += 1
        sync?.noteDocumentEdited()
        noteWidget.noteCommit()
        homeWidgets.noteCommit()
        spotlight.noteCommit()
    }

    /// The scene phase: visibility for the heartbeat, a focus check for
    /// sync, a flush on the way out (`pagehide` / `visibilitychange: hidden`).
    public func noteScenePhase(_ phase: ScenePhaseSignal) {
        switch phase {
        case .active:
            (heartbeat as? SceneHeartbeat)?.setVisible(true)
            sync?.noteBecameActive()
            subscriptions.revalidate()
            Task { await media?.reconcile() }
        case .inactive:
            flushAll()
        case .background:
            (heartbeat as? SceneHeartbeat)?.setVisible(false)
            flushAll()
        }
    }

    // MARK: - Sessions

    /// A new window over the document. The first session seeds its tabs
    /// from device state; later ones start where the active one is.
    public func makeSession() -> WindowSession {
        let session = WindowSession(coordinator: self, scheduler: makeFrameScheduler(), deviceState: sessions.isEmpty ? initialDeviceState : activeSession?.environment.tabs.deviceState(canvasViews: canvasViews))
        sessions.append(session)
        if activeSession == nil { activeSession = session }
        if let collaboration { session.environment.collaboration = makeCollaborationChrome(collaboration) }
        return session
    }

    public func noteSessionActive(_ session: WindowSession) {
        activeSession = session
    }

    public func closeSession(_ session: WindowSession) {
        flushAll()
        sessions.removeAll { $0 === session }
        if activeSession === session { activeSession = sessions.last }
    }

    // MARK: - Autosave

    private func scheduleSave(_ board: Board) {
        pendingBoard = board
        if localSave != .error { localSave = .saving }
        boardSaver.schedule { [weak self] in self?.flushSave() }
        scheduleDeviceSave()
    }

    /// Write the newest board now (the debounce fires it; background,
    /// close and quit call it directly).
    public func flushSave() {
        boardSaver.cancel()
        guard let board = pendingBoard else { return }
        pendingBoard = nil
        do {
            _ = try store.saveBoard(board)
            localSave = .saved
        } catch {
            localSave = .error
            toast("Autosave failed: \(error)")
        }
    }

    public var isSavePending: Bool { pendingBoard != nil }

    // MARK: - Device state

    public func recordCanvasView(_ canvasId: String, _ view: CanvasView) {
        guard canvasViews[canvasId] != view else { return }
        canvasViews[canvasId] = view
        scheduleDeviceSave()
    }

    func noteNavigation() { scheduleDeviceSave() }

    public var deviceState: DeviceState {
        if let tabs = activeSession?.environment.tabs {
            return tabs.deviceState(canvasViews: canvasViews)
        }
        return DeviceState(activeWorkspaceId: document.activeWorkspaceId, activeCanvasId: document.activeCanvasId, canvasViews: canvasViews, openTabs: initialDeviceState.openTabs, activeTabId: initialDeviceState.activeTabId)
    }

    private func scheduleDeviceSave() {
        deviceSaver.schedule { [weak self] in self?.flushDeviceState() }
    }

    public func flushDeviceState() {
        deviceSaver.cancel()
        do {
            try store.saveDeviceState(deviceState)
        } catch {
            // Device state is a convenience; the board's own error state
            // already says writes are paused.
        }
    }

    /// `flushAll`: board, then device (`QuitRules.flushOrder`; the view is
    /// inside the device file here).
    public func flushAll() {
        flushSave()
        flushDeviceState()
        noteWidget.flush()
        homeWidgets.flush()
        spotlight.flush()
    }

    // MARK: - Quit rules

    public var quitContext: QuitContext {
        QuitContext(gestureDirty: false, localSave: localSave, cloudPushPending: syncStatus == .saving)
    }

    /// Flush first, then ask the rules; a warning survives only when the
    /// flush could not write.
    public func quitDecision() -> QuitDecision {
        flushAll()
        return QuitRules.decide(quitContext)
    }

    // MARK: - Accounts

    public func adoptAccount(_ snapshot: AccountSnapshot?) {
        authLoading = false
        account = snapshot
        sync?.setAccount(snapshot?.userId)
        subscriptions.adopt(userId: snapshot?.userId)
        refreshSettingsAccount()
        collaboration?.setIdentity(collaborationIdentity)
        for session in sessions { session.environment.collaboration?.accountUserId = snapshot?.userId }
        if snapshot != nil { Task { await media?.reconcile() } }
    }

    /// The login gate (`shouldShowLoginPage`): an account service exists,
    /// nobody is signed in, the guest choice was never made, and the stored
    /// session has been read. Somebody who was signed in here and never
    /// signed out gets their board while offline instead of a form that
    /// cannot succeed; the session restores itself when the network returns.
    public var needsLogin: Bool {
        guard auth != nil, account == nil, !isGuest, !authLoading else { return false }
        return networkOnline || auth?.rememberedAccount == nil
    }

    // MARK: - Cloud sync switch

    public static let cloudSyncKey = "grovepad:cloud-sync:v1"

    /// Settings ▸ Account ▸ Cloud sync.
    public func setCloudSyncEnabled(_ enabled: Bool) {
        guard enabled != cloudSyncEnabled else { return }
        cloudSyncEnabled = enabled
        settingsStore.set(enabled ? "on" : "off", forKey: AppCoordinator.cloudSyncKey)
        sync?.setSyncEnabled(enabled)
    }

    /// Before a sign-out: write everything down and give the cloud one
    /// chance to take the latest edits, so the wipe that follows loses
    /// nothing that could have synced.
    public func prepareForSignOut() async {
        flushAll()
        guard let sync, cloudSyncEnabled, account != nil, networkOnline else { return }
        await sync.syncNow()
    }

    /// `continueAsGuest`: persists, so returning guests go straight in.
    public func continueAsGuest() {
        auth?.remembered.isGuest = true
        isGuest = true
    }

    /// Leave guest mode and show the login page again.
    public func leaveGuestMode() {
        auth?.remembered.isGuest = false
        isGuest = false
    }

    /// Sign-out teardown (`clearLocalAccountData`): nothing that belonged to
    /// the account that just left may survive on the device. The board key
    /// is not per account, so a kept board could be synced into whoever
    /// signs in next. Boards, snapshots, media, the collaboration cache,
    /// sync baselines, the cached subscription, the Note widget mirror and
    /// the calendar token all go; preferences of the machine stay. The app
    /// then carries on over one empty workspace instead of reloading.
    public func clearAccountData() {
        // The session is already gone; nothing may push the empty board.
        sync?.setAccount(nil)
        boardSaver.cancel()
        deviceSaver.cancel()
        pendingBoard = nil
        if let userId = account?.userId { subscriptions.cache.clear(userId: userId) }
        let fileManager = FileManager.default
        for url in [store.indexURL, store.canvasesDirectory, store.deviceURL, store.snapshotsDirectory, localMedia.directory, collaborationDirectory] {
            try? fileManager.removeItem(at: url)
        }
        baselines.clearAll()
        subscriptions.cache.clearAll()
        noteWidget.setSelectedWidgetId(nil)
        auth?.remembered.isGuest = false
        isGuest = false

        let empty = AppCoordinator.emptyBoard(mint: mint, clock: clock)
        canvasViews = OrderedMap()
        document.loadBoard(empty)
        flushSave()
        // The home-screen widgets must not keep showing the signed-out account's cards.
        homeWidgets.refresh()
        for session in sessions { session.environment.tabs.navigate(to: empty.activeCanvasId) }
        flushDeviceState()
        onAccountDataCleared?()
    }

    var settingsAccountStatus: SettingsModel.AccountStatus {
        if let account { return .signedIn(email: account.email ?? AccountProfile.displayName(account)) }
        return .signedOut
    }

    var settingsAccountBadge: SettingsModel.AccountBadge? {
        guard let account else { return nil }
        return SettingsModel.AccountBadge(name: AccountProfile.displayName(account), colorHex: AccountProfile.profileColor(account))
    }

    private func refreshSettingsAccount() {
        for session in sessions {
            session.environment.settings.account = settingsAccountStatus
            session.environment.settings.accountBadge = settingsAccountBadge
        }
    }

    // MARK: - URLs and files

    /// `grovepad://auth/callback…` (magic link, OAuth) or a `.grovepad` file.
    /// Returns true when the URL was recognised.
    @discardableResult
    public func handle(url: URL) -> Bool {
        // A tap on a home-screen widget: land on its card.
        if let widgetId = HomeWidgetContract.widgetId(from: url) {
            if !reveal(.widget(widgetId)) { toast("That widget is no longer on your board.") }
            return true
        }
        if let canvasId = CollaborationLinks.canvasId(from: url), url.scheme?.lowercased() == "grovepad" {
            openCollaborationLink(canvasId: canvasId)
            return true
        }
        if url.scheme?.lowercased() == "grovepad" {
            guard let auth else { return false }
            Task { @MainActor in
                let result = await auth.handle(callback: url)
                if let error = result.error { self.toast(error) }
            }
            return true
        }
        if url.isFileURL, url.pathExtension.lowercased() == "grovepad" {
            pendingImport = url
            return true
        }
        return false
    }

    /// Read a package, apply it, land on the imported canvas, store its media.
    @discardableResult
    public func importPackage(at url: URL, mode: PackageImportMode) throws -> ImportOutcome {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let bytes = [UInt8](try Data(contentsOf: url))
        return try importPackage(bytes: bytes, fileName: url.lastPathComponent, mode: mode)
    }

    @discardableResult
    public func importPackage(bytes: [UInt8], fileName: String, mode: PackageImportMode) throws -> ImportOutcome {
        let package = try GrovepadPackage.read(bytes)
        let title = PackageImport.title(forFileName: fileName)
        let result = PackageImport.apply(package, to: document.board, mode: mode, title: title, mint: mint, clock: clock)
        for item in package.media {
            if let media {
                try? media.store(item.key, item.blob)
            } else {
                try? localMedia.write(item.key, item.blob)
            }
        }
        document.loadBoard(result.board)
        if document.board.canvases.contains(result.landingCanvasId) {
            for session in sessions { session.environment.tabs.navigate(to: result.landingCanvasId) }
            document.navigate(to: result.landingCanvasId)
        }
        switch mode {
        case .newWorkspace: toast("Imported “\(title)” as a workspace")
        case .replace: toast("Opened \(fileName)")
        }
        return ImportOutcome(mode: mode, title: title, workspaceIds: result.workspaceIds, landingCanvasId: result.landingCanvasId, widgetCount: result.widgetCount)
    }

    /// The board as a `.grovepad` archive with every media blob it references.
    public func exportPackageBytes() -> [UInt8] {
        GrovepadPackage.build(document.board, appVersion: appVersion, clock: clock) { [localMedia] key in localMedia.read(key) }
    }

    /// `Grovepad — <workspace> <date>.grovepad`.
    public func exportFileName(now: Date? = nil) -> String {
        let name = document.board.workspaces[document.activeWorkspaceId]?.name ?? "Board"
        return ShareExport.fileName(title: name, date: now ?? clock.now())
    }

    // MARK: - Collaboration

    /// Who others see: the account's display name and profile colour.
    private var collaborationIdentity: CollaborationIdentity? {
        guard let account else { return nil }
        return CollaborationIdentity(userId: account.userId, name: AccountProfile.displayName(account), color: AccountProfile.profileColor(account))
    }

    /// `initCollaborationRuntime`, once, when there is a cloud backend.
    private func startCollaboration() {
        guard let factory = makeCollaborationRepository, collaboration == nil else { return }
        let adapter = CollaborationBoardAdapter(document: document, coordinator: self, reachability: reachability)
        collaborationAdapter = adapter
        let runtime = CollaborationRuntime(
            host: adapter,
            queue: OfflineUpdateQueue(root: collaborationDirectory, clock: clock),
            configured: true,
            clock: clock,
            makeRepository: factory
        )
        collaboration = runtime
        for session in sessions where session.environment.collaboration == nil {
            session.environment.collaboration = makeCollaborationChrome(runtime)
        }
        runtime.start(identity: collaborationIdentity)
        reachability?.observeStatus { [weak runtime] online in runtime?.networkChanged(online: online) }
        // Navigation and the expanded card are observation-only (no commit).
        collaborationObservers.append(observeDocument({ [document] in _ = document.activeCanvasId }) { [weak runtime] in
            runtime?.activeCanvasDidChange()
        })
        collaborationObservers.append(observeDocument({ [document] in _ = document.expandedWidgetId }) { [weak runtime, document] in
            runtime?.setEditingWidget(document.expandedWidgetId)
        })
    }

    private func makeCollaborationChrome(_ runtime: CollaborationRuntime) -> CollaborationChromeModel {
        let model = CollaborationChromeModel(runtime: runtime)
        model.accountUserId = account?.userId
        model.copyToPasteboard = { text in
            #if canImport(AppKit)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            #elseif canImport(UIKit)
            UIPasteboard.general.string = text
            #endif
        }
        model.toast = { [weak self] message in self?.toast(message) }
        return model
    }

    /// The pointer over a window's canvas, in world coordinates (`nil` when
    /// it leaves), published as the collaboration cursor.
    public func notePointer(_ world: Vector2D?) {
        collaborationAdapter?.notePointer(world)
    }

    /// The active window's camera moved (published as presence).
    func noteCameraMoved(in session: WindowSession) {
        guard session === (activeSession ?? sessions.first) else { return }
        collaborationAdapter?.noteCameraMoved()
    }

    /// Scrolling, pinching or a middle-drag while following someone stops
    /// following (the web's `releaseFollowForManualGesture`).
    public func releaseFollowForManualGesture() {
        guard let collaboration, collaboration.state.followingClientId != nil else { return }
        collaboration.follow(nil)
    }

    /// A `grovepad://collaborate/<id>` link: check it, then ask.
    public func openCollaborationLink(canvasId: String) {
        guard let collaboration else {
            toast("Canvas sharing is unavailable on this build")
            return
        }
        Task { @MainActor in
            do {
                try await collaboration.openLink(canvasId: canvasId)
            } catch {
                self.toast((error as? CollaborationError)?.message ?? error.localizedDescription)
            }
        }
    }

    private func observeDocument(_ read: @escaping () -> Void, _ onChange: @escaping () -> Void) -> () -> Void {
        final class Token { var cancelled = false }
        let token = Token()
        func arm() {
            withObservationTracking(read) {
                Task { @MainActor in
                    guard !token.cancelled else { return }
                    onChange()
                    arm()
                }
            }
        }
        arm()
        return { token.cancelled = true }
    }

    // MARK: - Toasts

    private func toast(_ message: String) {
        if let session = activeSession ?? sessions.first {
            session.environment.toasts.add(message)
        }
    }

    private func announce(_ notice: CloudSyncNotice) {
        switch notice {
        case .keptBoth(let titles):
            let list = titles.prefix(3).joined(separator: ", ")
            toast("Cards edited in two places — both versions are on the canvas (\(list)\(titles.count > 3 ? "…" : ""))")
        case .syncProblem:
            toast("Sync hit a problem; your changes are safe on this device")
        }
    }
}
