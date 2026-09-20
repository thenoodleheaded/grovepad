import Foundation
import Observation

/// Port of `useCollaborationStore`: what the collaboration chrome shows.
@MainActor
@Observable
public final class CollaborationState {
    public var status: CollaborationStatus = .disabled
    public var canvasId: String?
    public var role: CollaborationRole?
    public var publicAccess = false
    public var localClientId: UInt64?
    public var participants: [CollaborationPresence] = []
    public var followingClientId: UInt64?
    public var comments: [CollaborationComment] = []
    public var pendingUpdates = 0
    public var error: String?
    /// A link waiting for the person to accept (`pendingInvite`).
    public var pendingInvite: PendingCanvasInvite?

    public init() {}

    /// `INITIAL_COLLABORATION_STATE` (the pending invite survives: it belongs
    /// to the person, not to a session).
    public func reset(keepingInvite: Bool = true) {
        status = .disabled
        canvasId = nil
        role = nil
        publicAccess = false
        localClientId = nil
        participants = []
        followingClientId = nil
        comments = []
        pendingUpdates = 0
        error = nil
        if !keepingInvite { pendingInvite = nil }
    }

    public var canEdit: Bool { canEditCollaborativeCanvas(role) }
    public var canComment: Bool { canCommentOnCollaborativeCanvas(role) }
    public var isActive: Bool { status != .disabled }

    /// People other than this device's own client.
    public var others: [CollaborationPresence] {
        participants.filter { $0.clientId != localClientId }
    }

    public var followed: CollaborationPresence? {
        guard let followingClientId else { return nil }
        return participants.first { $0.clientId == followingClientId }
    }
}
