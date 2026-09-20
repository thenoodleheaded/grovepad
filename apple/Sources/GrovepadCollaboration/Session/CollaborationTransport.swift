import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The transport seams the session drives. `SupabaseCollaborationRepository`
// in GrovepadCloud implements them over supabase-swift (Postgres tables and
// RPCs from `src/collaboration/supabaseCollaboration.ts`, private Realtime
// channels `canvas:<id>` and `awareness:<id>`); tests use in-memory fakes.
// ---------------------------------------------------------------------------

/// `SupabaseCollaborationRepository`'s durable half.
public protocol CollaborationRepository: AnyObject {
    func ensureCanvas(_ canvasId: String, name: String) async throws -> CollaborationRole
    func bootstrap(_ canvasId: String, name: String) async throws -> CollaborationBootstrap
    func canvasMetadata(_ canvasId: String) async throws -> CollaborationCanvasMetadata
    func setPublicAccess(_ canvasId: String, isPublic: Bool) async throws
    /// Owner only. Cascades to members, CRDT document/updates and comments.
    func deleteCanvasCollaboration(_ canvasId: String) async throws
    func fetchUpdates(_ canvasId: String, after sequence: Int) async throws -> [CollaborationBootstrap.Update]
    func persistUpdates(_ canvasId: String, updates: [(id: String, payload: Data)]) async throws
    func compact(_ canvasId: String, snapshot: Data, lastSequence: Int) async throws
    func setMemberRole(_ canvasId: String, email: String, role: CollaborationRole) async throws
    func listComments(_ canvasId: String) async throws -> [CollaborationComment]
    func addComment(_ canvasId: String, body: String, parentId: String?, widgetId: String?) async throws

    /// `canvas:<id>`: CRDT updates (Owners and Editors may publish).
    @MainActor func documentChannel(_ canvasId: String) -> CollaborationChannel
    /// `awareness:<id>`: presence plus throttled awareness broadcasts.
    @MainActor func awarenessChannel(_ canvasId: String, presenceKey: String) -> CollaborationChannel
}

/// A subscription's lifecycle, as the web's `channel.subscribe` callback
/// reports it.
public enum CollaborationChannelStatus: Equatable {
    case subscribed
    case channelError(String?)
    case timedOut
    case closed
}

/// One tracked presence entry (`presenceState()` flattened): the payload the
/// participant passed to `track`.
public struct CollaborationPresenceEntry: Equatable {
    public var key: String
    public var payload: JSONObject

    public init(key: String, payload: JSONObject) {
        self.key = key
        self.payload = payload
    }
}

/// A private Realtime channel. Handlers are registered before `subscribe`
/// and are called on the main thread.
@MainActor
public protocol CollaborationChannel: AnyObject {
    /// Broadcasts for `event`; the handler receives the message `payload`.
    func onBroadcast(event: String, _ handler: @escaping (JSONObject) -> Void)
    /// The full presence state after every join/leave (`presence` `sync`).
    func onPresenceSync(_ handler: @escaping ([CollaborationPresenceEntry]) -> Void)
    func subscribe(_ onStatus: @escaping (CollaborationChannelStatus) -> Void)
    func send(event: String, payload: JSONObject) async throws
    func track(_ payload: JSONObject) async throws
    /// Untrack presence, leave and release the channel (`untrack` +
    /// `client.removeChannel`). Returns at once; a channel opened afterwards
    /// on the same topic waits until this one is gone.
    func close()
}

/// Who is collaborating: a signed-in account's id and how others see them
/// (`accountDisplayName`, `accountProfileColor`).
public struct CollaborationIdentity: Equatable, Sendable {
    public var userId: String
    public var name: String
    public var color: String

    public init(userId: String, name: String, color: String) {
        self.userId = userId
        self.name = name
        self.color = color
    }
}

/// What the session needs from the app: the board, a way to replace one
/// canvas without an undo step, selection, camera and pointer.
@MainActor
public protocol CollaborationHost: AnyObject {
    var board: Board { get }
    var activeCanvasId: String { get }
    var selectedWidgetIds: [String] { get }
    var camera: CollaborationCamera? { get }
    var isOnline: Bool { get }

    /// Replace the board with a merged remote result. Not undoable, never
    /// re-sent (the session marks it as its own write).
    func applyCollaborativeBoard(_ board: Board)
    /// Follow mode moves the local camera.
    func setCamera(_ camera: CollaborationCamera)
    /// Read-only roles: board mutations become inert while this is set.
    func setEditingLocked(_ locked: Bool)
    /// Route Undo/Redo to collaborative history while a session runs
    /// (`nil` hands them back to the local history, which is cleared).
    func setHistory(_ history: CollaborativeHistory?)

    /// Board data changed (any edit, load, undo or wire write).
    func observeBoard(_ listener: @escaping () -> Void) -> () -> Void
    func observeSelection(_ listener: @escaping () -> Void) -> () -> Void
    func observeCamera(_ listener: @escaping () -> Void) -> () -> Void
    /// Pointer over the canvas in world coordinates; `nil` when it leaves.
    func observePointer(_ listener: @escaping (Vector2D?) -> Void) -> () -> Void
}

/// Collaborative undo (`Y.UndoManager`): only this person's own changes.
@MainActor
public protocol CollaborativeHistory: AnyObject {
    var canUndo: Bool { get }
    var canRedo: Bool { get }
    func undo()
    func redo()
}
