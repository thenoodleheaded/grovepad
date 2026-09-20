import Foundation
import XCTest
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
import GrovepadCloud
@testable import GrovepadApp

// ---------------------------------------------------------------------------
// Fakes for the app layer's seams: the four cloud tables in memory (the same
// stamping rules `SyncFakes.swift` reproduces for the engine tests), a
// private media bucket, a scripted StoreKit source and subscription row, a
// scripted account service for the login screen, and a coordinator built
// on a scratch store with hand-driven timers.
// ---------------------------------------------------------------------------

final class FakeCloudTransport: CloudTransport {
    struct IndexRow { var document: JSONObject; var checksum: String; var meta: JSONObject; var rev: Int; var updatedAt: String }
    struct CanvasRow { var body: String; var checksum: String; var meta: JSONObject; var rev: Int; var updatedAt: String }
    struct LegacyRow { var data: JSONObject; var updatedAt: String }

    var indexes: [String: IndexRow] = [:]
    var canvases: [String: [String: CanvasRow]] = [:]
    var legacy: [String: LegacyRow] = [:]
    var offline = false
    var legacyTableMissing = true
    var log: [String] = []
    private var tick = 0
    let clock: Clock

    init(clock: Clock = .fixed(ms: 1_789_000_000_000)) {
        self.clock = clock
    }

    func stamp() -> String {
        tick += 1
        return SubscriptionRules.isoString(ms: clock.nowMs() + Double(tick) * 1000)
    }

    private func gate() throws {
        if offline { throw CloudTransportError.offline }
    }

    func fetchIndexRow(userId: String, includeDocument: Bool) async throws -> CloudIndexRow? {
        try gate()
        log.append("index:\(includeDocument ? "doc" : "meta")")
        guard let row = indexes[userId] else { return nil }
        return CloudIndexRow(document: includeDocument ? .object(row.document) : nil, checksum: row.checksum, updatedAt: row.updatedAt)
    }

    func fetchCanvasRows(userId: String, includeBodies: Bool) async throws -> [CloudCanvasRow] {
        try gate()
        log.append("canvases:\(includeBodies ? "bodies" : "meta")")
        return (canvases[userId] ?? [:]).sorted { $0.key < $1.key }.map { canvasId, row in
            CloudCanvasRow(canvasId: canvasId, checksum: row.checksum, body: includeBodies ? row.body : nil, meta: includeBodies ? .object(row.meta) : nil, updatedAt: row.updatedAt)
        }
    }

    func fetchLegacyRow(userId: String, includeDocument: Bool) async throws -> CloudLegacyRow? {
        try gate()
        if legacyTableMissing { throw CloudTransportError.schemaMissing }
        guard let row = legacy[userId] else { return nil }
        return CloudLegacyRow(data: includeDocument ? .object(row.data) : nil, updatedAt: row.updatedAt)
    }

    func upsertCanvases(userId: String, rows: [CloudCanvasUpsert]) async throws {
        try gate()
        log.append("upsertCanvases:\(rows.map(\.canvasId).joined(separator: ","))")
        var table = canvases[userId] ?? [:]
        for row in rows {
            if let existing = table[row.canvasId], existing.checksum == row.checksum {
                table[row.canvasId]?.body = row.body
                table[row.canvasId]?.meta = row.meta
                continue
            }
            let rev = (table[row.canvasId]?.rev ?? 0) + 1
            table[row.canvasId] = CanvasRow(body: row.body, checksum: row.checksum, meta: row.meta, rev: rev, updatedAt: stamp())
        }
        canvases[userId] = table
    }

    func deleteCanvases(userId: String, canvasIds: [String]) async throws {
        try gate()
        log.append("deleteCanvases:\(canvasIds.joined(separator: ","))")
        for canvasId in canvasIds { canvases[userId]?.removeValue(forKey: canvasId) }
    }

    func upsertIndex(userId: String, row: CloudIndexUpsert) async throws {
        try gate()
        log.append("upsertIndex")
        let existing = indexes[userId]
        let changed = existing?.checksum != row.checksum
        let rev = changed ? (existing?.rev ?? 0) + 1 : existing!.rev
        indexes[userId] = IndexRow(document: row.document, checksum: row.checksum, meta: row.meta, rev: rev, updatedAt: stamp())
    }

    func upsertLegacy(userId: String, board: JSONObject) async throws {
        try gate()
        log.append("upsertLegacy")
        legacy[userId] = LegacyRow(data: board, updatedAt: stamp())
    }

    /// What the cloud holds, parsed (the index + canvases joined).
    func cloudBoard(userId: String) async throws -> Board? {
        let client = CloudBoardClient(transport: self, clock: clock)
        guard let result = try await client.fetchCloudBoard(userId: userId) else { return nil }
        return BoardParser.parsePersistedBoard(.object(result.board))
    }
}

final class FakeMediaTransport: MediaTransport {
    var userId: String?
    var objects: [String: MediaBlob] = [:]

    func currentUserId() async -> String? { userId }

    func upload(path: String, blob: MediaBlob) async -> MediaUploadOutcome {
        if objects[path] != nil { return .alreadyExists }
        objects[path] = blob
        return .uploaded
    }

    func download(path: String) async -> MediaBlob? { objects[path] }

    func list(prefix: String, limit: Int) async -> [String]? {
        var names: [String] = []
        for path in objects.keys.sorted() where path.hasPrefix(prefix + "/") {
            let rest = path.dropFirst(prefix.count + 1)
            let name = String(rest.split(separator: "/", maxSplits: 1)[0])
            if !names.contains(name) { names.append(name) }
        }
        return names
    }
}

final class FakeEntitlementSource: StoreKitEntitlementSource {
    var entitlements: [StoreKitEntitlement] = []
    var reads = 0

    func currentEntitlements() async -> [StoreKitEntitlement] {
        reads += 1
        return entitlements
    }
}

final class FakeRowSource: SubscriptionRowSource {
    var record: SubscriptionRecord?
    var error: Error?
    var fetches = 0

    func fetch(userId: String) async throws -> SubscriptionRecord? {
        fetches += 1
        if let error { throw error }
        return record
    }
}

final class FakeLoginAuth: LoginAuthenticating {
    var calls: [String] = []
    var result = AuthSignInResult(canceled: false, error: nil)

    func signIn(email: String, password: String) async -> AuthSignInResult { calls.append("signIn:\(email)"); return result }
    func signUp(email: String, password: String) async -> AuthSignInResult { calls.append("signUp:\(email)"); return result }
    func sendMagicLink(email: String) async -> AuthSignInResult { calls.append("magic:\(email)"); return result }
    func signInWithGoogle() async -> AuthSignInResult { calls.append("google"); return result }
    func signInWithApple(identityToken: String, nonce: AppleNonce) async -> AuthSignInResult { calls.append("apple:\(identityToken):\(nonce.raw)"); return result }
}

/// A hand-driven heartbeat (no timers in tests).
final class FakeHeartbeat: HeartbeatScheduler {
    var isVisible = true
    var tick: (() -> Void)?
    func schedule(every interval: TimeInterval, _ tick: @escaping () -> Void) -> () -> Void {
        self.tick = tick
        return { [weak self] in self?.tick = nil }
    }
    func observeVisibility(_ handler: @escaping () -> Void) -> () -> Void { {} }
}

enum AppFixtures {
    static func temporaryDirectory(_ label: String) -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("grovepad-app-\(label)-\(UUID().uuidString)", isDirectory: true)
    }

    /// A coordinator over a scratch store with manual timers, a counting
    /// minter and a fixed clock. `cloud` adds a fake transport.
    @MainActor
    static func coordinator(directory: URL, timers: ManualTimerSource, transport: FakeCloudTransport? = nil, reachability: ManualReachability? = nil, entitlements: StoreKitEntitlementSource? = nil, rows: SubscriptionRowSource? = nil, clock: Clock = .fixed(ms: 1_789_000_000_000)) -> AppCoordinator {
        var deps = AppCoordinator.Dependencies(storeDirectory: directory)
        deps.timers = timers
        deps.clock = clock
        deps.mint = .counting(prefix: "app-")
        deps.heartbeat = FakeHeartbeat()
        deps.reachability = reachability
        deps.entitlements = entitlements
        let settings = InMemoryKeyValueStore()
        // Cloud sync is opt-in (as on the web); the cloud fixtures opt in.
        if transport != nil { settings.set("on", forKey: AppCoordinator.cloudSyncKey) }
        deps.settingsStore = settings
        deps.toastScheduler = ManualToastScheduler()
        deps.frameScheduler = { ManualScheduler() }
        // Phase 7 seams: never the system widget centre, Spotlight index or
        // Taptic Engine from a test process.
        deps.noteWidgetFileURL = directory.appendingPathComponent("note-widget-payload.json")
        deps.widgetReloader = RecordingWidgetReloader()
        deps.searchIndex = RecordingSearchableIndex()
        deps.haptics = Haptics()
        if let transport {
            deps.cloud = AppCoordinator.CloudServices(board: CloudBoardClient(transport: transport, clock: clock), media: FakeMediaTransport(), auth: nil, subscriptionRows: rows)
        }
        return AppCoordinator(dependencies: deps)
    }

    static func account(_ userId: String = "user-1") -> AccountSnapshot {
        AccountSnapshot(userId: userId, email: "\(userId)@example.com", metadata: JSONObject(), providers: ["email"])
    }
}
