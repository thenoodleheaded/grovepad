import Foundation
import XCTest
@testable import GrovepadCore

// ---------------------------------------------------------------------------
// Fakes for the sync seams: a document host, a scripted board service (what
// `persistenceCloudReconcile.test.ts` mocks as `./cloudSync`), an in-memory
// row transport that behaves like the four tables (server stamps, checksums,
// legacy precedence), and a media transport with a private bucket.
// ---------------------------------------------------------------------------

final class FakeSyncHost: CloudSyncHost {
    var board: Board
    var documentEpoch = 0
    var localWritesBlocked = false
    var loadedBoards: [Board] = []

    init(board: Board) {
        self.board = board
    }

    func loadBoard(_ board: Board) {
        self.board = board
        loadedBoards.append(board)
    }

    /// A local edit: change a widget's text and bump the epoch.
    func edit(widgetId: String, text: String) {
        var widget = board.widgets[widgetId]!
        widget.record["data"] = .object(["text": .string(text)])
        board.widgets[widgetId] = widget
        documentEpoch += 1
    }

    /// Add a text card, as `createWidget` would.
    func add(widgetId: String, text: String, canvasId: String = "canvas") {
        var record = JSONObject()
        record["id"] = .string(widgetId)
        record["type"] = .string("text")
        record["title"] = .string(widgetId)
        record["canvasId"] = .string(canvasId)
        record["position"] = .object(["x": 0, "y": 600])
        record["size"] = .object(["width": 320, "height": 200])
        record["data"] = .object(["text": .string(text)])
        record["metadata"] = .object(["badges": .array([])])
        board.widgets[widgetId] = Widget(record: record)
        documentEpoch += 1
    }

    var serialized: JSONObject { BoardSerializer.serializePersistedBoard(board) }
}

/// Scripted answers plus a call log.
final class FakeBoardService: CloudBoardService {
    enum Call: Equatable { case head, fetch, push }
    var calls: [Call] = []
    var pushedBoards: [JSONObject] = []
    var headResult: CloudHeadResult = .none
    var boardResult: CloudBoardResult?
    var headError: Error?
    var pushError: Error?
    var fetchError: Error?
    /// Runs while the board is "crossing the network".
    var duringFetch: (() -> Void)?

    func fetchCloudHead(userId: String) async throws -> CloudHeadResult {
        calls.append(.head)
        if let headError { throw headError }
        return headResult
    }

    func fetchCloudBoard(userId: String) async throws -> CloudBoardResult? {
        calls.append(.fetch)
        if let fetchError { throw fetchError }
        duringFetch?()
        return boardResult
    }

    @discardableResult
    func pushCloudBoard(userId: String, board: JSONObject) async throws -> CloudPushResult {
        calls.append(.push)
        if let pushError { throw pushError }
        pushedBoards.append(board)
        return CloudPushResult(mode: .documents, changedCanvases: 0, deletedCanvases: 0)
    }
}

/// The four tables in memory, with the server's stamping rules: `rev` and
/// `updated_at` move only when a checksum changes; the index stamp always
/// moves (it is the commit marker); revisions are appended and capped at 30.
final class FakeCloudTransport: CloudTransport {
    struct IndexRow { var document: JSONObject; var checksum: String; var meta: JSONObject; var rev: Int; var updatedAt: String }
    struct CanvasRow { var body: String; var checksum: String; var meta: JSONObject; var rev: Int; var updatedAt: String }
    struct LegacyRow { var data: JSONObject; var updatedAt: String }
    struct Revision: Equatable { var kind: String; var id: String; var rev: Int; var checksum: String }

    var indexes: [String: IndexRow] = [:]
    var canvases: [String: [String: CanvasRow]] = [:]
    var legacy: [String: LegacyRow] = [:]
    var revisions: [String: [Revision]] = [:]
    var schemaMissing = false
    var legacyTableMissing = false
    var offline = false
    var log: [String] = []
    private var tick = 0
    let clock: Clock

    init(clock: Clock = .fixed(ms: 1_789_000_000_000)) {
        self.clock = clock
    }

    /// Server timestamps: strictly increasing ISO strings.
    func stamp() -> String {
        tick += 1
        return SubscriptionRules.isoString(ms: clock.nowMs() + Double(tick) * 1000)
    }

    private func gate() throws {
        if offline { throw CloudTransportError.offline }
        if schemaMissing { throw CloudTransportError.schemaMissing }
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
        if offline { throw CloudTransportError.offline }
        if legacyTableMissing { throw CloudTransportError.schemaMissing }
        log.append("legacy:\(includeDocument ? "doc" : "meta")")
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
            archive(userId, Revision(kind: "canvas", id: row.canvasId, rev: rev, checksum: row.checksum))
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
        if changed { archive(userId, Revision(kind: "board-index", id: "board-index", rev: rev, checksum: row.checksum)) }
    }

    func upsertLegacy(userId: String, board: JSONObject) async throws {
        if offline { throw CloudTransportError.offline }
        log.append("upsertLegacy")
        legacy[userId] = LegacyRow(data: board, updatedAt: stamp())
    }

    private func archive(_ userId: String, _ revision: Revision) {
        var list = revisions[userId] ?? []
        list.append(revision)
        let same = list.filter { $0.kind == revision.kind && $0.id == revision.id }
        if same.count > 30, let oldest = same.first, let position = list.firstIndex(of: oldest) { list.remove(at: position) }
        revisions[userId] = list
    }

    /// Seed the legacy row directly, as an older client would have written it.
    func writeLegacy(userId: String, board: JSONObject) {
        legacy[userId] = LegacyRow(data: board, updatedAt: stamp())
    }
}

/// A private bucket keyed by object path.
final class FakeMediaTransport: MediaTransport {
    var userId: String?
    var objects: [String: MediaBlob] = [:]
    var refuseUploads = false
    var refuseListings = false
    var uploads: [String] = []
    var downloads: [String] = []

    func currentUserId() async -> String? { userId }

    func upload(path: String, blob: MediaBlob) async -> MediaUploadOutcome {
        uploads.append(path)
        if refuseUploads { return .failed("refused") }
        if objects[path] != nil { return .alreadyExists }
        objects[path] = blob
        return .uploaded
    }

    func download(path: String) async -> MediaBlob? {
        downloads.append(path)
        return objects[path]
    }

    func list(prefix: String, limit: Int) async -> [String]? {
        if refuseListings { return nil }
        var names: [String] = []
        for path in objects.keys.sorted() where path.hasPrefix(prefix + "/") {
            let rest = path.dropFirst(prefix.count + 1)
            let name = String(rest.split(separator: "/", maxSplits: 1)[0])
            if !names.contains(name) { names.append(name) }
        }
        return names
    }
}

enum SyncFixtures {
    /// The reconcile pack's boards, already parsed.
    static func board(_ side: String, from name: String = "with-baseline") throws -> Board {
        let pack = try ConformancePack.object("reconcile/\(name).json")
        return try XCTUnwrap(BoardParser.parsePersistedBoard(try XCTUnwrap(pack[side])), "\(name).\(side)")
    }

    static func serialized(_ board: Board) -> JSONObject {
        BoardSerializer.serializePersistedBoard(board)
    }

    static func temporaryDirectory(_ label: String) -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("grovepad-\(label)-\(UUID().uuidString)", isDirectory: true)
    }
}
