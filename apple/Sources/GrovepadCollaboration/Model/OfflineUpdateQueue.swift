import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port of `src/collaboration/offlineUpdateQueue.ts`. The web keeps these in
// the `grovepad-collaboration` IndexedDB database; here they are files:
//
//   <root>/<sha256(canvasId)>/pending/<createdAtMs>-<updateId>.bin
//   <root>/<sha256(canvasId)>/document.bin    (Y.encodeStateAsUpdate)
//   <root>/<sha256(canvasId)>/document.json   ({ canvasId, lastSequence, role, updatedAt })
//
// Every local update is written here before it is acknowledged by the
// server, so a crash, quit or outage never loses an edit. A queue longer
// than 100 is folded into one equivalent update (`Y.mergeUpdates`).
// ---------------------------------------------------------------------------

public struct PendingCollaborationUpdate: Equatable {
    public var id: String
    public var canvasId: String
    public var payload: Data
    public var createdAt: Double
}

public struct CachedCollaborationDocument: Equatable {
    public var canvasId: String
    public var snapshot: Data
    public var lastSequence: Int
    public var role: CollaborationRole
    public var updatedAt: Double

    public init(canvasId: String, snapshot: Data, lastSequence: Int, role: CollaborationRole, updatedAt: Double) {
        self.canvasId = canvasId
        self.snapshot = snapshot
        self.lastSequence = lastSequence
        self.role = role
        self.updatedAt = updatedAt
    }
}

public final class OfflineUpdateQueue {
    public static let mergeThreshold = 100

    private let root: URL
    private let fileManager: FileManager
    private let clock: Clock
    private let newId: () -> String

    public init(root: URL, fileManager: FileManager = .default, clock: Clock = .system, newId: @escaping () -> String = { UUID().uuidString.lowercased() }) {
        self.root = root
        self.fileManager = fileManager
        self.clock = clock
        self.newId = newId
    }

    private func folder(_ canvasId: String) -> URL {
        root.appendingPathComponent(SHA256.hex(canvasId), isDirectory: true)
    }

    private func pendingFolder(_ canvasId: String) -> URL {
        folder(canvasId).appendingPathComponent("pending", isDirectory: true)
    }

    /// `listPendingUpdates`, oldest first.
    public func list(_ canvasId: String) -> [PendingCollaborationUpdate] {
        let directory = pendingFolder(canvasId)
        guard let names = try? fileManager.contentsOfDirectory(atPath: directory.path) else { return [] }
        var entries: [PendingCollaborationUpdate] = []
        for name in names where name.hasSuffix(".bin") {
            let stem = String(name.dropLast(4))
            guard let dash = stem.firstIndex(of: "-"), let createdAt = Double(stem[..<dash]),
                  let payload = try? Data(contentsOf: directory.appendingPathComponent(name)) else { continue }
            entries.append(PendingCollaborationUpdate(id: String(stem[stem.index(after: dash)...]), canvasId: canvasId, payload: payload, createdAt: createdAt))
        }
        return entries.sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
    }

    public func count(_ canvasId: String) -> Int {
        ((try? fileManager.contentsOfDirectory(atPath: pendingFolder(canvasId).path)) ?? []).filter { $0.hasSuffix(".bin") }.count
    }

    private func write(_ update: PendingCollaborationUpdate) throws {
        let directory = pendingFolder(update.canvasId)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let name = "\(JSNumberFormatter.string(update.createdAt))-\(update.id).bin"
        try update.payload.write(to: directory.appendingPathComponent(name), options: .atomic)
    }

    /// `enqueuePendingUpdate`: store, then fold a long queue into one update.
    @discardableResult
    public func enqueue(_ canvasId: String, payload: Data, id: String? = nil) throws -> PendingCollaborationUpdate {
        let pending = PendingCollaborationUpdate(id: id ?? newId(), canvasId: canvasId, payload: payload, createdAt: clock.nowMs())
        try write(pending)
        guard count(canvasId) > Self.mergeThreshold else { return pending }
        let all = list(canvasId)
        let merged = PendingCollaborationUpdate(
            id: newId(), canvasId: canvasId,
            payload: try mergeUpdates(updates: all.map(\.payload)),
            createdAt: all[0].createdAt
        )
        // Write the merged record first: a crash in between leaves both, and
        // replaying both is harmless because updates are idempotent.
        try write(merged)
        remove(all.map(\.id), canvasId: canvasId)
        return merged
    }

    /// `removePendingUpdates` (after the server acknowledged them).
    public func remove(_ ids: [String], canvasId: String) {
        guard !ids.isEmpty else { return }
        let wanted = Set(ids)
        let directory = pendingFolder(canvasId)
        for name in (try? fileManager.contentsOfDirectory(atPath: directory.path)) ?? [] where name.hasSuffix(".bin") {
            let stem = name.dropLast(4)
            guard let dash = stem.firstIndex(of: "-"), wanted.contains(String(stem[stem.index(after: dash)...])) else { continue }
            try? fileManager.removeItem(at: directory.appendingPathComponent(name))
        }
    }

    /// `readCachedCollaborationDocument`.
    public func readDocument(_ canvasId: String) -> CachedCollaborationDocument? {
        let base = folder(canvasId)
        guard let snapshot = try? Data(contentsOf: base.appendingPathComponent("document.bin")),
              let text = try? Data(contentsOf: base.appendingPathComponent("document.json")),
              let meta = (try? JSONParser.parse(text))?.objectValue,
              meta.string("canvasId") == canvasId,
              let role = meta.string("role").flatMap(CollaborationRole.init(rawValue:)) else { return nil }
        return CachedCollaborationDocument(
            canvasId: canvasId, snapshot: snapshot,
            lastSequence: Int(meta.number("lastSequence") ?? 0), role: role,
            updatedAt: meta.number("updatedAt") ?? 0
        )
    }

    /// `writeCachedCollaborationDocument`.
    public func writeDocument(_ document: CachedCollaborationDocument) throws {
        let base = folder(document.canvasId)
        try fileManager.createDirectory(at: base, withIntermediateDirectories: true)
        try document.snapshot.write(to: base.appendingPathComponent("document.bin"), options: .atomic)
        var meta = JSONObject()
        meta["canvasId"] = .string(document.canvasId)
        meta["lastSequence"] = .number(Double(document.lastSequence))
        meta["role"] = .string(document.role.rawValue)
        meta["updatedAt"] = .number(document.updatedAt)
        try Data(JSONWriter.stringify(.object(meta)).utf8).write(to: base.appendingPathComponent("document.json"), options: .atomic)
    }
}
