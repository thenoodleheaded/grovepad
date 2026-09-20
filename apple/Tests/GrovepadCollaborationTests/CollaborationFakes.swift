import Foundation
import XCTest
import GrovepadCore
@testable import GrovepadCollaboration

/// An in-memory collaboration server: the durable log, the snapshot table,
/// memberships and a broadcast/presence hub, shared by every fake client.
@MainActor
final class FakeServer {
    var roles: [String: CollaborationRole] = [:]
    var owners: [String: String] = [:]
    var publicAccess: [String: Bool] = [:]
    var names: [String: String] = [:]
    var log: [String: [CollaborationBootstrap.Update]] = [:]
    var snapshots: [String: (Data, Int)] = [:]
    var comments: [String: [CollaborationComment]] = [:]
    var deleted: [String] = []
    var nextSequence = 0
    var channels: [FakeChannel] = []
    var failPersist = false

    func persisted(_ canvasId: String) -> Int { log[canvasId]?.count ?? 0 }
}

@MainActor
final class FakeRepository: CollaborationRepository {
    let server: FakeServer
    let userId: String

    init(server: FakeServer, userId: String) {
        self.server = server
        self.userId = userId
    }

    func ensureCanvas(_ canvasId: String, name: String) async throws -> CollaborationRole {
        if server.owners[canvasId] == nil {
            server.owners[canvasId] = userId
            server.names[canvasId] = name
            server.roles["\(canvasId)|\(userId)"] = .owner
        }
        guard let role = server.roles["\(canvasId)|\(userId)"] else { throw CollaborationError("not a member") }
        return role
    }

    func bootstrap(_ canvasId: String, name: String) async throws -> CollaborationBootstrap {
        let role = try await ensureCanvas(canvasId, name: name)
        let snapshot = server.snapshots[canvasId]
        let last = snapshot?.1 ?? 0
        return CollaborationBootstrap(
            role: role, publicAccess: server.publicAccess[canvasId] ?? false,
            snapshot: snapshot?.0, lastSequence: last,
            updates: try await fetchUpdates(canvasId, after: last)
        )
    }

    func canvasMetadata(_ canvasId: String) async throws -> CollaborationCanvasMetadata {
        guard server.roles["\(canvasId)|\(userId)"] != nil, let owner = server.owners[canvasId] else { throw CollaborationError("not found") }
        return CollaborationCanvasMetadata(canvasId: canvasId, name: server.names[canvasId] ?? "", ownerId: owner, publicAccess: false)
    }

    func setPublicAccess(_ canvasId: String, isPublic: Bool) async throws { server.publicAccess[canvasId] = isPublic }

    func deleteCanvasCollaboration(_ canvasId: String) async throws {
        server.deleted.append(canvasId)
        server.owners[canvasId] = nil
        server.log[canvasId] = nil
    }

    func fetchUpdates(_ canvasId: String, after sequence: Int) async throws -> [CollaborationBootstrap.Update] {
        (server.log[canvasId] ?? []).filter { $0.sequence > sequence }
    }

    func persistUpdates(_ canvasId: String, updates: [(id: String, payload: Data)]) async throws {
        if server.failPersist { throw CollaborationError("network down") }
        for update in updates where !(server.log[canvasId] ?? []).contains(where: { $0.id == update.id }) {
            server.nextSequence += 1
            server.log[canvasId, default: []].append(.init(id: update.id, sequence: server.nextSequence, payload: update.payload))
        }
    }

    func compact(_ canvasId: String, snapshot: Data, lastSequence: Int) async throws {
        server.snapshots[canvasId] = (snapshot, lastSequence)
        server.log[canvasId]?.removeAll { $0.sequence <= lastSequence }
    }

    func setMemberRole(_ canvasId: String, email: String, role: CollaborationRole) async throws {
        server.roles["\(canvasId)|\(email)"] = role
    }

    func listComments(_ canvasId: String) async throws -> [CollaborationComment] { server.comments[canvasId] ?? [] }

    func addComment(_ canvasId: String, body: String, parentId: String?, widgetId: String?) async throws {
        server.comments[canvasId, default: []].append(CollaborationComment(
            id: UUID().uuidString, canvasId: canvasId, authorId: userId, parentId: parentId, widgetId: widgetId, body: body, createdAt: ""
        ))
    }

    func documentChannel(_ canvasId: String) -> CollaborationChannel {
        FakeChannel(server: server, topic: "canvas:\(canvasId)", presenceKey: userId)
    }

    func awarenessChannel(_ canvasId: String, presenceKey: String) -> CollaborationChannel {
        FakeChannel(server: server, topic: "awareness:\(canvasId)", presenceKey: presenceKey)
    }
}

@MainActor
final class FakeChannel: CollaborationChannel {
    let server: FakeServer
    let topic: String
    let presenceKey: String
    var broadcastHandlers: [String: (JSONObject) -> Void] = [:]
    var presenceHandler: (([CollaborationPresenceEntry]) -> Void)?
    var tracked: JSONObject?
    var subscribed = false
    var sent: [(String, JSONObject)] = []

    init(server: FakeServer, topic: String, presenceKey: String) {
        self.server = server
        self.topic = topic
        self.presenceKey = presenceKey
    }

    private var peers: [FakeChannel] { server.channels.filter { $0 !== self && $0.topic == topic && $0.subscribed } }

    func onBroadcast(event: String, _ handler: @escaping (JSONObject) -> Void) { broadcastHandlers[event] = handler }
    func onPresenceSync(_ handler: @escaping ([CollaborationPresenceEntry]) -> Void) { presenceHandler = handler }

    func subscribe(_ onStatus: @escaping (CollaborationChannelStatus) -> Void) {
        server.channels.append(self)
        DispatchQueue.main.async {
            self.subscribed = true
            onStatus(.subscribed)
            self.syncPresence()
        }
    }

    func send(event: String, payload: JSONObject) async throws {
        sent.append((event, payload))
        for peer in peers { let handler = peer.broadcastHandlers[event]; DispatchQueue.main.async { handler?(payload) } }
    }

    func track(_ payload: JSONObject) async throws {
        tracked = payload
        syncPresence()
    }

    private func syncPresence() {
        let everyone = server.channels.filter { $0.topic == topic && $0.subscribed }
        let entries = everyone.compactMap { channel in channel.tracked.map { CollaborationPresenceEntry(key: channel.presenceKey, payload: $0) } }
        for channel in everyone { channel.presenceHandler?(entries) }
    }

    func close() {
        tracked = nil
        subscribed = false
        server.channels.removeAll { $0 === self }
        syncPresence()
    }
}

/// A board host without the app: a `Board` value, a selection, a camera.
@MainActor
final class FakeHost: CollaborationBoardHost {
    var board: Board
    var activeCanvasId: String
    var selectedWidgetIds: [String] = []
    var camera: CollaborationCamera? = CollaborationCamera(pan: Vector2D(x: 0, y: 0), zoom: 1)
    var isOnline = true
    var editingLocked = false
    var history: CollaborativeHistory?
    var remoteApplies = 0
    private var boardListeners: [Int: () -> Void] = [:]
    private var selectionListeners: [Int: () -> Void] = [:]
    private var cameraListeners: [Int: () -> Void] = [:]
    private var pointerListeners: [Int: (Vector2D?) -> Void] = [:]
    private var next = 0

    init(board: Board) {
        self.board = board
        activeCanvasId = board.activeCanvasId
    }

    /// A local edit the way `BoardDocument.commit` makes one.
    func edit(_ body: (inout Board) -> Void) {
        guard !editingLocked else { return }
        body(&board)
        for listener in boardListeners.values { listener() }
    }

    func navigate(to canvasId: String) {
        activeCanvasId = canvasId
        for listener in boardListeners.values { listener() }
    }

    func applyCollaborativeBoard(_ board: Board) {
        remoteApplies += 1
        self.board = board
        for listener in boardListeners.values { listener() }
    }

    func setCamera(_ camera: CollaborationCamera) { self.camera = camera }
    func setEditingLocked(_ locked: Bool) { editingLocked = locked }
    func setHistory(_ history: CollaborativeHistory?) { self.history = history }

    func setCanvasShared(_ canvasId: String, shared: Bool) {
        board.canvases[canvasId]?.shared = shared
        for listener in boardListeners.values { listener() }
    }

    func adoptSharedCanvas(_ canvasId: String, name: String) throws {
        if board.canvases[canvasId] == nil {
            var canvas = CanvasMeta(id: canvasId, name: name, workspaceId: "workspace", parentCanvasId: "canvas")
            canvas.shared = true
            board.canvases[canvasId] = canvas
        }
        board.canvases[canvasId]?.shared = true
        activeCanvasId = canvasId
        for listener in boardListeners.values { listener() }
    }

    private func add<T>(_ store: inout [Int: T], _ value: T) -> Int {
        next += 1
        store[next] = value
        return next
    }

    func observeBoard(_ listener: @escaping () -> Void) -> () -> Void {
        let id = add(&boardListeners, listener)
        return { [weak self] in self?.boardListeners[id] = nil }
    }

    func observeSelection(_ listener: @escaping () -> Void) -> () -> Void {
        let id = add(&selectionListeners, listener)
        return { [weak self] in self?.selectionListeners[id] = nil }
    }

    func observeCamera(_ listener: @escaping () -> Void) -> () -> Void {
        let id = add(&cameraListeners, listener)
        return { [weak self] in self?.cameraListeners[id] = nil }
    }

    func observePointer(_ listener: @escaping (Vector2D?) -> Void) -> () -> Void {
        let id = add(&pointerListeners, listener)
        return { [weak self] in self?.pointerListeners[id] = nil }
    }

    func movePointer(_ point: Vector2D?) { for listener in pointerListeners.values { listener(point) } }
}

enum Boards {
    static func widget(_ id: String, text: String? = nil, canvasId: String = "canvas", x: Double = 0) -> Widget {
        var record = JSONObject()
        record["id"] = .string(id)
        record["type"] = .string("text")
        record["title"] = .string(id)
        record["canvasId"] = .string(canvasId)
        var position = JSONObject()
        position["x"] = .number(x)
        position["y"] = .number(0)
        record["position"] = .object(position)
        var size = JSONObject()
        size["width"] = .number(240)
        size["height"] = .number(160)
        record["size"] = .object(size)
        var data = JSONObject()
        data["text"] = .string(text ?? "")
        record["data"] = .object(data)
        var metadata = JSONObject()
        metadata["badges"] = .array([])
        record["metadata"] = .object(metadata)
        return Widget(record: record)
    }

    static func board(shared: Bool = true, widgets: [Widget] = []) -> Board {
        var canvas = CanvasMeta(id: "canvas", name: "Origin", workspaceId: "workspace", parentCanvasId: nil)
        if shared { canvas.shared = true }
        let other = CanvasMeta(id: "private", name: "Mine", workspaceId: "workspace", parentCanvasId: "canvas")
        var map = OrderedMap<Widget>()
        for widget in widgets { map[widget.id] = widget }
        return Board(
            workspaces: ["workspace": Workspace(id: "workspace", name: "Workspace", rootCanvasId: "canvas", createdAt: 1)],
            canvases: ["canvas": canvas, "private": other],
            widgets: map,
            activeWorkspaceId: "workspace",
            activeCanvasId: "canvas"
        )
    }
}

/// Spin the main run loop until `condition` holds (tasks, main-queue hops
/// and timers all run meanwhile).
@MainActor
func eventually(_ message: String = "condition", timeout: TimeInterval = 3, _ condition: () -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
    let deadline = Date().addingTimeInterval(timeout)
    while !condition() {
        if Date() > deadline {
            XCTFail("timed out waiting for \(message)", file: file, line: line)
            return
        }
        try? await Task.sleep(nanoseconds: 10_000_000)
    }
}
