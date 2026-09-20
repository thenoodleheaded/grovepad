import Foundation

// ---------------------------------------------------------------------------
// The local persistence the storage contract describes, on the file system:
//
//   <directory>/index.json            the split board index (CloudBoardIndexDocument)
//   <directory>/canvases/<id>.json    one split canvas document per canvas
//   <directory>/device.json           device state (navigation), never document state
//   <directory>/snapshots/<id>.json   rolling board snapshots and migration sources
//
// It plays the part IndexedDB plays for the web (`boardDatabase.ts`,
// `persistence.ts`): every write is atomic (temp file + rename), a board
// save writes canvases first and the index last, a load tolerates an orphan
// canvas file and a listed canvas whose file is missing, unchanged canvases
// are not rewritten, and a future-version payload locks every write
// (storage law 3). Synchronous and timer-free; callers own scheduling.
// ---------------------------------------------------------------------------

public final class LocalBoardStore {
    public struct WriteReport: Equatable {
        public var wroteIndex: Bool
        public var wroteCanvases: [String]
        public var skippedCanvases: [String]
        public var removedCanvases: [String]

        public init(wroteIndex: Bool = false, wroteCanvases: [String] = [], skippedCanvases: [String] = [], removedCanvases: [String] = []) {
            self.wroteIndex = wroteIndex
            self.wroteCanvases = wroteCanvases
            self.skippedCanvases = skippedCanvases
            self.removedCanvases = removedCanvases
        }
    }

    public struct SnapshotInfo: Equatable {
        public var id: String
        public var createdAt: Double
        /// `board` or `migration-source`.
        public var kind: String
        public var label: String?
        public var fileURL: URL
    }

    public enum StoreError: Error, Equatable, CustomStringConvertible {
        /// A newer client wrote this store; nothing may be overwritten.
        case writesLocked(foundVersion: Int?)
        /// The index exists but cannot be read; treated like a failed read on the web.
        case unreadableIndex

        public var description: String {
            switch self {
            case .writesLocked(let version?): return "Board version \(version) requires a newer Grovepad; saving is disabled to protect it"
            case .writesLocked(nil): return "Saving is disabled to protect the stored board"
            case .unreadableIndex: return "The stored board index could not be read"
            }
        }
    }

    public static let snapshotLimit = 20

    public let directory: URL
    private let clock: Clock
    /// Set once a payload this build must not overwrite was seen (law 3).
    public private(set) var writesLocked = false
    public private(set) var futureVersion: Int?
    public private(set) var lastWriteReport: WriteReport?
    /// Canonical checksums of what is on disk: `index.json` plus one per canvas id.
    private var knownChecksums: [String: String] = [:]
    private static let indexChecksumKey = "index.json"

    public init(directory: URL, clock: Clock = .system) {
        self.directory = directory
        self.clock = clock
    }

    public var indexURL: URL { directory.appendingPathComponent("index.json") }
    public var canvasesDirectory: URL { directory.appendingPathComponent("canvases", isDirectory: true) }
    public var deviceURL: URL { directory.appendingPathComponent("device.json") }
    public var snapshotsDirectory: URL { directory.appendingPathComponent("snapshots", isDirectory: true) }

    public func canvasURL(_ canvasId: String) -> URL {
        canvasesDirectory.appendingPathComponent("\(canvasId).json")
    }

    // MARK: - Board

    /// The stored board, or nil when nothing valid is stored. A future-version
    /// index locks writes and throws `FuturePersistedBoardVersionError`; an
    /// unreadable index locks writes and throws `StoreError.unreadableIndex`.
    public func loadBoard() throws -> Board? {
        knownChecksums = [:]
        guard let indexBytes = readFile(indexURL) else { return nil }
        guard let index = try? JSONParser.parse(indexBytes) else {
            writesLocked = true
            throw StoreError.unreadableIndex
        }
        if let version = Self.futureBoardVersion(ofIndex: index) {
            writesLocked = true
            futureVersion = version
            throw FuturePersistedBoardVersionError(foundVersion: version)
        }
        guard CloudDocuments.isCloudBoardIndex(index), let indexObject = index.objectValue else {
            writesLocked = true
            throw StoreError.unreadableIndex
        }
        knownChecksums[Self.indexChecksumKey] = Self.checksum(indexObject)

        // A listed canvas whose file is missing or unreadable is skipped: the
        // board is rebuilt from what survives and the next save rewrites it.
        // An orphan file for a canvas the index no longer lists is ignored here
        // and removed by the next save.
        var canvases: [JSONObject] = []
        for canvasId in (indexObject.object("canvases") ?? JSONObject()).keys {
            guard let bytes = readFile(canvasURL(canvasId)), let document = try? JSONParser.parse(bytes),
                  CloudDocuments.isCloudCanvasDocument(document), let object = document.objectValue,
                  JS.key(object["canvasId"]) == canvasId else { continue }
            canvases.append(object)
            knownChecksums[canvasId] = Self.checksum(object)
        }
        return BoardParser.parsePersistedBoard(.object(CloudDocuments.joinCloudBoard(index: indexObject, canvases: canvases)))
    }

    /// Write the board: changed canvases first, then the index, then remove
    /// canvas files the index no longer lists. Unchanged documents (by
    /// canonical checksum) are left untouched.
    @discardableResult
    public func saveBoard(_ board: Board) throws -> WriteReport {
        try ensureWritable()
        let split = CloudDocuments.splitCloudBoard(BoardSerializer.serializePersistedBoard(board))
        var report = WriteReport()

        try FileManager.default.createDirectory(at: canvasesDirectory, withIntermediateDirectories: true)
        for (canvasId, document) in split.canvases.entries {
            let checksum = Self.checksum(document)
            if knownChecksums[canvasId] == checksum, fileExists(canvasURL(canvasId)) {
                report.skippedCanvases.append(canvasId)
                continue
            }
            try writeAtomically(Self.pretty(document), to: canvasURL(canvasId))
            knownChecksums[canvasId] = checksum
            report.wroteCanvases.append(canvasId)
        }

        let indexChecksum = Self.checksum(split.index)
        if knownChecksums[Self.indexChecksumKey] != indexChecksum || !fileExists(indexURL) {
            try writeAtomically(Self.pretty(split.index), to: indexURL)
            knownChecksums[Self.indexChecksumKey] = indexChecksum
            report.wroteIndex = true
        }

        // Only once the index no longer names them are stale canvas files removed.
        for canvasId in storedCanvasIds() where !split.canvases.contains(canvasId) {
            try? FileManager.default.removeItem(at: canvasURL(canvasId))
            knownChecksums.removeValue(forKey: canvasId)
            report.removedCanvases.append(canvasId)
        }
        lastWriteReport = report
        return report
    }

    /// Ids of every canvas file on disk, listed or orphan.
    public func storedCanvasIds() -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: canvasesDirectory.path)) ?? []
        return names.filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }.sorted()
    }

    // MARK: - Device state

    public func loadDeviceState(for board: Board, legacyFallback: JSONObject? = nil, mint: IdMinter = .system) -> DeviceState {
        let raw = readFile(deviceURL).flatMap { try? JSONParser.parse($0) }
        return DeviceStateCodec.resolvePersistedDeviceState(raw, board: board, legacyFallback: legacyFallback, mint: mint)
    }

    public func saveDeviceState(_ state: DeviceState) throws {
        try ensureWritable()
        try writeAtomically(JSONWriter.stringify(.object(DeviceStateCodec.serializePersistedDeviceState(state))), to: deviceURL)
    }

    // MARK: - Snapshots

    /// `saveRollingSnapshot`: a dated board snapshot, keeping the newest 20
    /// snapshot files of either kind.
    @discardableResult
    public func saveSnapshot(_ board: Board, label: String? = nil) throws -> SnapshotInfo {
        try ensureWritable()
        let createdAt = clock.nowMs()
        let id = JSNumberFormatter.string(createdAt)
        var snapshot = JSONObject()
        snapshot["id"] = .string(id)
        snapshot["createdAt"] = .number(createdAt)
        snapshot["kind"] = .string("board")
        snapshot["board"] = .object(BoardSerializer.serializePersistedBoard(board))
        if let label { snapshot["label"] = .string(label) }
        let url = try writeSnapshot(snapshot, id: id)
        pruneSnapshots()
        return SnapshotInfo(id: id, createdAt: createdAt, kind: "board", label: label, fileURL: url)
    }

    /// `writeMigratedBoardDatabase`: preserve the untouched migration source
    /// before the upgraded board is committed (storage law 4).
    @discardableResult
    public func saveMigrationSource(_ payload: JSONValue, sourceVersion: Int, board: Board) throws -> WriteReport {
        try ensureWritable()
        let id = "migration-v\(sourceVersion)-v\(BoardFormat.version)-\(Self.stablePayloadHash(payload))"
        var snapshot = JSONObject()
        snapshot["id"] = .string(id)
        snapshot["createdAt"] = .number(clock.nowMs())
        snapshot["kind"] = .string("migration-source")
        snapshot["sourceVersion"] = .number(Double(sourceVersion))
        snapshot["targetVersion"] = .number(Double(BoardFormat.version))
        snapshot["payload"] = payload
        _ = try writeSnapshot(snapshot, id: id)
        return try saveBoard(board)
    }

    /// `listRollingSnapshots`: board snapshots only, newest first.
    public func listSnapshots() -> [SnapshotInfo] {
        allSnapshots().filter { $0.kind != "migration-source" }
    }

    public func loadSnapshot(_ info: SnapshotInfo) -> Board? {
        guard let bytes = readFile(info.fileURL), let value = try? JSONParser.parse(bytes), let board = value["board"] else { return nil }
        return BoardParser.parsePersistedBoard(board)
    }

    private func writeSnapshot(_ snapshot: JSONObject, id: String) throws -> URL {
        try FileManager.default.createDirectory(at: snapshotsDirectory, withIntermediateDirectories: true)
        let url = snapshotsDirectory.appendingPathComponent("\(id).json")
        try writeAtomically(JSONWriter.stringify(.object(snapshot)), to: url)
        return url
    }

    /// Every snapshot file, newest first (`createdAt` descending).
    private func allSnapshots() -> [SnapshotInfo] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: snapshotsDirectory.path)) ?? []
        var snapshots: [SnapshotInfo] = []
        for name in names where name.hasSuffix(".json") {
            let url = snapshotsDirectory.appendingPathComponent(name)
            guard let bytes = readFile(url), let value = try? JSONParser.parse(bytes), let object = value.objectValue else { continue }
            let kind = object.string("kind") ?? "board"
            if kind != "migration-source", object["board"] == nil { continue }
            snapshots.append(SnapshotInfo(
                id: object.string("id") ?? String(name.dropLast(5)),
                createdAt: object.number("createdAt") ?? 0,
                kind: kind,
                label: object.string("label"),
                fileURL: url
            ))
        }
        return snapshots.sorted { $0.createdAt > $1.createdAt }
    }

    private func pruneSnapshots() {
        for stale in allSnapshots().dropFirst(Self.snapshotLimit) {
            try? FileManager.default.removeItem(at: stale.fileURL)
        }
    }

    /// `stablePayloadHash`: FNV-1a over the UTF-16 units of `JSON.stringify(payload)`, base 36.
    static func stablePayloadHash(_ payload: JSONValue) -> String {
        var hash: UInt32 = 0x811c_9dc5
        for unit in JSONWriter.stringify(payload).utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 0x0100_0193
        }
        return String(hash, radix: 36)
    }

    // MARK: - Helpers

    /// The board version a stored index declares when it is newer than this
    /// build: the split index carries it as `boardVersion`; a raw board
    /// document (never written here, but tolerated) as `v`.
    static func futureBoardVersion(ofIndex value: JSONValue) -> Int? {
        if let object = value.objectValue, object["format"] == .string(CloudDocuments.indexFormat),
           object["boardFormat"] == .string(BoardFormat.format),
           let version = object.number("boardVersion"), JS.isInteger(version), version > Double(BoardFormat.version) {
            return Int(exactly: version) ?? Int.max
        }
        return BoardParser.futurePersistedBoardVersion(value)
    }

    private func ensureWritable() throws {
        if writesLocked { throw StoreError.writesLocked(foundVersion: futureVersion) }
    }

    private static func checksum(_ document: JSONObject) -> String {
        SHA256.hex(CloudDocuments.canonicalJson(.object(document)))
    }

    private static func pretty(_ document: JSONObject) -> String {
        JSONWriter.stringify(.object(document), indent: 2)
    }

    private func readFile(_ url: URL) -> [UInt8]? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return [UInt8](data)
    }

    private func fileExists(_ url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }

    /// Temp file + rename in the same directory, so a reader sees either the
    /// old document or the new one, never a torn file.
    private func writeAtomically(_ text: String, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: url, options: .atomic)
    }
}
