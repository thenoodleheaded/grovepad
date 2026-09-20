import Foundation

// ---------------------------------------------------------------------------
// Port of the cloud half of `src/utils/persistence.ts` (`reconcile`,
// `syncWhenActive`, the idle push timer) as an engine over injected seams:
// a `CloudSyncHost` (the document), a `CloudBoardService` (the network), a
// `SyncBaselineStore` (lineage), a `TimerSource` and a `Clock`.
//
// Sync is opt-in and, when on, keeps this device and the account in step
// continuously rather than once a day. A check reads two small checksum
// columns (`fetchCloudHead`) and stops there when nothing moved; an upload
// re-sends only the canvases whose checksums changed (storage laws 11–12).
// The reconcile itself is the storage contract's three-way law (8–10): the
// baseline says which side moved, so nothing is ever asked.
//
// Local work never waits on any of this. Every path here is a consequence of
// an edit, never a gate on one: offline queues a retry, an error keeps the
// device's copy, a guest leaves the engine idle.
// ---------------------------------------------------------------------------

/// What the engine needs from the document. `BoardDocument` (Chrome) is the
/// real host; tests use a small class.
public protocol CloudSyncHost: AnyObject {
    /// The live board.
    var board: Board { get }
    /// Bumped by every document-changing update. The reconcile snapshots it
    /// before a round trip and refuses to adopt or merge over a later edit.
    var documentEpoch: Int { get }
    /// A board this build refuses to write to disk (future version, unreadable
    /// local record) must not reach the cloud either: `pushCloudBoard` DELETES
    /// remote canvas rows absent from what it is handed.
    var localWritesBlocked: Bool { get }
    /// Adopt the account's board (or the merge). Clears undo history, as
    /// `loadBoard` does on the web.
    func loadBoard(_ board: Board)
}

/// Injectable timers, so the idle push and the offline retry are testable
/// without waiting. Handles are opaque integers.
public protocol TimerSource: AnyObject {
    func schedule(afterMs: Double, _ run: @escaping () -> Void) -> Int
    func cancel(_ handle: Int)
}

/// Dispatch-queue timers for the app.
public final class SystemTimerSource: TimerSource {
    private var next = 1
    private var live = Set<Int>()
    private let queue: DispatchQueue

    public init(queue: DispatchQueue = .main) {
        self.queue = queue
    }

    public func schedule(afterMs: Double, _ run: @escaping () -> Void) -> Int {
        let handle = next
        next += 1
        live.insert(handle)
        queue.asyncAfter(deadline: .now() + .milliseconds(Int(max(0, afterMs)))) { [weak self] in
            guard let self, self.live.remove(handle) != nil else { return }
            run()
        }
        return handle
    }

    public func cancel(_ handle: Int) {
        live.remove(handle)
    }
}

/// A clock-driven timer source for tests: nothing fires until `advance`.
public final class ManualTimerSource: TimerSource {
    private struct Pending { let due: Double; let run: () -> Void }
    private var next = 1
    private var pending: [Int: Pending] = [:]
    public private(set) var now: Double

    public init(now: Double = 0) {
        self.now = now
    }

    public var scheduledCount: Int { pending.count }

    public func schedule(afterMs: Double, _ run: @escaping () -> Void) -> Int {
        let handle = next
        next += 1
        pending[handle] = Pending(due: now + afterMs, run: run)
        return handle
    }

    public func cancel(_ handle: Int) {
        pending.removeValue(forKey: handle)
    }

    /// Move the clock forward, firing every timer that comes due, in order.
    public func advance(byMs delta: Double) {
        let target = now + delta
        while let (handle, item) = pending.filter({ $0.value.due <= target }).min(by: { $0.value.due < $1.value.due }) {
            now = item.due
            pending.removeValue(forKey: handle)
            item.run()
        }
        now = target
    }
}

public enum CloudSyncStatus: Equatable {
    /// Sync is switched off.
    case off
    /// No account: the engine is idle and the app is fully usable.
    case guest
    case saving
    case synced
    /// The network is unreachable; a retry is queued and edits keep piling up locally.
    case offline
    case error(String)
    /// The cloud holds a board from a newer Grovepad (storage law 3).
    case compatibilityBlock(foundVersion: Int)
}

/// What the web shows as a toast.
public enum CloudSyncNotice: Equatable {
    /// Cards edited in two places — both versions are on the canvas.
    case keptBoth([String])
    /// Sync hit a problem; changes are safe on this device.
    case syncProblem
}

public final class CloudSyncEngine {
    /// Floor between automatic checks. Focus changes and idle edits both land here.
    public static let checkIntervalMs: Double = 5 * 60 * 1000
    /// Quiet time after the last board edit before this device uploads.
    public static let pushIdleMs: Double = 20_000
    /// Offline retry back-off: 5 s doubling to a 5 min ceiling.
    public static let retryBaseMs: Double = 5_000
    public static let retryCeilingMs: Double = 5 * 60 * 1000

    public let host: CloudSyncHost
    public let service: CloudBoardService
    public let baselines: SyncBaselineStore
    public let timers: TimerSource
    public let clock: Clock
    public let mint: IdMinter

    public private(set) var status: CloudSyncStatus = .off {
        didSet { if status != oldValue { onStatusChange?(status) } }
    }
    /// Epoch milliseconds of the last successful sync for the current account.
    public private(set) var lastSyncedAt: Double?
    public private(set) var userId: String?
    public private(set) var syncEnabled: Bool
    public var onStatusChange: ((CloudSyncStatus) -> Void)?
    public var onNotice: ((CloudSyncNotice) -> Void)?

    private var reconcileToken = 0
    private var lastCheckAt: Double = 0
    private var disposed = false
    private var pushTimer: Int?
    private var retryTimer: Int?
    private var retryAttempt = 0
    private var problemAnnounced = false
    private var inFlight: Task<Void, Never>?

    public init(
        host: CloudSyncHost,
        service: CloudBoardService,
        baselines: SyncBaselineStore,
        timers: TimerSource,
        clock: Clock = .system,
        mint: IdMinter = .system,
        userId: String? = nil,
        syncEnabled: Bool = true
    ) {
        self.host = host
        self.service = service
        self.baselines = baselines
        self.timers = timers
        self.clock = clock
        self.mint = mint
        self.userId = userId
        self.syncEnabled = syncEnabled
    }

    // MARK: - Inputs

    /// Boot: the first reconcile always checks (`reconcile(lastUserId, true)`).
    public func start() {
        launch(force: true)
    }

    /// The session changed. The throttle is per account: a fresh sign-in
    /// always checks; a sign-out drops to guest and cancels every timer.
    public func setAccount(_ userId: String?) {
        guard userId != self.userId else { return }
        self.userId = userId
        lastCheckAt = 0
        lastSyncedAt = nil
        clearRetry()
        launch(force: true)
    }

    /// Enabling the toggle syncs immediately (that click is explicit intent);
    /// disabling stops all cloud traffic until it is turned back on.
    public func setSyncEnabled(_ enabled: Bool) {
        guard enabled != syncEnabled else { return }
        syncEnabled = enabled
        if !enabled {
            cancelPush()
            clearRetry()
        }
        launch(force: enabled)
    }

    /// A document-changing edit. Uploading shortly after the edits stop is
    /// what keeps the two sides from drifting far enough apart to need a merge.
    public func noteDocumentEdited() {
        guard !disposed, syncEnabled, userId != nil else { return }
        cancelPush()
        pushTimer = timers.schedule(afterMs: Self.pushIdleMs) { [weak self] in
            guard let self else { return }
            self.pushTimer = nil
            self.launch(force: true)
        }
    }

    /// The window or scene became active: check, throttled by `checkIntervalMs`.
    public func noteBecameActive() {
        launch(force: false)
    }

    /// The network came back. Only an engine waiting offline reacts.
    public func noteNetworkReachable() {
        guard status == .offline else { return }
        clearRetry()
        launch(force: true)
    }

    /// "Sync now": bypasses the check interval for the current account.
    public func syncNow() async {
        await reconcile(force: true)
    }

    /// Wait for the reconcile a timer or input started. Tests await this
    /// instead of sleeping; the app never needs it.
    public func settle() async {
        while let task = inFlight {
            await task.value
            if inFlight == task { inFlight = nil }
        }
    }

    public func dispose() {
        disposed = true
        reconcileToken += 1
        cancelPush()
        clearRetry()
    }

    // MARK: - Scheduling

    private func launch(force: Bool) {
        guard !disposed else { return }
        let previous = inFlight
        inFlight = Task { [weak self] in
            await previous?.value
            await self?.reconcile(force: force)
        }
    }

    private func cancelPush() {
        if let pushTimer { timers.cancel(pushTimer) }
        pushTimer = nil
    }

    private func clearRetry() {
        if let retryTimer { timers.cancel(retryTimer) }
        retryTimer = nil
        retryAttempt = 0
    }

    /// Offline: keep working locally and try again later, backing off.
    private func scheduleRetry() {
        guard retryTimer == nil, !disposed else { return }
        let delay = min(Self.retryCeilingMs, Self.retryBaseMs * pow(2, Double(retryAttempt)))
        retryAttempt += 1
        retryTimer = timers.schedule(afterMs: delay) { [weak self] in
            guard let self else { return }
            self.retryTimer = nil
            self.launch(force: true)
        }
    }

    // MARK: - The reconcile

    /// `reconcile(userId, force)`. Safe to call at any time; a later call
    /// invalidates an earlier one still in flight.
    public func reconcile(force: Bool) async {
        reconcileToken += 1
        let token = reconcileToken
        guard syncEnabled else {
            status = .off
            return
        }
        guard let userId else {
            status = .guest
            return
        }
        let startedAt = clock.nowMs()
        if !force, startedAt - lastCheckAt < Self.checkIntervalMs {
            // Checked moments ago. Say so from the stamp rather than re-asking
            // the network every time the window regains focus.
            status = .synced
            if lastSyncedAt == nil { lastSyncedAt = baselines.read(userId: userId)?.at }
            return
        }
        lastCheckAt = startedAt
        status = .saving
        do {
            if host.localWritesBlocked {
                status = .error("The local board could not be read or written; sync is paused to protect it")
                return
            }
            let localBoard = host.board
            let local = BoardSerializer.serializePersistedBoard(localBoard)
            let localEpoch = host.documentEpoch
            let baseline = baselines.read(userId: userId)
            let localPrint = CloudDocuments.fingerprintBoard(local)
            guard isCurrent(token) else { return }

            // Step one is deliberately not a board fetch. The cloud already
            // stores the same checksums fingerprintBoard computes, so two small
            // metadata reads settle most reconciles with no board crossing the
            // network in either direction.
            let head = try await service.fetchCloudHead(userId: userId)
            guard isCurrent(token) else { return }

            func settle(_ board: JSONObject, _ print: CloudDocuments.BoardFingerprint, _ cloudUpdatedAt: String?) {
                let syncedAt = clock.nowMs()
                baselines.write(SyncBaseline(userId: userId, board: board, fingerprint: print, cloudUpdatedAt: cloudUpdatedAt, at: syncedAt))
                guard isCurrent(token) else { return }
                clearRetry()
                problemAnnounced = false
                lastSyncedAt = syncedAt
                status = .synced
            }

            switch head {
            case .none:
                // No cloud board yet — first sign-in on this account. Seed it
                // with whatever is here, including work done as a guest.
                try await service.pushCloudBoard(userId: userId, board: local)
                guard isCurrent(token) else { return }
                settle(local, localPrint, nil)
                return
            case .head(let cloudHead):
                let cloudPrint = cloudHead.fingerprint
                // Already identical, whatever the baseline says. Nothing to
                // transfer, and the lineage can be re-established for free.
                if localPrint.matches(cloudPrint) {
                    settle(local, localPrint, cloudHead.updatedAt)
                    return
                }
                // Only this device moved: a plain upload, never a question.
                // This is the case a byte comparison could not tell from a
                // conflict, and by far the most common one.
                if let baseline, cloudPrint.matches(baseline.fingerprint) {
                    try await service.pushCloudBoard(userId: userId, board: local)
                    guard isCurrent(token) else { return }
                    settle(local, localPrint, nil)
                    return
                }
            case .inconclusive:
                break
            }

            // The cloud moved (or the cheap check could not be trusted). Only
            // now is a full fetch worth its bytes.
            let cloudResult = try await service.fetchCloudBoard(userId: userId)
            guard isCurrent(token) else { return }
            // Everything past here derives from `local`, snapshotted before the
            // round trip. If the document moved meanwhile, that snapshot is
            // stale and loading from it would discard the edit; the edit
            // already scheduled a cloud push, so the next reconcile starts
            // from a fresh snapshot.
            guard host.documentEpoch == localEpoch else { return }
            guard let cloudResult else {
                try await service.pushCloudBoard(userId: userId, board: local)
                guard isCurrent(token) else { return }
                settle(local, localPrint, nil)
                return
            }
            let cloudSnapshot = cloudResult.board

            // Only the cloud moved, or there is nothing here worth protecting:
            // adopt the account's board outright.
            let localUnchanged = baseline.map { localPrint.matches($0.fingerprint) } ?? false
            if localUnchanged || localBoard.widgets.isEmpty {
                guard let cloudBoard = BoardParser.parsePersistedBoard(.object(cloudSnapshot)) else {
                    throw CloudBoardError("Cloud board failed validation")
                }
                host.loadBoard(cloudBoard)
                let cloudPrint = CloudDocuments.fingerprintBoard(cloudSnapshot)
                // A board still living in the retained monolithic row is
                // rewritten as split documents on the way past.
                if cloudResult.source == .legacy { try await service.pushCloudBoard(userId: userId, board: cloudSnapshot) }
                guard isCurrent(token) else { return }
                settle(cloudSnapshot, cloudPrint, cloudResult.updatedAt)
                return
            }

            // Both sides moved. The baseline says which side moved each
            // record, so this resolves without asking (ThreeWayMerge.swift).
            let merge = mergeBoardsThreeWay(base: baseline?.board, local: local, cloud: cloudSnapshot, mint: mint)
            guard let hydrated = BoardParser.parsePersistedBoard(.object(merge.board)) else {
                throw CloudBoardError("Merged board failed validation")
            }
            // Re-serialized rather than pushed straight from the merge, so the
            // document that lands in the cloud is exactly the one the document holds.
            let mergedSnapshot = BoardSerializer.serializePersistedBoard(hydrated)
            let mergedJson = CloudDocuments.canonicalJson(.object(mergedSnapshot))
            if mergedJson != CloudDocuments.canonicalJson(.object(local)) { host.loadBoard(hydrated) }
            let mergedPrint = CloudDocuments.fingerprintBoard(mergedSnapshot)
            if mergedJson != CloudDocuments.canonicalJson(.object(cloudSnapshot)) || cloudResult.source == .legacy {
                try await service.pushCloudBoard(userId: userId, board: mergedSnapshot)
            }
            guard isCurrent(token) else { return }
            settle(mergedSnapshot, mergedPrint, nil)
            if !merge.keptBothTitles.isEmpty { onNotice?(.keptBoth(merge.keptBothTitles)) }
        } catch {
            guard !disposed, isCurrent(token) else { return }
            if let future = error as? FuturePersistedBoardVersionError {
                status = .compatibilityBlock(foundVersion: future.foundVersion)
                return
            }
            if case CloudTransportError.offline = error {
                // Offline is not an error: the device's copy is safe and a
                // retry is queued. Nothing typed meanwhile is lost — the next
                // reconcile snapshots the live document.
                status = .offline
                scheduleRetry()
                return
            }
            status = .error(Self.describe(error))
            // Say it once, on the transition into failure — a recolored dot in
            // the corner is not enough notice that sync stopped.
            if !problemAnnounced {
                problemAnnounced = true
                onNotice?(.syncProblem)
            }
        }
    }

    private func isCurrent(_ token: Int) -> Bool {
        !disposed && token == reconcileToken
    }

    static func describe(_ error: Error) -> String {
        switch error {
        case CloudTransportError.refused(let message): return message
        case CloudTransportError.other(let message): return message
        case CloudTransportError.schemaMissing: return "The cloud database is missing the documents schema"
        case let described as CustomStringConvertible: return described.description
        default: return String(describing: error)
        }
    }
}
