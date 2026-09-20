import Foundation

// ---------------------------------------------------------------------------
// Port of `src/utils/cloudSync.ts` over a `CloudTransport`.
//
// Clients use board_indexes + canvas_docs. The legacy boards row is no longer
// dual-written: it is written only when the documents schema is missing, and
// read as a fallback so boards last saved by older builds still load. The
// index's server timestamp is the multi-row commit marker.
//
// Storage law 11: `fetchCloudHead` answers "did anything move?" from two
// small metadata reads; a board crosses the network only when the answer is
// yes, and `pushCloudBoard` re-sends only the canvases whose checksums changed.
// ---------------------------------------------------------------------------

public struct CloudHead: Equatable {
    public var indexChecksum: String
    public var canvasChecksums: OrderedMap<String>
    public var updatedAt: String?

    public init(indexChecksum: String, canvasChecksums: OrderedMap<String>, updatedAt: String?) {
        self.indexChecksum = indexChecksum
        self.canvasChecksums = canvasChecksums
        self.updatedAt = updatedAt
    }

    public var fingerprint: CloudDocuments.BoardFingerprint {
        CloudDocuments.BoardFingerprint(indexChecksum: indexChecksum, canvasChecksums: canvasChecksums)
    }
}

/// `CloudHead | null | 'inconclusive'`.
public enum CloudHeadResult: Equatable {
    /// No cloud board at all for this account.
    case none
    /// The cheap answer cannot be trusted; do a full fetch.
    case inconclusive
    case head(CloudHead)
}

public enum CloudBoardSource: String, Equatable {
    case documents
    case legacy
}

public struct CloudBoardResult: Equatable {
    /// The serialized persisted board (already through the parser once).
    public var board: JSONObject
    public var updatedAt: String?
    public var source: CloudBoardSource

    public init(board: JSONObject, updatedAt: String?, source: CloudBoardSource) {
        self.board = board
        self.updatedAt = updatedAt
        self.source = source
    }
}

public struct CloudPushResult: Equatable {
    public enum Mode: String, Equatable { case documents, legacyFallback = "legacy-fallback" }
    public var mode: Mode
    public var changedCanvases: Int
    public var deletedCanvases: Int

    public init(mode: Mode, changedCanvases: Int, deletedCanvases: Int) {
        self.mode = mode
        self.changedCanvases = changedCanvases
        self.deletedCanvases = deletedCanvases
    }
}

/// `planCloudDocumentChanges`.
public struct CloudDocumentChangePlan: Equatable {
    public var changedCanvasIds: [String]
    public var deletedCanvasIds: [String]
    public var hasChanges: Bool

    public init(changedCanvasIds: [String], deletedCanvasIds: [String], hasChanges: Bool) {
        self.changedCanvasIds = changedCanvasIds
        self.deletedCanvasIds = deletedCanvasIds
        self.hasChanges = hasChanges
    }

    public static func plan(
        localIndexChecksum: String,
        localCanvasChecksums: OrderedMap<String>,
        remoteIndexChecksum: String?,
        remoteCanvasChecksums: OrderedMap<String>
    ) -> CloudDocumentChangePlan {
        let changed = localCanvasChecksums.entries.compactMap { canvasId, checksum in
            remoteCanvasChecksums[canvasId] == checksum ? nil : canvasId
        }
        let deleted = remoteCanvasChecksums.keys.filter { !localCanvasChecksums.contains($0) }
        return CloudDocumentChangePlan(
            changedCanvasIds: changed,
            deletedCanvasIds: deleted,
            hasChanges: remoteIndexChecksum != localIndexChecksum || !changed.isEmpty || !deleted.isEmpty
        )
    }
}

public struct CloudBoardError: Error, Equatable, CustomStringConvertible {
    public let description: String
    public init(_ description: String) { self.description = description }
}

/// The three calls the reconcile engine makes. `CloudBoardClient` is the real
/// one; tests hand the engine a fake, as `persistenceCloudReconcile.test.ts`
/// mocks `./cloudSync`.
public protocol CloudBoardService: AnyObject {
    func fetchCloudHead(userId: String) async throws -> CloudHeadResult
    func fetchCloudBoard(userId: String) async throws -> CloudBoardResult?
    @discardableResult
    func pushCloudBoard(userId: String, board: JSONObject) async throws -> CloudPushResult
}

public final class CloudBoardClient: CloudBoardService {
    public let transport: CloudTransport
    /// `Date.now()` for the legacy row's client stamp (the only client clock the web ever writes).
    public let clock: Clock

    public init(transport: CloudTransport, clock: Clock = .system) {
        self.transport = transport
        self.clock = clock
    }

    // MARK: - Helpers

    /// `timestamp(value)`: a string `Date.parse` accepts, else nil.
    static func timestamp(_ value: String?) -> String? {
        guard let value, parseTime(value) != nil else { return nil }
        return value
    }

    /// `Date.parse` for the ISO-8601 forms PostgREST emits (`timestamptz`
    /// with a zone offset, with or without fractional seconds).
    static func parseTime(_ value: String) -> Double? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date.timeIntervalSince1970 * 1000 }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: value) { return date.timeIntervalSince1970 * 1000 }
        // Postgres' own text form: `2026-08-21 00:00:00.123456+00`.
        let normalized = value.replacingOccurrences(of: " ", with: "T")
        let padded = normalized.range(of: #"[+-]\d\d$"#, options: .regularExpression) != nil ? normalized + ":00" : normalized
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: padded) { return date.timeIntervalSince1970 * 1000 }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: padded).map { $0.timeIntervalSince1970 * 1000 }
    }

    /// `isLater(left, right)`.
    static func isLater(_ left: String?, _ right: String?) -> Bool {
        guard let left, let leftMs = parseTime(left) else { return false }
        guard let right, let rightMs = parseTime(right) else { return true }
        return leftMs > rightMs
    }

    // MARK: - Reads

    private func fetchLegacyBoard(userId: String) async throws -> (board: JSONObject, updatedAt: String?)? {
        let row: CloudLegacyRow?
        do {
            row = try await transport.fetchLegacyRow(userId: userId, includeDocument: true)
        } catch CloudTransportError.schemaMissing {
            return nil
        }
        guard let row, let data = row.data else { return nil }
        if let future = BoardParser.futurePersistedBoardVersion(data) { throw FuturePersistedBoardVersionError(foundVersion: future) }
        guard let board = BoardParser.parsePersistedBoard(data) else {
            throw CloudBoardError("Cloud board has an unsupported or corrupt legacy shape")
        }
        return (BoardSerializer.serializePersistedBoard(board), Self.timestamp(row.updatedAt))
    }

    private func decodeCanvasRow(_ row: CloudCanvasRow) throws -> JSONObject {
        guard let canvasId = row.canvasId, let body = row.body, let checksum = row.checksum,
              let encoding = CloudDocumentCodec.encoding(fromMeta: row.meta) else {
            throw CloudBoardError("Invalid cloud canvas envelope")
        }
        let decoded = try CloudDocumentCodec.decode(body: body, encoding: encoding, checksum: checksum)
        guard CloudDocuments.isCloudCanvasDocument(decoded), let object = decoded.objectValue,
              object["canvasId"] == .string(canvasId) else {
            throw CloudBoardError("Cloud canvas body does not match its row")
        }
        return object
    }

    private enum DocumentFetch {
        case schemaMissing
        case none
        case found(board: JSONObject, updatedAt: String?, complete: Bool)
    }

    private func fetchDocumentBoard(userId: String) async throws -> DocumentFetch {
        let indexRow: CloudIndexRow?
        do {
            indexRow = try await transport.fetchIndexRow(userId: userId, includeDocument: true)
        } catch CloudTransportError.schemaMissing {
            return .schemaMissing
        }
        guard let indexRow else { return .none }
        guard let document = indexRow.document, let indexChecksum = indexRow.checksum,
              CloudDocuments.sha256Hex(CloudDocuments.canonicalJson(document)) == indexChecksum else {
            throw CloudBoardError("Cloud board index checksum mismatch")
        }
        if let object = document.objectValue, object["format"] == .string(CloudDocuments.indexFormat),
           let boardVersion = object.number("boardVersion"), boardVersion > Double(BoardFormat.version) {
            throw FuturePersistedBoardVersionError(foundVersion: Int(exactly: boardVersion) ?? Int.max)
        }
        guard CloudDocuments.isCloudBoardIndex(document), let index = document.objectValue else {
            throw CloudBoardError("Cloud board index has an unsupported shape")
        }

        let rows: [CloudCanvasRow]
        do {
            rows = try await transport.fetchCanvasRows(userId: userId, includeBodies: true)
        } catch CloudTransportError.schemaMissing {
            return .schemaMissing
        }
        let decoded = try rows.map(decodeCanvasRow)
        let found = Set(decoded.compactMap { $0.string("canvasId") })
        let complete = (index.object("canvases") ?? JSONObject()).keys.allSatisfy(found.contains)
        guard let board = BoardParser.parsePersistedBoard(.object(CloudDocuments.joinCloudBoard(index: index, canvases: decoded))) else {
            throw CloudBoardError("Reassembled cloud documents have a corrupt board shape")
        }
        return .found(board: BoardSerializer.serializePersistedBoard(board), updatedAt: Self.timestamp(indexRow.updatedAt), complete: complete)
    }

    /// `fetchCloudHead`: only the checksums the cloud already stores.
    public func fetchCloudHead(userId: String) async throws -> CloudHeadResult {
        async let indexTask = transport.fetchIndexRow(userId: userId, includeDocument: false)
        async let canvasTask = transport.fetchCanvasRows(userId: userId, includeBodies: false)
        async let legacyTask = transport.fetchLegacyRow(userId: userId, includeDocument: false)

        let index: CloudIndexRow?
        let canvases: [CloudCanvasRow]
        do {
            index = try await indexTask
            canvases = try await canvasTask
        } catch CloudTransportError.schemaMissing {
            _ = try? await legacyTask
            return .inconclusive
        }
        // A deployment without the retained legacy table is not an error here;
        // it only means there is no older row that could outrank the index.
        var legacy: CloudLegacyRow?
        var legacyErrored = false
        do {
            legacy = try await legacyTask
        } catch CloudTransportError.schemaMissing {
            legacyErrored = true
        }
        guard let index else {
            // No split generation. A legacy row still counts as a cloud board,
            // and only the full fetch knows how to read one.
            return legacy != nil || legacyErrored ? .inconclusive : .none
        }
        guard let indexChecksum = index.checksum else { return .inconclusive }
        let indexUpdatedAt = Self.timestamp(index.updatedAt)
        let legacyUpdatedAt = legacyErrored ? nil : Self.timestamp(legacy?.updatedAt)
        // Same precedence rule fetchCloudBoard applies: a legacy row stamped
        // after the index means a stale client wrote past our last commit.
        if Self.isLater(legacyUpdatedAt, indexUpdatedAt) { return .inconclusive }
        var canvasChecksums = OrderedMap<String>()
        for row in canvases {
            if let canvasId = row.canvasId, let checksum = row.checksum { canvasChecksums[canvasId] = checksum }
        }
        return .head(CloudHead(indexChecksum: indexChecksum, canvasChecksums: canvasChecksums, updatedAt: indexUpdatedAt))
    }

    /// `fetchCloudBoard`: authoritative split documents, falling back to the
    /// retained legacy row.
    public func fetchCloudBoard(userId: String) async throws -> CloudBoardResult? {
        let legacy = try await fetchLegacyBoard(userId: userId)
        let documents: DocumentFetch
        do {
            documents = try await fetchDocumentBoard(userId: userId)
        } catch let error as FuturePersistedBoardVersionError {
            throw error
        } catch {
            guard let legacy else { throw error }
            // The retained monolithic row is the recovery receipt for a damaged
            // or interrupted split-document generation. Reconciliation rewrites it.
            return CloudBoardResult(board: legacy.board, updatedAt: legacy.updatedAt, source: .legacy)
        }
        switch documents {
        case .schemaMissing, .none:
            return legacy.map { CloudBoardResult(board: $0.board, updatedAt: $0.updatedAt, source: .legacy) }
        case .found(let board, let updatedAt, let complete):
            if !complete {
                guard let legacy else { throw CloudBoardError("Cloud board generation is incomplete and has no recovery row") }
                return CloudBoardResult(board: legacy.board, updatedAt: legacy.updatedAt, source: .legacy)
            }
            if let legacy, Self.isLater(legacy.updatedAt, updatedAt) {
                return CloudBoardResult(board: legacy.board, updatedAt: legacy.updatedAt, source: .legacy)
            }
            return CloudBoardResult(board: board, updatedAt: updatedAt, source: .documents)
        }
    }

    // MARK: - Writes

    /// `pushCloudBoard`: checksum-diff one board into split documents. Changed
    /// canvas docs go first; the index upsert is the final server-stamped commit.
    @discardableResult
    public func pushCloudBoard(userId: String, board: JSONObject) async throws -> CloudPushResult {
        let split = CloudDocuments.splitCloudBoard(board)
        let indexChecksum = CloudDocuments.sha256Hex(CloudDocuments.canonicalJson(.object(split.index)))
        let encoded = split.canvases.entries.map { canvasId, canvas in
            (canvasId: canvasId, canvas: canvas, encoded: CloudDocumentCodec.encode(.object(canvas)))
        }

        let remoteIndex: CloudIndexRow?
        let remoteCanvases: [CloudCanvasRow]
        do {
            async let indexTask = transport.fetchIndexRow(userId: userId, includeDocument: false)
            async let canvasTask = transport.fetchCanvasRows(userId: userId, includeBodies: false)
            remoteIndex = try await indexTask
            remoteCanvases = try await canvasTask
        } catch CloudTransportError.schemaMissing {
            try await transport.upsertLegacy(userId: userId, board: board)
            return CloudPushResult(mode: .legacyFallback, changedCanvases: 0, deletedCanvases: 0)
        }

        var remoteChecksums = OrderedMap<String>()
        for row in remoteCanvases {
            if let canvasId = row.canvasId, let checksum = row.checksum { remoteChecksums[canvasId] = checksum }
        }
        var localChecksums = OrderedMap<String>()
        for item in encoded { localChecksums[item.canvasId] = item.encoded.checksum }
        let plan = CloudDocumentChangePlan.plan(
            localIndexChecksum: indexChecksum,
            localCanvasChecksums: localChecksums,
            remoteIndexChecksum: remoteIndex?.checksum,
            remoteCanvasChecksums: remoteChecksums
        )
        guard plan.hasChanges else { return CloudPushResult(mode: .documents, changedCanvases: 0, deletedCanvases: 0) }

        let changedIds = Set(plan.changedCanvasIds)
        let indexCanvases = split.index.object("canvases") ?? JSONObject()
        let changed = encoded.filter { changedIds.contains($0.canvasId) }.map { item -> CloudCanvasUpsert in
            let canvasMeta = indexCanvases.object(item.canvasId)
            var meta = JSONObject()
            meta["format"] = .string(CloudDocuments.canvasFormat)
            meta["formatVersion"] = .number(Double(CloudDocuments.canvasVersion))
            meta["encoding"] = .string(item.encoded.encoding.rawValue)
            meta["compressedBytes"] = .number(Double(item.encoded.byteLength))
            meta["uncompressedBytes"] = .number(Double(item.encoded.uncompressedBytes))
            meta["name"] = canvasMeta?["name"] ?? .string("Canvas")
            meta["workspaceId"] = canvasMeta?["workspaceId"] ?? .null
            meta["parentCanvasId"] = canvasMeta?["parentCanvasId"] ?? .null
            meta["widgetCount"] = .number(Double((item.canvas.object("widgets") ?? JSONObject()).count))
            meta["relationCount"] = .number(Double((item.canvas.object("relations") ?? JSONObject()).count))
            meta["connectionCount"] = .number(Double((item.canvas.object("connections") ?? JSONObject()).count))
            return CloudCanvasUpsert(canvasId: item.canvasId, body: item.encoded.body, checksum: item.encoded.checksum, meta: meta)
        }
        for batch in Self.batches(changed, size: 20) {
            try await transport.upsertCanvases(userId: userId, rows: batch)
        }
        for batch in Self.batches(plan.deletedCanvasIds, size: 50) {
            try await transport.deleteCanvases(userId: userId, canvasIds: batch)
        }

        var indexMeta = JSONObject()
        indexMeta["format"] = .string(CloudDocuments.indexFormat)
        indexMeta["formatVersion"] = split.index["v"] ?? .null
        indexMeta["boardVersion"] = split.index["boardVersion"] ?? .null
        indexMeta["workspaceCount"] = .number(Double((split.index.object("workspaces") ?? JSONObject()).count))
        indexMeta["canvasCount"] = .number(Double(indexCanvases.count))
        indexMeta["crossCanvasRelationCount"] = .number(Double((split.index.object("relations") ?? JSONObject()).count))
        indexMeta["crossCanvasConnectionCount"] = .number(Double((split.index.object("connections") ?? JSONObject()).count))
        try await transport.upsertIndex(userId: userId, row: CloudIndexUpsert(document: split.index, checksum: indexChecksum, meta: indexMeta))
        return CloudPushResult(mode: .documents, changedCanvases: changed.count, deletedCanvases: plan.deletedCanvasIds.count)
    }

    static func batches<T>(_ items: [T], size: Int) -> [[T]] {
        stride(from: 0, to: items.count, by: size).map { Array(items[$0..<min($0 + size, items.count)]) }
    }
}
