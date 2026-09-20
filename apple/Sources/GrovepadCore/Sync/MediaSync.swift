import Foundation

// ---------------------------------------------------------------------------
// Port of `src/services/mediaSyncService.ts`: board media travels beside the
// board, never inside it.
//
// A dropped picture is written to the device's own blob store first and the
// board keeps only its key. This service is the courier that carries the
// bytes to the other devices: after the local write lands it uploads a copy
// to the private `board-media` bucket at `<canvasId>/<userId>/<blobKey>`, and
// a device that meets a key it holds no blob for downloads it once and
// caches it.
//
// Every path here is best-effort by construction. Signed out, offline, over
// the size limit, or refused by the bucket's policy, the media simply stays
// device-local and the board keeps working — nothing here throws at its
// callers, and nothing here blocks a local write.
// ---------------------------------------------------------------------------

public enum MediaSyncPolicy {
    public static let bucket = "board-media"
    /// Matches the bucket's own ceiling; refusing here saves a doomed upload.
    public static let uploadLimitBytes = 25 * 1024 * 1024
    /// A queued upload is retried a few times, then left to the reconcile sweep.
    public static let maxAttempts = 4
    public static let retryBaseMs: Double = 2_000
    /// The widget that owns a key is written a tick after its blob, so the
    /// queue always waits before asking which canvas a key belongs to.
    public static let drainDelayMs: Double = 400

    /// `objectPath(canvasId, userId, key)`: the uploader's id is a path
    /// segment because the Storage policy decides ownership from the path
    /// alone (migration 20260812120000).
    public static func objectPath(canvasId: String, userId: String, key: String) -> String {
        "\(canvasId)/\(userId)/\(key)"
    }

    /// Storage folder listings are untyped; only uuid-shaped entries are uploaders.
    public static func isUUIDSegment(_ name: String) -> Bool {
        let parts = name.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 5, parts.map(\.count) == [8, 4, 4, 4, 12] else { return false }
        return name.unicodeScalars.allSatisfy { $0 == "-" || ("0"..."9").contains($0) || ("a"..."f").contains($0) || ("A"..."F").contains($0) }
    }
}

// `MediaBlob` (bytes + MIME type) is the package loader's type in
// `Package/GrovepadPackage.swift`; the courier carries the same value.

public enum MediaUploadOutcome: Equatable {
    case uploaded
    /// Storage refuses an object that already exists; that is success, not error.
    case alreadyExists
    /// Anything else is worth another attempt.
    case failed(String)
}

/// The Storage calls, as the Supabase client makes them. `userId` is nil
/// when signed out, which holds the queue rather than dropping it.
public protocol MediaTransport: AnyObject {
    func currentUserId() async -> String?
    func upload(path: String, blob: MediaBlob) async -> MediaUploadOutcome
    func download(path: String) async -> MediaBlob?
    /// Names directly under `prefix`, or nil when the listing was refused.
    func list(prefix: String, limit: Int) async -> [String]?
}

/// The local blob store: `<store>/media/<key>` plus a sidecar type file.
/// Keys are opaque (`media:…`, `excalidraw:<widget>:<file>`), so each is
/// stored under a file-safe name derived from it.
public final class LocalMediaStore {
    public let directory: URL

    public init(directory: URL) {
        self.directory = directory
    }

    /// `<LocalBoardStore.directory>/media`.
    public convenience init(storeDirectory: URL) {
        self.init(directory: storeDirectory.appendingPathComponent("media", isDirectory: true))
    }

    static func fileName(_ key: String) -> String {
        let safe = key.unicodeScalars.allSatisfy { ("a"..."z").contains($0) || ("A"..."Z").contains($0) || ("0"..."9").contains($0) || $0 == "-" || $0 == "_" || $0 == "." }
        return safe && !key.isEmpty && !key.hasPrefix(".") ? key : "h-" + SHA256.hex(key)
    }

    public func blobURL(_ key: String) -> URL { directory.appendingPathComponent(Self.fileName(key)) }
    public func typeURL(_ key: String) -> URL { directory.appendingPathComponent(Self.fileName(key) + ".type") }

    public func contains(_ key: String) -> Bool {
        FileManager.default.fileExists(atPath: blobURL(key).path)
    }

    public func read(_ key: String) -> MediaBlob? {
        guard let data = try? Data(contentsOf: blobURL(key)) else { return nil }
        let type = (try? String(contentsOf: typeURL(key), encoding: .utf8)) ?? "application/octet-stream"
        return MediaBlob(bytes: [UInt8](data), type: type)
    }

    public func write(_ key: String, _ blob: MediaBlob) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data(blob.bytes).write(to: blobURL(key), options: .atomic)
        try Data(blob.type.utf8).write(to: typeURL(key), options: .atomic)
    }

    public func remove(_ key: String) {
        try? FileManager.default.removeItem(at: blobURL(key))
        try? FileManager.default.removeItem(at: typeURL(key))
    }

    /// Every key on disk that was stored under its own name (hashed keys are
    /// listed by their hash name and cannot be mapped back).
    public func storedFileNames() -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []).filter { !$0.hasSuffix(".type") }.sorted()
    }
}

public extension LocalBoardStore {
    /// The board's media directory, beside `index.json`.
    var mediaStore: LocalMediaStore { LocalMediaStore(storeDirectory: directory) }
}

/// `createMediaSyncService(env)`.
public final class MediaSyncService {
    public let local: LocalMediaStore
    public let transport: MediaTransport
    public let timers: TimerSource
    /// The live board's widgets, as serialized records — the same enumeration
    /// the `.grovepad` packager uses, so all three blob families resolve alike.
    public let listWidgets: () -> [JSONObject]

    private struct QueueItem { var attempts: Int }
    private var queue: [String: QueueItem] = [:]
    private var order: [String] = []
    private var timer: Int?
    private var draining: Task<Void, Never>?
    private var disposed = false

    public init(local: LocalMediaStore, transport: MediaTransport, timers: TimerSource, listWidgets: @escaping () -> [JSONObject]) {
        self.local = local
        self.transport = transport
        self.timers = timers
        self.listWidgets = listWidgets
    }

    /// Keys waiting to go up, in arrival order.
    public var pendingKeys: [String] { order }

    /// Which canvas a key belongs to, asked of the live board.
    func canvasId(forKey key: String) -> String? {
        for widget in listWidgets() where GrovepadPackage.mediaBlobKeys(for: widget).contains(key) {
            return widget.string("canvasId")
        }
        return nil
    }

    private func enqueue(_ key: String) {
        if queue[key] == nil { order.append(key) }
        queue[key] = QueueItem(attempts: 0)
    }

    private func dequeue(_ key: String) {
        queue.removeValue(forKey: key)
        order.removeAll { $0 == key }
    }

    private func schedule(delayMs: Double) {
        guard !disposed, timer == nil else { return }
        timer = timers.schedule(afterMs: delayMs) { [weak self] in
            guard let self else { return }
            self.timer = nil
            self.startDrain()
        }
    }

    private func startDrain() {
        draining = Task { [weak self] in
            await self?.drainOnce()
            self?.draining = nil
        }
    }

    private func upload(userId: String, canvasId: String, key: String) async -> Bool {
        // Nothing local to send is not a failure: the blob may have gone with
        // its widget between the enqueue and the drain.
        guard let blob = local.read(key) else { return true }
        if blob.bytes.count > MediaSyncPolicy.uploadLimitBytes { return true }
        switch await transport.upload(path: MediaSyncPolicy.objectPath(canvasId: canvasId, userId: userId, key: key), blob: blob) {
        case .uploaded, .alreadyExists: return true
        case .failed: return false
        }
    }

    private func drainOnce() async {
        guard !disposed, !queue.isEmpty else { return }
        // Signed out or cloud unavailable: hold the queue rather than drop it,
        // so signing in later still carries what this session put in.
        guard let userId = await transport.currentUserId() else { return }
        for key in order {
            if disposed { return }
            let done: Bool
            if let canvasId = canvasId(forKey: key) {
                done = await upload(userId: userId, canvasId: canvasId, key: key)
            } else {
                done = false
            }
            if done {
                dequeue(key)
                continue
            }
            queue[key]?.attempts += 1
            if (queue[key]?.attempts ?? 0) >= MediaSyncPolicy.maxAttempts { dequeue(key) }
        }
        if !queue.isEmpty { schedule(delayMs: MediaSyncPolicy.retryBaseMs * Double(1 + queue.count)) }
    }

    // MARK: - API

    /// Write a blob to this device, then carry a copy to the cloud. The local
    /// write is the one that must not fail; its error belongs to the caller.
    /// The upload is a consequence, never a gate.
    public func store(_ key: String, _ blob: MediaBlob) throws {
        try local.write(key, blob)
        guard !disposed, blob.bytes.count <= MediaSyncPolicy.uploadLimitBytes else { return }
        enqueue(key)
        schedule(delayMs: MediaSyncPolicy.drainDelayMs)
    }

    /// This device's blob, or the cloud's copy cached locally, or nil.
    public func load(_ key: String) async -> MediaBlob? {
        if let blob = local.read(key) { return blob }
        guard let canvasId = canvasId(forKey: key), let userId = await transport.currentUserId() else { return nil }
        if let own = await transport.download(path: MediaSyncPolicy.objectPath(canvasId: canvasId, userId: userId, key: key)) {
            try? local.write(key, own)
            return own
        }
        // Not ours. On a shared canvas the bytes sit under whichever
        // collaborator uploaded them; the uploader folders are listed and
        // tried. Storage denies the listing outright on a canvas we are not a
        // member of, which keeps this from being a way to go fishing.
        for folder in await transport.list(prefix: canvasId, limit: 100) ?? [] {
            if disposed { return nil }
            guard folder != userId, MediaSyncPolicy.isUUIDSegment(folder) else { continue }
            if let blob = await transport.download(path: MediaSyncPolicy.objectPath(canvasId: canvasId, userId: folder, key: key)) {
                try? local.write(key, blob)
                return blob
            }
        }
        // A miss means the device holding this picture has not uploaded it
        // yet. The card keeps its placeholder and a later read tries again.
        return nil
    }

    /// Upload every locally-held blob the cloud is missing (media that
    /// predates the service, or a widget that moved canvases).
    public func reconcile() async {
        guard !disposed, let userId = await transport.currentUserId() else { return }
        var byCanvas = OrderedMap<[String]>()
        for widget in listWidgets() {
            let keys = GrovepadPackage.mediaBlobKeys(for: widget)
            guard !keys.isEmpty, let canvasId = widget.string("canvasId") else { continue }
            byCanvas[canvasId] = (byCanvas[canvasId] ?? []) + keys
        }
        for (canvasId, keys) in byCanvas.entries {
            if disposed { return }
            // Only our own folder is swept; another collaborator's uploads are
            // theirs to reconcile, and the policy would refuse the write anyway.
            guard let remote = await transport.list(prefix: "\(canvasId)/\(userId)", limit: 1000) else { continue }
            let present = Set(remote)
            for key in keys where !present.contains(key) {
                guard let blob = local.read(key), blob.bytes.count <= MediaSyncPolicy.uploadLimitBytes else { continue }
                enqueue(key)
            }
        }
        if !queue.isEmpty { schedule(delayMs: MediaSyncPolicy.drainDelayMs) }
    }

    /// Settle the queue now — tests await this instead of watching timers.
    /// A pending timer is pre-empted; a held queue (signed out earlier) is
    /// tried again.
    public func drain() async {
        if let timer {
            timers.cancel(timer)
            self.timer = nil
            startDrain()
        } else if draining == nil, !queue.isEmpty {
            startDrain()
        }
        await draining?.value
    }

    /// Reopen a disposed instance (the runtime boundary restarts).
    public func start() {
        disposed = false
    }

    public func dispose() {
        disposed = true
        if let timer { timers.cancel(timer) }
        timer = nil
        queue.removeAll()
        order.removeAll()
    }
}
