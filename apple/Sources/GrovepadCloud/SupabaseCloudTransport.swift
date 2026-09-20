import Foundation
import GrovepadCore
import Supabase

// ---------------------------------------------------------------------------
// `CloudTransport` over supabase-swift: the four tables `cloudSync.ts` uses,
// with the same column lists, batching left to `CloudBoardClient`. Errors
// are folded into `CloudTransportError` so the engine never sees SDK types.
// ---------------------------------------------------------------------------

public final class SupabaseCloudTransport: CloudTransport {
    public let client: SupabaseClient
    private let clock: Clock

    public init(client: SupabaseClient, clock: Clock = .system) {
        self.client = client
        self.clock = clock
    }

    private func run<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch {
            throw SupabaseErrors.transportError(error)
        }
    }

    public func fetchIndexRow(userId: String, includeDocument: Bool) async throws -> CloudIndexRow? {
        try await run {
            let columns = includeDocument ? "doc, meta, checksum, updated_at" : "checksum, updated_at"
            let response = try await client.from("board_indexes").select(columns).eq("user_id", value: userId).maybeSingle().execute()
            return PostgrestRows.indexRow(try PostgrestRows.parse(response.data), includeDocument: includeDocument)
        }
    }

    public func fetchCanvasRows(userId: String, includeBodies: Bool) async throws -> [CloudCanvasRow] {
        try await run {
            let columns = includeBodies ? "canvas_id, body, meta, checksum, updated_at" : "canvas_id, checksum"
            let response = try await client.from("canvas_docs").select(columns).eq("user_id", value: userId).execute()
            return try PostgrestRows.rows(response.data).map { PostgrestRows.canvasRow($0, includeBodies: includeBodies) }
        }
    }

    public func fetchLegacyRow(userId: String, includeDocument: Bool) async throws -> CloudLegacyRow? {
        try await run {
            let columns = includeDocument ? "data, updated_at" : "updated_at"
            let response = try await client.from("boards").select(columns).eq("user_id", value: userId).maybeSingle().execute()
            return PostgrestRows.legacyRow(try PostgrestRows.parse(response.data), includeDocument: includeDocument)
        }
    }

    public func upsertCanvases(userId: String, rows: [CloudCanvasUpsert]) async throws {
        guard !rows.isEmpty else { return }
        try await run {
            let values = rows.map { PostgrestRows.canvasUpsert(userId: userId, $0) }
            _ = try await client.from("canvas_docs").upsert(values, returning: .minimal).execute()
        }
    }

    public func deleteCanvases(userId: String, canvasIds: [String]) async throws {
        guard !canvasIds.isEmpty else { return }
        try await run {
            _ = try await client.from("canvas_docs").delete(returning: .minimal)
                .eq("user_id", value: userId)
                .in("canvas_id", values: canvasIds)
                .execute()
        }
    }

    public func upsertIndex(userId: String, row: CloudIndexUpsert) async throws {
        try await run {
            _ = try await client.from("board_indexes").upsert(PostgrestRows.indexUpsert(userId: userId, row), returning: .minimal).execute()
        }
    }

    public func upsertLegacy(userId: String, board: JSONObject) async throws {
        try await run {
            let values = PostgrestRows.legacyUpsert(userId: userId, board: board, updatedAt: SubscriptionRules.isoString(ms: clock.nowMs()))
            _ = try await client.from("boards").upsert(values, returning: .minimal).execute()
        }
    }
}

/// `MediaTransport` over Supabase Storage: the private `board-media` bucket.
public final class SupabaseMediaTransport: MediaTransport {
    public let client: SupabaseClient

    public init(client: SupabaseClient) {
        self.client = client
    }

    private var bucket: StorageFileApi { client.storage.from(MediaSyncPolicy.bucket) }

    public func currentUserId() async -> String? {
        client.auth.currentSession?.user.id.uuidString.lowercased()
    }

    public func upload(path: String, blob: MediaBlob) async -> MediaUploadOutcome {
        do {
            _ = try await bucket.upload(path, data: Data(blob.bytes), options: FileOptions(contentType: blob.type.isEmpty ? "application/octet-stream" : blob.type, upsert: false))
            return .uploaded
        } catch let error as StorageError {
            return SupabaseErrors.isAlreadyUploaded(statusCode: error.statusCode, message: error.message) ? .alreadyExists : .failed(error.message)
        } catch {
            return .failed(String(describing: error))
        }
    }

    public func download(path: String) async -> MediaBlob? {
        guard let data = try? await bucket.download(path: path) else { return nil }
        // Storage answers with the object's own content type; the local
        // sidecar records what the widget declared, which the courier does
        // not get back here, so the type is recovered from the key's owner.
        return MediaBlob(bytes: [UInt8](data), type: "application/octet-stream")
    }

    public func list(prefix: String, limit: Int) async -> [String]? {
        guard let entries = try? await bucket.list(path: prefix, options: SearchOptions(limit: limit)) else { return nil }
        return entries.map(\.name)
    }
}
