import Foundation
import GrovepadCollaboration
import GrovepadCore
import Supabase

// ---------------------------------------------------------------------------
// Port of `src/collaboration/supabaseCollaboration.ts`: the collaboration
// tables and RPCs, plus the two private Realtime channels, over
// supabase-swift. Same table/column names, same RPC parameters, same bytea
// hex encoding and base64 broadcast payloads as the browser, so web and
// native clients share one canvas.
//
// RLS is the authority (roles, public links, append-only log); see the
// migrations named in docs/realtime-collaboration.md.
// ---------------------------------------------------------------------------

public final class SupabaseCollaborationRepository: CollaborationRepository {
    public let client: SupabaseClient

    public init(client: SupabaseClient) {
        self.client = client
    }

    /// The web's `getSupabaseClient` + `realtime.setAuth(access_token)`: a
    /// repository whose private channels carry the current session.
    public static func authorised(client: SupabaseClient) async throws -> SupabaseCollaborationRepository {
        let session = try await client.auth.session
        await client.realtimeV2.setAuth(session.accessToken)
        return SupabaseCollaborationRepository(client: client)
    }

    private func run<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let error as CollaborationError {
            throw error
        } catch {
            throw CollaborationError(Self.message(error))
        }
    }

    static func message(_ error: Error) -> String {
        if let postgrest = error as? PostgrestError { return postgrest.message }
        return error.localizedDescription
    }

    private static func role(_ value: JSONValue?) -> CollaborationRole? {
        value?.stringValue.flatMap(CollaborationRole.init(rawValue:))
    }

    // MARK: - Membership

    public func ensureCanvas(_ canvasId: String, name: String) async throws -> CollaborationRole {
        try await run {
            let response = try await client.rpc("ensure_canvas_collaboration", params: [
                "p_canvas_id": AnyJSON.string(canvasId), "p_name": AnyJSON.string(name),
            ]).execute()
            let value = try PostgrestRows.parse(response.data)
            if let role = Self.role(value) { return role }
            if let role = Self.role(value?.arrayValue?.first?.objectValue?["role"]) { return role }
            let member = try await client.from("canvas_members").select("role").eq("canvas_id", value: canvasId).single().execute()
            guard let role = Self.role(try PostgrestRows.parse(member.data)?.objectValue?["role"]) else {
                throw CollaborationError("Could not resolve your role on this canvas")
            }
            return role
        }
    }

    public func bootstrap(_ canvasId: String, name: String) async throws -> CollaborationBootstrap {
        let role = try await ensureCanvas(canvasId, name: name)
        return try await run {
            let access = try await client.from("canvas_collaborations").select("is_public").eq("canvas_id", value: canvasId).single().execute()
            let isPublic = try PostgrestRows.parse(access.data)?.objectValue?.bool("is_public") ?? false
            let document = try await client.from("canvas_crdt_documents").select("snapshot,last_seq")
                .eq("canvas_id", value: canvasId).maybeSingle().execute()
            let row = try PostgrestRows.parse(document.data)?.objectValue
            let snapshot = try row?.string("snapshot").map(CollaborationBinary.bytes(bytea:))
            let lastSequence = Int(row?.number("last_seq") ?? 0)
            let updates = try await fetchUpdates(canvasId, after: lastSequence)
            return CollaborationBootstrap(role: role, publicAccess: isPublic, snapshot: snapshot, lastSequence: lastSequence, updates: updates)
        }
    }

    public func canvasMetadata(_ canvasId: String) async throws -> CollaborationCanvasMetadata {
        try await run {
            let response = try await client.from("canvas_collaborations").select("canvas_id,name,owner_id,is_public")
                .eq("canvas_id", value: canvasId).single().execute()
            guard let row = try PostgrestRows.parse(response.data)?.objectValue, let id = row.string("canvas_id") else {
                throw CollaborationError("That shared canvas could not be found, or you have not been invited.")
            }
            return CollaborationCanvasMetadata(
                canvasId: id, name: row.string("name") ?? "Shared canvas",
                ownerId: row.string("owner_id") ?? "", publicAccess: row.bool("is_public") ?? false
            )
        }
    }

    public func setPublicAccess(_ canvasId: String, isPublic: Bool) async throws {
        try await run {
            _ = try await client.rpc("set_canvas_public_access", params: [
                "p_canvas_id": AnyJSON.string(canvasId), "p_is_public": AnyJSON.bool(isPublic),
            ]).execute()
        }
    }

    public func deleteCanvasCollaboration(_ canvasId: String) async throws {
        try await run {
            _ = try await client.rpc("delete_canvas_collaboration", params: ["p_canvas_id": AnyJSON.string(canvasId)]).execute()
        }
    }

    public func setMemberRole(_ canvasId: String, email: String, role: CollaborationRole) async throws {
        try await run {
            _ = try await client.rpc("set_canvas_member_role", params: [
                "p_canvas_id": AnyJSON.string(canvasId),
                "p_email": AnyJSON.string(email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()),
                "p_role": AnyJSON.string(role.rawValue),
            ]).execute()
        }
    }

    // MARK: - CRDT log

    public func fetchUpdates(_ canvasId: String, after sequence: Int) async throws -> [CollaborationBootstrap.Update] {
        try await run {
            let response = try await client.from("canvas_crdt_updates").select("update_id,seq,payload")
                .eq("canvas_id", value: canvasId).gt("seq", value: sequence)
                .order("seq", ascending: true).limit(10_000).execute()
            return try PostgrestRows.rows(response.data).map { row in
                CollaborationBootstrap.Update(
                    id: row.string("update_id") ?? "",
                    sequence: Int(row.number("seq") ?? Double(row.string("seq") ?? "") ?? 0),
                    payload: try CollaborationBinary.bytes(bytea: row.string("payload") ?? "")
                )
            }
        }
    }

    public func persistUpdates(_ canvasId: String, updates: [(id: String, payload: Data)]) async throws {
        guard !updates.isEmpty else { return }
        try await run {
            let rows: [[String: AnyJSON]] = updates.map { update in
                [
                    "canvas_id": .string(canvasId),
                    "update_id": .string(update.id),
                    "payload": .string(CollaborationBinary.bytea(update.payload)),
                ]
            }
            _ = try await client.from("canvas_crdt_updates")
                .upsert(rows, onConflict: "canvas_id,update_id", returning: .minimal, ignoreDuplicates: true).execute()
        }
    }

    public func compact(_ canvasId: String, snapshot: Data, lastSequence: Int) async throws {
        try await run {
            _ = try await client.rpc("compact_canvas_crdt", params: [
                "p_canvas_id": AnyJSON.string(canvasId),
                "p_snapshot": AnyJSON.string(CollaborationBinary.bytea(snapshot)),
                "p_last_seq": AnyJSON.integer(lastSequence),
            ]).execute()
        }
    }

    // MARK: - Comments

    public func listComments(_ canvasId: String) async throws -> [CollaborationComment] {
        try await run {
            let response = try await client.from("canvas_comments").select("id,canvas_id,author_id,parent_id,widget_id,body,created_at")
                .eq("canvas_id", value: canvasId).order("created_at", ascending: true).execute()
            return try PostgrestRows.rows(response.data).compactMap { row in
                guard let id = row.string("id") else { return nil }
                return CollaborationComment(
                    id: id, canvasId: row.string("canvas_id") ?? canvasId, authorId: row.string("author_id") ?? "",
                    parentId: row.string("parent_id"), widgetId: row.string("widget_id"),
                    body: row.string("body") ?? "", createdAt: row.string("created_at") ?? ""
                )
            }
        }
    }

    public func addComment(_ canvasId: String, body: String, parentId: String?, widgetId: String?) async throws {
        try await run {
            let row: [String: AnyJSON] = [
                "canvas_id": .string(canvasId),
                "body": .string(body.trimmingCharacters(in: .whitespacesAndNewlines)),
                "parent_id": parentId.map(AnyJSON.string) ?? .null,
                "widget_id": widgetId.map(AnyJSON.string) ?? .null,
            ]
            _ = try await client.from("canvas_comments").insert(row, returning: .minimal).execute()
        }
    }

    // MARK: - Channels

    @MainActor public func documentChannel(_ canvasId: String) -> CollaborationChannel {
        SupabaseCollaborationChannel(client: client, topic: "canvas:\(canvasId)") { config in
            config.isPrivate = true
            config.broadcast.acknowledgeBroadcasts = true
            config.broadcast.receiveOwnBroadcasts = false
        }
    }

    @MainActor public func awarenessChannel(_ canvasId: String, presenceKey: String) -> CollaborationChannel {
        SupabaseCollaborationChannel(client: client, topic: "awareness:\(canvasId)") { config in
            config.isPrivate = true
            config.broadcast.acknowledgeBroadcasts = true
            config.broadcast.receiveOwnBroadcasts = false
            config.presence.key = presenceKey
        }
    }
}

/// Channel teardown still in flight, per topic. The SDK hands back an
/// existing channel for a topic it still holds, so a session that restarts
/// (navigate away and back, retry, a role change) must not open its channel
/// until the previous one has left.
@MainActor
enum ChannelTeardown {
    private static var pending: [String: Task<Void, Never>] = [:]

    static func register(_ topic: String, _ task: Task<Void, Never>) { pending[topic] = task }

    static func wait(for topic: String) async {
        while let task = pending[topic] {
            await task.value
            if pending[topic] == task { pending[topic] = nil }
        }
    }
}

/// A `RealtimeChannelV2` behind the session's channel seam. The SDK channel
/// is created at `subscribe`, after any teardown of the same topic; SDK
/// callbacks arrive on arbitrary threads and are handed to the main queue in
/// order.
@MainActor
final class SupabaseCollaborationChannel: CollaborationChannel {
    private let client: SupabaseClient
    private let topic: String
    private let configure: @Sendable (inout RealtimeChannelConfig) -> Void
    private var channel: RealtimeChannelV2?
    private var broadcastHandlers: [(String, (GrovepadCore.JSONObject) -> Void)] = []
    private var presenceHandler: (([CollaborationPresenceEntry]) -> Void)?
    private var subscriptions: [RealtimeSubscription] = []
    private var closed = false
    /// `presenceState()`: presence key → presence ref → tracked payload.
    private let presence = PresenceTable()

    init(client: SupabaseClient, topic: String, configure: @escaping @Sendable (inout RealtimeChannelConfig) -> Void) {
        self.client = client
        self.topic = topic
        self.configure = configure
    }

    /// SDK JSON → the port's ordered JSON.
    nonisolated static func object(_ value: Supabase.JSONObject) -> GrovepadCore.JSONObject? {
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        return (try? JSONParser.parse(data))?.objectValue
    }

    /// The port's JSON → SDK JSON.
    static func sdkObject(_ object: GrovepadCore.JSONObject) -> Supabase.JSONObject {
        var result: Supabase.JSONObject = [:]
        for (key, value) in object.entries { result[key] = PostgrestRows.anyJSON(value) }
        return result
    }

    func onBroadcast(event: String, _ handler: @escaping (GrovepadCore.JSONObject) -> Void) {
        broadcastHandlers.append((event, handler))
    }

    func onPresenceSync(_ handler: @escaping ([CollaborationPresenceEntry]) -> Void) {
        presenceHandler = handler
    }

    func subscribe(_ onStatus: @escaping (CollaborationChannelStatus) -> Void) {
        Task { @MainActor in
            await ChannelTeardown.wait(for: topic)
            guard !closed else { return }
            let channel = client.channel(topic, options: configure)
            self.channel = channel
            for (event, handler) in broadcastHandlers {
                subscriptions.append(channel.onBroadcast(event: event) { message in
                    // The callback receives the whole broadcast message; the
                    // data the sender passed is under `payload`.
                    let payload = message["payload"]?.objectValue.flatMap(Self.object) ?? GrovepadCore.JSONObject()
                    DispatchQueue.main.async { handler(payload) }
                })
            }
            if let presenceHandler {
                let table = presence
                subscriptions.append(channel.onPresenceChange { action in
                    let entries = table.apply(joins: action.joins, leaves: action.leaves)
                    DispatchQueue.main.async { presenceHandler(entries) }
                })
            }
            var wasSubscribed = false
            subscriptions.append(channel.onStatusChange { status in
                DispatchQueue.main.async {
                    switch status {
                    case .subscribed:
                        wasSubscribed = true
                        onStatus(.subscribed)
                    case .unsubscribed:
                        if wasSubscribed { onStatus(.closed) }
                        wasSubscribed = false
                    default:
                        break
                    }
                }
            })
            do {
                try await channel.subscribeWithError()
            } catch {
                let message = SupabaseCollaborationRepository.message(error)
                onStatus(message.localizedCaseInsensitiveContains("timed out") ? .timedOut : .channelError(message))
            }
        }
    }

    /// supabase-swift's broadcast does not report a per-message ack the way
    /// supabase-js `send` does, so a dropped hot-path message surfaces no
    /// error here; the durable log plus the 750 ms repair poll delivers it.
    func send(event: String, payload: GrovepadCore.JSONObject) async throws {
        guard let channel, channel.status == .subscribed else { throw CollaborationError("channel not subscribed") }
        await channel.broadcast(event: event, message: Self.sdkObject(payload))
    }

    func track(_ payload: GrovepadCore.JSONObject) async throws {
        guard let channel, channel.status == .subscribed else { throw CollaborationError("channel not subscribed") }
        await channel.track(state: Self.sdkObject(payload))
    }

    func close() {
        guard !closed else { return }
        closed = true
        subscriptions.removeAll()
        guard let channel else { return }
        let client = self.client
        ChannelTeardown.register(topic, Task {
            await channel.untrack()
            await client.removeChannel(channel)
        })
    }
}

/// The joined presences of one channel, updated from join/leave diffs.
private final class PresenceTable: @unchecked Sendable {
    private var entries: [String: [String: GrovepadCore.JSONObject]] = [:]
    private let lock = NSLock()

    func apply(joins: [String: PresenceV2], leaves: [String: PresenceV2]) -> [CollaborationPresenceEntry] {
        lock.withLock {
            for (key, presence) in leaves {
                entries[key]?[presence.ref] = nil
                if entries[key]?.isEmpty == true { entries[key] = nil }
            }
            for (key, presence) in joins {
                if let state = SupabaseCollaborationChannel.object(presence.state) { entries[key, default: [:]][presence.ref] = state }
            }
            return entries.flatMap { key, refs in refs.values.map { CollaborationPresenceEntry(key: key, payload: $0) } }
        }
    }
}
