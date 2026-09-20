import Foundation

// ---------------------------------------------------------------------------
// The seam between the pure sync logic and the network.
//
// `CloudTransport` is the row-level contract the Supabase client fulfils
// (GrovepadCloud): the four tables the web uses — `board_indexes`,
// `canvas_docs`, the retained legacy `boards` row and, server-side only,
// `board_revisions` — read and written exactly as `cloudSync.ts` does. It
// knows nothing about checksum diffs, legacy precedence or merges; those are
// `CloudBoardClient` and `CloudSyncEngine`, which take any transport, so every
// scenario is reproducible with a fake and no network.
// ---------------------------------------------------------------------------

/// `board_indexes` row: `checksum` and `updated_at` are always read; `doc`
/// only for a full fetch.
public struct CloudIndexRow: Equatable {
    public var document: JSONValue?
    public var checksum: String?
    public var updatedAt: String?

    public init(document: JSONValue? = nil, checksum: String?, updatedAt: String?) {
        self.document = document
        self.checksum = checksum
        self.updatedAt = updatedAt
    }
}

/// `canvas_docs` row: `canvas_id` and `checksum` for the cheap check;
/// `body` and `meta` for a full fetch.
public struct CloudCanvasRow: Equatable {
    public var canvasId: String?
    public var checksum: String?
    public var body: String?
    public var meta: JSONValue?
    public var updatedAt: String?

    public init(canvasId: String?, checksum: String?, body: String? = nil, meta: JSONValue? = nil, updatedAt: String? = nil) {
        self.canvasId = canvasId
        self.checksum = checksum
        self.body = body
        self.meta = meta
        self.updatedAt = updatedAt
    }
}

/// The retained monolithic `boards` row.
public struct CloudLegacyRow: Equatable {
    public var data: JSONValue?
    public var updatedAt: String?

    public init(data: JSONValue? = nil, updatedAt: String?) {
        self.data = data
        self.updatedAt = updatedAt
    }
}

/// One `canvas_docs` upsert, exactly the columns `pushCloudBoard` writes.
public struct CloudCanvasUpsert: Equatable {
    public var canvasId: String
    public var body: String
    public var checksum: String
    public var meta: JSONObject

    public init(canvasId: String, body: String, checksum: String, meta: JSONObject) {
        self.canvasId = canvasId
        self.body = body
        self.checksum = checksum
        self.meta = meta
    }
}

/// The `board_indexes` upsert — the final, server-stamped commit marker.
public struct CloudIndexUpsert: Equatable {
    public var document: JSONObject
    public var checksum: String
    public var meta: JSONObject

    public init(document: JSONObject, checksum: String, meta: JSONObject) {
        self.document = document
        self.checksum = checksum
        self.meta = meta
    }
}

/// What a transport throws. The engine reacts to the case, never the text.
public enum CloudTransportError: Error, Equatable {
    /// PostgREST/Postgres codes for a migration not yet applied or a stale
    /// schema cache (`isMissingCloudDocumentSchema`).
    case schemaMissing
    /// No network: the engine queues and retries, local work never blocks.
    case offline
    /// The server refused (RLS, entitlement, quota); the message is for the UI.
    case refused(String)
    case other(String)

    /// `isMissingCloudDocumentSchema(error)` over the code string.
    public static func isMissingSchemaCode(_ code: String?) -> Bool {
        code == "42P01" || code == "PGRST204" || code == "PGRST205"
    }
}

public protocol CloudTransport: AnyObject {
    /// `board_indexes` for this user, or nil when there is no row.
    func fetchIndexRow(userId: String, includeDocument: Bool) async throws -> CloudIndexRow?
    /// Every `canvas_docs` row for this user.
    func fetchCanvasRows(userId: String, includeBodies: Bool) async throws -> [CloudCanvasRow]
    /// The legacy `boards` row, or nil. A deployment without the retained
    /// table throws `.schemaMissing`, which readers treat as "no row".
    func fetchLegacyRow(userId: String, includeDocument: Bool) async throws -> CloudLegacyRow?
    func upsertCanvases(userId: String, rows: [CloudCanvasUpsert]) async throws
    func deleteCanvases(userId: String, canvasIds: [String]) async throws
    func upsertIndex(userId: String, row: CloudIndexUpsert) async throws
    /// Written only when the documents schema is missing.
    func upsertLegacy(userId: String, board: JSONObject) async throws
}
