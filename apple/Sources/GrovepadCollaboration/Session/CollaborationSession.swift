import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port of `startCanvasSession` and its helpers (`src/runtime/
// collaborationRuntime.ts`) plus the bridge (`canvasStoreBridge.ts`) and the
// permission guards (`permissionGuards.ts`): one active shared canvas bound
// to one CRDT document.
//
// Delivery, as on the web: each local update gets one UUID, is broadcast
// immediately on the hot path, written to the offline queue, then appended
// in batches to `canvas_crdt_updates`; acknowledged ids leave the queue.
// Cold start restores the cached document, then the server snapshot and
// every durable update after it. While connected the durable tail is
// sampled every 750 ms so a dropped broadcast repairs itself.
// ---------------------------------------------------------------------------

@MainActor
public final class CollaborationSession {
    static let updateEvent = "y-update"
    static let awarenessEvent = "awareness"
    static let compactUpdateCount = 200
    static let compactByteCount = 512 * 1024
    static let maxWireUpdateBytes = 8 * 1024 * 1024
    static let durableBatchBytes = 4 * 1024 * 1024
    static let durableBatchRows = 50
    static let durableRepairIntervalMs = 750
    static let awarenessBroadcastIntervalMs = 50
    static let documentCacheDelayMs = 180
    static let cameraPresenceDelayMs = 80
    static let awarenessCheckIntervalMs = 3_000

    public let canvasId: String
    public private(set) var role: CollaborationRole
    let crdt: CanvasCrdt
    let awareness: Awareness
    private let repository: CollaborationRepository
    private let channel: CollaborationChannel
    private let awarenessChannel: CollaborationChannel
    private let queue: OfflineUpdateQueue
    private let host: CollaborationHost
    private let state: CollaborationState
    private let clock: Clock

    private(set) var connected = false
    private(set) var awarenessConnected = false
    private var documentBootstrapped = false
    private var presencePublished = false
    private(set) var lastSequence: Int
    private var updatesSinceCompaction: Int
    private var bytesSinceCompaction: Int
    private var flushTask: Task<Void, Error>?
    private var flushAgain = false
    private var compactionTask: Task<Void, Error>?
    /// Ids already broadcast on the hot path, so a flush does not send the
    /// same payload twice. Ids queued while disconnected get their one
    /// broadcast at flush.
    private var broadcastUpdateIds = Set<String>()

    // Bridge state (`createCanvasStoreBridge`).
    private var previousStoreSnapshot: CanvasCollaborationSnapshot?
    private var applyingDocument = false
    private var applyQueued = false
    private var disposed = false

    private var presenceTimer = MainTimer()
    private var durableRepairTimer = MainTimer()
    private var cameraTimer = MainTimer()
    private var cacheTimer = MainTimer()
    private var pointerTimer = MainTimer()
    private var pendingCursor: Vector2D?
    private var awarenessCheck: Timer?
    private var disposers: [() -> Void] = []

    /// Called when the session fails in a way the runtime should surface.
    var onFailure: ((String) -> Void)?

    // MARK: - Start

    /// Everything `startCanvasSession` does after the bootstrap fetch.
    init(
        canvasId: String,
        canvasName: String,
        identity: CollaborationIdentity,
        bootstrap: CollaborationBootstrap,
        cachedDocument: CachedCollaborationDocument?,
        repository: CollaborationRepository,
        queue: OfflineUpdateQueue,
        host: CollaborationHost,
        state: CollaborationState,
        clock: Clock = .system,
        clientId: UInt64 = UInt64(UInt32.random(in: 1...UInt32.max))
    ) {
        self.canvasId = canvasId
        self.role = bootstrap.role
        self.repository = repository
        self.queue = queue
        self.host = host
        self.state = state
        self.clock = clock
        crdt = CanvasCrdt(clientId: clientId)
        lastSequence = max(bootstrap.lastSequence, bootstrap.updates.map(\.sequence).max() ?? 0)
        updatesSinceCompaction = bootstrap.updates.count
        bytesSinceCompaction = bootstrap.updates.reduce(0) { $0 + $1.payload.count }

        var hasRemoteState = false
        for payload in [cachedDocument?.snapshot, bootstrap.snapshot].compactMap({ $0 }) + bootstrap.updates.map(\.payload) {
            hasRemoteState = true
            do { try crdt.applyRemoteUpdate(update: payload) } catch { state.error = "\(error)" }
        }

        awareness = Awareness(clientId: crdt.clientId(), now: { clock.nowMs() })
        channel = repository.documentChannel(canvasId)
        awarenessChannel = repository.awarenessChannel(canvasId, presenceKey: identity.userId)

        if hasRemoteState { applyDocumentToStore() }
        if previousStoreSnapshot == nil { previousStoreSnapshot = try? CanvasCrdtSchema.snapshotCanvas(host.board, canvasId: canvasId) }

        state.role = bootstrap.role
        state.publicAccess = bootstrap.publicAccess
        state.localClientId = awareness.clientId
        state.error = nil
        publishPendingUpdateCount()

        awareness.setLocalState(PresenceRules.localState(
            userId: identity.userId, name: identity.name, color: identity.color, role: bootstrap.role,
            cursor: nil, selectedWidgetIds: host.selectedWidgetIds, editingWidgetId: nil,
            camera: host.camera, lastSeenAt: clock.nowMs()
        ))
        awareness.onUpdate = { [weak self] _, origin in
            guard let self else { return }
            self.publishParticipants()
            if origin == .local { self.schedulePresence() }
        }
        awarenessCheck = Timer.scheduledTimer(withTimeInterval: Double(Self.awarenessCheckIntervalMs) / 1000, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.awareness.checkOutdated() }
        }

        installChannels()

        if !hasRemoteState {
            if bootstrap.role.canEdit {
                seedFromStore()
                crdt.clearUndoHistory()
            } else {
                let empty = CanvasCollaborationSnapshot.empty(canvasId: canvasId, name: canvasName)
                try? crdt.applyRemoteEdits(edits: CanvasCrdtSchema.edits(for: empty, previous: nil))
                applyDocumentToStore()
            }
        }
        scheduleDocumentCache()
        installGuards()
        installObservers()
        Task { [weak self] in try? await self?.refreshComments() }
        publishParticipants()
    }

    // MARK: - Bridge

    /// `applyDocumentToStore`: validated document → board, no undo step.
    func applyDocumentToStore() {
        guard !disposed else { return }
        do {
            let validated = try CanvasCrdtSchema.read(crdt, canvasId: canvasId, local: host.board)
            let merged = CanvasCrdtSchema.merge(validated, into: host.board)
            applyingDocument = true
            defer { applyingDocument = false }
            host.applyCollaborativeBoard(merged)
            previousStoreSnapshot = try? CanvasCrdtSchema.snapshotCanvas(host.board, canvasId: canvasId)
        } catch {
            report(error)
        }
    }

    /// `queueApply`: coalesce bursts of remote updates into one board write.
    private func queueApply() {
        guard !applyQueued, !disposed else { return }
        applyQueued = true
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.applyQueued = false
                self.applyDocumentToStore()
            }
        }
    }

    /// The store subscription: write this person's board changes into the
    /// document and send what they produced.
    private func boardDidChange() {
        guard !applyingDocument, !disposed, host.board.canvases.contains(canvasId) else { return }
        do {
            let next = try CanvasCrdtSchema.snapshotCanvas(host.board, canvasId: canvasId)
            guard next != previousStoreSnapshot else { return }
            // A read-only role never writes: the guards keep the board inert,
            // and anything that still changed is not ours to publish.
            guard role.canEdit else {
                previousStoreSnapshot = next
                return
            }
            let update = try CanvasCrdtSchema.write(next, to: crdt, previous: previousStoreSnapshot)
            previousStoreSnapshot = next
            if !update.isEmpty {
                scheduleLocalUpdate(update)
                scheduleDocumentCache()
            }
        } catch {
            report(error)
        }
    }

    /// `seedFromStore`: a first editor publishes the board as it stands.
    private func seedFromStore() {
        do {
            let next = try CanvasCrdtSchema.snapshotCanvas(host.board, canvasId: canvasId)
            let update = try CanvasCrdtSchema.write(next, to: crdt, previous: nil)
            previousStoreSnapshot = next
            if !update.isEmpty { scheduleLocalUpdate(update) }
        } catch {
            report(error)
        }
    }

    private func applyRemote(_ payload: Data) throws {
        try crdt.applyRemoteUpdate(update: payload)
        queueApply()
        scheduleDocumentCache()
    }

    // MARK: - Collaborative undo

    fileprivate func performUndo(redo: Bool) {
        guard role.canEdit, !disposed else { return }
        let update = redo ? crdt.redo() : crdt.undo()
        guard !update.isEmpty else { return }
        scheduleLocalUpdate(update)
        scheduleDocumentCache()
        // Undo changes the document first; the board follows synchronously so
        // the menu item and the canvas agree before the next event.
        applyDocumentToStore()
    }

    // MARK: - Delivery

    /// `scheduleLocalUpdate`.
    private func scheduleLocalUpdate(_ update: Data) {
        guard role.canEdit, update.count <= Self.maxWireUpdateBytes else { return }
        let updateId = UUID().uuidString.lowercased()
        if connected {
            // Ids normally drain at flush; a queue merge can strand a few.
            // Duplicate broadcasts are harmless, so an occasional reset is safe.
            if broadcastUpdateIds.count > 1024 { broadcastUpdateIds.removeAll() }
            broadcastUpdateIds.insert(updateId)
            var payload = JSONObject()
            payload["id"] = .string(updateId)
            payload["data"] = .string(CollaborationBinary.base64(update))
            let channel = self.channel
            Task { [weak self] in
                do {
                    try await channel.send(event: Self.updateEvent, payload: payload)
                } catch {
                    guard let self, !self.disposed else { return }
                    self.broadcastUpdateIds.remove(updateId)
                    self.state.status = .reconnecting
                    self.state.error = "Realtime update \(error). Your edit is saved and will retry automatically."
                }
            }
        }
        do {
            try queue.enqueue(canvasId, payload: update, id: updateId)
        } catch {
            state.status = host.isOnline ? .error : .offline
            state.error = "\(error)"
            return
        }
        publishPendingUpdateCount()
        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.flushPending()
                try await self.compactIfNeeded()
            } catch {
                guard !self.disposed else { return }
                self.state.status = self.host.isOnline ? .error : .offline
                self.state.error = "\(error)"
            }
        }
    }

    private func publishPendingUpdateCount() {
        guard !disposed else { return }
        state.pendingUpdates = queue.count(canvasId)
    }

    /// `flushPending`: single flight; a call during a flush runs once more.
    func flushPending() async throws {
        if let flushTask {
            flushAgain = true
            return try await flushTask.value
        }
        guard host.isOnline, role.canEdit else { return }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            var persistedAny = false
            while self.host.isOnline, !self.disposed {
                let pending = self.queue.list(self.canvasId)
                if pending.isEmpty { break }
                var batch: [PendingCollaborationUpdate] = []
                var batchBytes = 0
                for update in pending {
                    if !batch.isEmpty, batch.count >= Self.durableBatchRows || batchBytes + update.payload.count > Self.durableBatchBytes { break }
                    batch.append(update)
                    batchBytes += update.payload.count
                }
                try await self.repository.persistUpdates(self.canvasId, updates: batch.map { ($0.id, $0.payload) })
                persistedAny = true
                self.updatesSinceCompaction += batch.count
                self.bytesSinceCompaction += batchBytes
                if self.connected {
                    for update in batch where !self.broadcastUpdateIds.contains(update.id) {
                        var payload = JSONObject()
                        payload["id"] = .string(update.id)
                        payload["data"] = .string(CollaborationBinary.base64(update.payload))
                        try await self.channel.send(event: Self.updateEvent, payload: payload)
                    }
                }
                for update in batch { self.broadcastUpdateIds.remove(update.id) }
                self.queue.remove(batch.map(\.id), canvasId: self.canvasId)
                self.publishPendingUpdateCount()
            }
            if persistedAny { try await self.syncDurableUpdates() }
        }
        flushTask = task
        defer {
            flushTask = nil
            if flushAgain {
                flushAgain = false
                Task { [weak self] in
                    try? await self?.flushPending()
                    try? await self?.compactIfNeeded()
                }
            }
        }
        try await task.value
    }

    /// `syncDurableUpdates`: apply every durable update past `lastSequence`.
    func syncDurableUpdates() async throws {
        while !disposed {
            let updates = try await repository.fetchUpdates(canvasId, after: lastSequence)
            if updates.isEmpty { break }
            for update in updates {
                try applyRemote(update.payload)
                lastSequence = max(lastSequence, update.sequence)
            }
            if updates.count < 10_000 { break }
        }
    }

    /// `compactIfNeeded`: fold the durable log into a snapshot past 200
    /// updates or 512 KiB.
    func compactIfNeeded() async throws {
        guard updatesSinceCompaction >= Self.compactUpdateCount || bytesSinceCompaction >= Self.compactByteCount else { return }
        if let compactionTask { return try await compactionTask.value }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            try await self.syncDurableUpdates()
            guard self.lastSequence != 0 else { return }
            try await self.repository.compact(self.canvasId, snapshot: self.crdt.encodeStateAsUpdate(), lastSequence: self.lastSequence)
            self.updatesSinceCompaction = 0
            self.bytesSinceCompaction = 0
        }
        compactionTask = task
        defer { compactionTask = nil }
        try await task.value
    }

    private func scheduleDurableRepair() {
        durableRepairTimer.schedule(afterMs: Self.durableRepairIntervalMs) { [weak self] in
            guard let self, !self.disposed else { return }
            Task { [weak self] in
                try? await self?.syncDurableUpdates()
                self?.scheduleDurableRepair()
            }
        }
    }

    private func scheduleDocumentCache() {
        cacheTimer.schedule(afterMs: Self.documentCacheDelayMs) { [weak self] in self?.cacheDocument() }
    }

    private func cacheDocument() {
        try? queue.writeDocument(CachedCollaborationDocument(
            canvasId: canvasId, snapshot: crdt.encodeStateAsUpdate(),
            lastSequence: lastSequence, role: role, updatedAt: clock.nowMs()
        ))
    }

    // MARK: - Channels

    private func installChannels() {
        channel.onBroadcast(event: Self.updateEvent) { [weak self] payload in
            guard let self, !self.disposed, let data = payload.string("data") else { return }
            do {
                let update = try CollaborationBinary.bytes(base64: data)
                if update.count > Self.maxWireUpdateBytes { throw CollaborationError("Realtime update exceeded safety limit") }
                try self.applyRemote(update)
            } catch {
                self.state.error = "\(error)"
            }
        }
        awarenessChannel.onBroadcast(event: Self.awarenessEvent) { [weak self] payload in
            guard let self, !self.disposed, let encoded = payload.string("awareness"),
                  let clientId = payload.number("clientId"), UInt64(exactly: clientId) != self.awareness.clientId,
                  let update = try? CollaborationBinary.bytes(base64: encoded) else { return }
            try? self.awareness.applyUpdate(update, origin: .remote)
        }
        awarenessChannel.onPresenceSync { [weak self] entries in
            guard let self, !self.disposed else { return }
            var live = Set<UInt64>()
            for entry in entries {
                guard let encoded = entry.payload.string("awareness"), let number = entry.payload.number("clientId"),
                      let clientId = UInt64(exactly: number) else { continue }
                if clientId != self.awareness.clientId { live.insert(clientId) }
                if let update = try? CollaborationBinary.bytes(base64: encoded) { try? self.awareness.applyUpdate(update, origin: .remote) }
            }
            let stale = self.awareness.states.keys.filter { $0 != self.awareness.clientId && !live.contains($0) }
            if !stale.isEmpty { self.awareness.removeStates(Array(stale), origin: .remote) }
            self.publishParticipants()
        }
        channel.subscribe { [weak self] status in
            guard let self, !self.disposed else { return }
            switch status {
            case .subscribed:
                self.connected = true
                self.scheduleDurableRepair()
                Task { [weak self] in
                    guard let self else { return }
                    do {
                        try await self.syncDurableUpdates()
                        try await self.flushPending()
                        guard !self.disposed else { return }
                        self.documentBootstrapped = true
                        self.markConnectedIfReady()
                    } catch {
                        self.reportRealtimeFailure(error)
                    }
                }
            case .channelError(let message):
                self.connected = false
                self.state.status = self.host.isOnline ? .reconnecting : .offline
                self.state.error = message
            case .timedOut:
                self.connected = false
                self.state.status = self.host.isOnline ? .reconnecting : .offline
            case .closed:
                self.connected = false
            }
        }
        awarenessChannel.subscribe { [weak self] status in
            guard let self, !self.disposed else { return }
            switch status {
            case .subscribed:
                self.awarenessConnected = true
                Task { [weak self] in
                    guard let self else { return }
                    do {
                        try await self.publishPresence()
                        guard !self.disposed else { return }
                        self.presencePublished = true
                        self.markConnectedIfReady()
                    } catch {
                        self.reportRealtimeFailure(error)
                    }
                }
            case .channelError(let message):
                self.awarenessConnected = false
                self.state.status = self.host.isOnline ? .reconnecting : .offline
                self.state.error = message
            case .timedOut:
                self.awarenessConnected = false
                self.state.status = self.host.isOnline ? .reconnecting : .offline
            case .closed:
                self.awarenessConnected = false
            }
        }
    }

    private func encodedLocalAwareness() -> JSONObject {
        var payload = JSONObject()
        payload["clientId"] = .number(Double(awareness.clientId))
        payload["awareness"] = .string(CollaborationBinary.base64(awareness.encodeUpdate(clients: [awareness.clientId])))
        return payload
    }

    /// Presence carries the participant's initial state once (low-frequency).
    private func publishPresence() async throws {
        guard awarenessConnected else { return }
        try await awarenessChannel.track(encodedLocalAwareness())
    }

    /// Changing awareness travels over a throttled broadcast stream so
    /// pointer movement cannot exhaust Presence rate limits.
    private func publishAwareness() async throws {
        guard awarenessConnected else { return }
        try await awarenessChannel.send(event: Self.awarenessEvent, payload: encodedLocalAwareness())
    }

    private func schedulePresence() {
        guard !presenceTimer.isScheduled else { return }
        presenceTimer.schedule(afterMs: Self.awarenessBroadcastIntervalMs) { [weak self] in
            Task { [weak self] in
                do { try await self?.publishAwareness() } catch { self?.reportRealtimeFailure(error) }
            }
        }
    }

    private func markConnectedIfReady() {
        guard connected, awarenessConnected, documentBootstrapped, presencePublished, !disposed else { return }
        state.status = .connected
        state.error = nil
    }

    private func reportRealtimeFailure(_ error: Error) {
        guard !disposed else { return }
        state.status = host.isOnline ? .error : .offline
        state.error = "\(error). Local edits remain safe."
    }

    private func report(_ error: Error) {
        guard !disposed else { return }
        state.status = .error
        state.error = "\(error)"
    }

    // MARK: - Presence

    /// `publishParticipants`, including follow reconciliation.
    func publishParticipants() {
        guard !disposed else { return }
        let participants = PresenceRules.participants(awareness.states, now: clock.nowMs())
        state.participants = participants
        let follow = resolveFollowTarget(participants, following: state.followingClientId)
        if follow.followingClientId != state.followingClientId { state.followingClientId = follow.followingClientId }
        if let camera = follow.camera { host.setCamera(camera) }
    }

    func updatePresence(_ patch: (inout JSONObject) -> Void) {
        guard var local = awareness.localState, !disposed else { return }
        patch(&local)
        local["lastSeenAt"] = .number(clock.nowMs())
        awareness.setLocalState(local)
    }

    public func setEditingWidget(_ widgetId: String?) {
        updatePresence { $0["editingWidgetId"] = widgetId.map(JSONValue.string) ?? .null }
    }

    public func follow(_ clientId: UInt64?) {
        state.followingClientId = clientId
        publishParticipants()
    }

    private func installObservers() {
        disposers.append(host.observeBoard { [weak self] in self?.boardDidChange() })
        disposers.append(host.observeSelection { [weak self] in
            guard let self else { return }
            let ids = self.host.selectedWidgetIds
            self.updatePresence { $0["selectedWidgetIds"] = .array(ids.map(JSONValue.string)) }
        })
        disposers.append(host.observeCamera { [weak self] in
            guard let self, self.state.followingClientId == nil else { return }
            self.cameraTimer.schedule(afterMs: Self.cameraPresenceDelayMs) { [weak self] in
                guard let self, let camera = self.host.camera else { return }
                self.updatePresence { $0["camera"] = PresenceRules.cameraJSON(camera) }
            }
        })
        // One cursor publish per frame at most.
        disposers.append(host.observePointer { [weak self] point in
            guard let self else { return }
            guard let point else {
                self.pointerTimer.cancel()
                self.pendingCursor = nil
                self.updatePresence { $0["cursor"] = .null }
                return
            }
            self.pendingCursor = point
            guard !self.pointerTimer.isScheduled else { return }
            self.pointerTimer.schedule(afterMs: 16) { [weak self] in
                guard let self, let cursor = self.pendingCursor else { return }
                self.pendingCursor = nil
                self.updatePresence { $0["cursor"] = PresenceRules.pointJSON(cursor) }
            }
        })
    }

    // MARK: - Guards (permissionGuards.ts)

    private func installGuards() {
        host.setHistory(SessionHistory(session: self))
        host.setEditingLocked(!role.canEdit)
    }

    // MARK: - Network

    public func networkBecameOnline() {
        state.status = connected && awarenessConnected ? .connected : .reconnecting
        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.syncDurableUpdates()
                try await self.flushPending()
            } catch {
                self.reportRealtimeFailure(error)
            }
        }
    }

    public func networkWentOffline() {
        state.status = .offline
    }

    // MARK: - Comments

    public func refreshComments() async throws {
        let comments = try await repository.listComments(canvasId)
        guard !disposed else { return }
        state.comments = comments
    }

    public func postComment(_ body: String, parentId: String?, widgetId: String?) async throws {
        guard role.canComment else { throw CollaborationError("Your role cannot add comments") }
        try await repository.addComment(canvasId, body: body, parentId: parentId, widgetId: widgetId)
        try await refreshComments()
    }

    public func invite(email: String, role invited: CollaborationRole) async throws {
        guard role == .owner else { throw CollaborationError("Only the canvas owner can invite people") }
        try await repository.setMemberRole(canvasId, email: email, role: invited)
    }

    public func setPublicAccess(_ isPublic: Bool) async throws {
        guard role == .owner else { throw CollaborationError("Only the canvas owner can change public access") }
        try await repository.setPublicAccess(canvasId, isPublic: isPublic)
        state.publicAccess = isPublic
    }

    var repositoryForSharing: CollaborationRepository { repository }

    // MARK: - Dispose

    public func dispose() {
        guard !disposed else { return }
        cacheDocument()
        disposed = true
        presenceTimer.cancel()
        durableRepairTimer.cancel()
        cameraTimer.cancel()
        cacheTimer.cancel()
        pointerTimer.cancel()
        awarenessCheck?.invalidate()
        awarenessCheck = nil
        for dispose in disposers { dispose() }
        disposers = []
        host.setEditingLocked(false)
        host.setHistory(nil)
        awareness.onUpdate = nil
        awarenessChannel.close()
        channel.close()
        awareness.destroy()
    }
}

/// Undo and Redo while a session runs: this person's own CRDT changes only.
@MainActor
final class SessionHistory: CollaborativeHistory {
    private weak var session: CollaborationSession?

    init(session: CollaborationSession) { self.session = session }

    var canUndo: Bool { session.map { $0.role.canEdit && $0.crdt.canUndo() } ?? false }
    var canRedo: Bool { session.map { $0.role.canEdit && $0.crdt.canRedo() } ?? false }
    func undo() { session?.performUndo(redo: false) }
    func redo() { session?.performUndo(redo: true) }
}

/// A cancellable one-shot on the main queue (the web's `setTimeout` ids).
@MainActor
struct MainTimer {
    private var item: DispatchWorkItem?

    var isScheduled: Bool { item.map { !$0.isCancelled } ?? false }

    mutating func schedule(afterMs ms: Int, _ work: @escaping @MainActor () -> Void) {
        item?.cancel()
        var fired: DispatchWorkItem?
        let next = DispatchWorkItem {
            fired?.cancel()
            MainActor.assumeIsolated { work() }
        }
        fired = next
        item = next
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(ms), execute: next)
    }

    mutating func cancel() {
        item?.cancel()
        item = nil
    }
}
