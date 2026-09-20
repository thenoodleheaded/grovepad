import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port of `src/collaboration/types.ts` and the role/status half of
// `src/store/useCollaborationStore.ts`.
// ---------------------------------------------------------------------------

/// `CollaborationRole`. Raw values are the database's role strings.
public enum CollaborationRole: String, CaseIterable, Sendable {
    case owner, editor, commenter, viewer

    /// `canEditCollaborativeCanvas`.
    public var canEdit: Bool { self == .owner || self == .editor }
    /// `canCommentOnCollaborativeCanvas`.
    public var canComment: Bool { self != .viewer }
}

/// `canEditCollaborativeCanvas(role)` for a role that may not be known yet.
public func canEditCollaborativeCanvas(_ role: CollaborationRole?) -> Bool { role?.canEdit ?? false }
/// `canCommentOnCollaborativeCanvas(role)`.
public func canCommentOnCollaborativeCanvas(_ role: CollaborationRole?) -> Bool { role?.canComment ?? false }

/// `CollaborationStatus`.
public enum CollaborationStatus: String, Sendable {
    case disabled, connecting, connected, reconnecting, offline, error
}

/// A camera as awareness carries it (`{ pan, zoom }`).
public struct CollaborationCamera: Equatable, Sendable {
    public var pan: Vector2D
    public var zoom: Double

    public init(pan: Vector2D, zoom: Double) {
        self.pan = pan
        self.zoom = zoom
    }
}

/// One person on the canvas, parsed from their awareness state.
public struct CollaborationPresence: Equatable, Sendable, Identifiable {
    public var clientId: UInt64
    public var userId: String
    public var name: String
    public var color: String
    public var role: CollaborationRole
    /// World coordinates.
    public var cursor: Vector2D?
    public var selectedWidgetIds: [String]
    public var editingWidgetId: String?
    public var camera: CollaborationCamera?
    public var lastSeenAt: Double

    public var id: UInt64 { clientId }

    public init(
        clientId: UInt64, userId: String, name: String, color: String, role: CollaborationRole,
        cursor: Vector2D? = nil, selectedWidgetIds: [String] = [], editingWidgetId: String? = nil,
        camera: CollaborationCamera? = nil, lastSeenAt: Double = 0
    ) {
        self.clientId = clientId
        self.userId = userId
        self.name = name
        self.color = color
        self.role = role
        self.cursor = cursor
        self.selectedWidgetIds = selectedWidgetIds
        self.editingWidgetId = editingWidgetId
        self.camera = camera
        self.lastSeenAt = lastSeenAt
    }
}

/// `CollaborationComment` (`supabaseCollaboration.ts`).
public struct CollaborationComment: Equatable, Sendable, Identifiable {
    public var id: String
    public var canvasId: String
    public var authorId: String
    public var parentId: String?
    public var widgetId: String?
    public var body: String
    /// ISO timestamp as the server wrote it.
    public var createdAt: String

    public init(id: String, canvasId: String, authorId: String, parentId: String?, widgetId: String?, body: String, createdAt: String) {
        self.id = id
        self.canvasId = canvasId
        self.authorId = authorId
        self.parentId = parentId
        self.widgetId = widgetId
        self.body = body
        self.createdAt = createdAt
    }
}

/// `PendingCanvasInvite`: a link the person has not accepted yet. Joining
/// replaces a canvas's contents, so it always waits for a decision.
public struct PendingCanvasInvite: Equatable, Sendable {
    public var canvasId: String
    public var name: String

    public init(canvasId: String, name: String) {
        self.canvasId = canvasId
        self.name = name
    }
}

/// `CollaborationBootstrap`.
public struct CollaborationBootstrap: Sendable {
    public struct Update: Sendable {
        public var id: String
        public var sequence: Int
        public var payload: Data

        public init(id: String, sequence: Int, payload: Data) {
            self.id = id
            self.sequence = sequence
            self.payload = payload
        }
    }

    public var role: CollaborationRole
    public var publicAccess: Bool
    public var snapshot: Data?
    public var lastSequence: Int
    public var updates: [Update]

    public init(role: CollaborationRole, publicAccess: Bool, snapshot: Data?, lastSequence: Int, updates: [Update]) {
        self.role = role
        self.publicAccess = publicAccess
        self.snapshot = snapshot
        self.lastSequence = lastSequence
        self.updates = updates
    }
}

/// `CollaborationCanvasMetadata`.
public struct CollaborationCanvasMetadata: Equatable, Sendable {
    public var canvasId: String
    public var name: String
    public var ownerId: String
    public var publicAccess: Bool

    public init(canvasId: String, name: String, ownerId: String, publicAccess: Bool) {
        self.canvasId = canvasId
        self.name = name
        self.ownerId = ownerId
        self.publicAccess = publicAccess
    }
}

/// A failure the collaboration layer reports in plain words.
public struct CollaborationError: Error, Equatable, CustomStringConvertible, LocalizedError {
    public var message: String

    public init(_ message: String) { self.message = message }

    public var description: String { message }
    public var errorDescription: String? { message }
}
