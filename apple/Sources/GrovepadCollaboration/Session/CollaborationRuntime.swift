import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port of the lifecycle half of `src/runtime/collaborationRuntime.ts` and the
// controller facade (`collaborationController.ts`, `canvasSharing.ts`):
//
// - A signed-in person's active canvas connects only when that canvas is
//   marked shared. Private canvases never register with the server.
// - Switching canvas, signing in or out, or a retry restarts the session.
// - Turning sharing on registers the canvas first (so a failure never leaves
//   a "shared" canvas without a role); turning it off verifies ownership and
//   deletes the server collaboration so invited people lose access.
// - A link never changes a board by itself: it becomes a pending invite that
//   the person must accept.
//
// Guests (no identity) never start any transport.
// ---------------------------------------------------------------------------

/// What the runtime needs beyond the session host: canvas flags and
/// navigation.
@MainActor
public protocol CollaborationBoardHost: CollaborationHost {
    /// `updateCanvasSettings(canvasId, { shared })`.
    func setCanvasShared(_ canvasId: String, shared: Bool)
    /// Create the canvas record locally if missing (in the active
    /// workspace), mark it shared, and open it (`adoptSharedCanvas`).
    func adoptSharedCanvas(_ canvasId: String, name: String) throws
}

public enum CollaborationLinks {
    /// The web app's origin; a link opens in any browser, and the Mac app
    /// accepts it pasted into the Share panel or as `grovepad://collaborate/<id>`.
    public static let webOrigin = URL(string: "https://grovepad.app/")!

    /// `collaborationShareUrl`.
    public static func shareURL(canvasId: String) -> URL {
        var components = URLComponents(url: webOrigin, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "collaborate", value: canvasId)]
        return components.url!
    }

    /// The canvas a link points at: `?collaborate=<id>` on any URL, or
    /// `grovepad://collaborate/<id>`. Ids longer than 256 are refused, as
    /// `joinCanvasFromUrl` does.
    public static func canvasId(from url: URL) -> String? {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        var candidate = components?.queryItems?.first { $0.name == "collaborate" }?.value
        if candidate == nil, url.scheme?.lowercased() == "grovepad", url.host?.lowercased() == "collaborate" {
            candidate = url.pathComponents.dropFirst().first
        }
        guard let id = candidate?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty, id.utf16.count <= 256 else { return nil }
        return id
    }

    /// A link typed or pasted as text.
    public static func canvasId(fromText text: String) -> String? {
        URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap(canvasId(from:))
    }
}

@MainActor
public final class CollaborationRuntime {
    public let state = CollaborationState()
    public private(set) var session: CollaborationSession?
    /// Whether this build can reach a collaboration server at all.
    public let configured: Bool
    /// The canvas on screen (the one a share link names when no session runs).
    public var activeCanvasId: String { host.activeCanvasId }

    private let host: CollaborationBoardHost
    private let queue: OfflineUpdateQueue
    private let clock: Clock
    /// Returns a repository authorised for the current account (the web's
    /// `getSupabaseClient` + `realtime.setAuth`), or nil when unavailable.
    private let makeRepository: () async throws -> CollaborationRepository?
    private var identity: CollaborationIdentity?
    private var generation = 0
    private var trackedCanvasId: String
    private var boardObserver: (() -> Void)?
    /// Set while this runtime flips a shared flag itself and restarts right
    /// after, so the board notification does not start a second session.
    private var changingSharing = false

    public init(
        host: CollaborationBoardHost,
        queue: OfflineUpdateQueue,
        configured: Bool,
        clock: Clock = .system,
        makeRepository: @escaping () async throws -> CollaborationRepository?
    ) {
        self.host = host
        self.queue = queue
        self.configured = configured
        self.clock = clock
        self.makeRepository = makeRepository
        trackedCanvasId = host.activeCanvasId
    }

    /// `initCollaborationRuntime`: watch the active canvas; the app reports
    /// account changes through `setIdentity`.
    public func start(identity: CollaborationIdentity?) {
        self.identity = identity
        trackedCanvasId = host.activeCanvasId
        boardObserver = host.observeBoard { [weak self] in self?.boardChanged() }
        restartForCurrentCanvas()
    }

    public func dispose() {
        boardObserver?()
        boardObserver = nil
        stopActiveSession()
    }

    /// Signed in, out, or switched account.
    public func setIdentity(_ next: CollaborationIdentity?) {
        guard next?.userId != identity?.userId else {
            identity = next
            return
        }
        identity = next
        restartForCurrentCanvas()
    }

    /// Navigation or a shared flag flipped by another path (undo of a
    /// settings change, a sync pull): restart when it matters.
    private func boardChanged() {
        guard !changingSharing else { return }
        let canvasId = host.activeCanvasId
        let shared = host.board.canvases[canvasId]?.shared ?? false
        if canvasId != trackedCanvasId {
            trackedCanvasId = canvasId
            restartForCurrentCanvas()
        } else if identity != nil, shared != (session != nil || state.status != .disabled) {
            restartForCurrentCanvas()
        }
    }

    /// The app calls this when the active canvas changes without a board edit.
    public func activeCanvasDidChange() {
        guard host.activeCanvasId != trackedCanvasId else { return }
        trackedCanvasId = host.activeCanvasId
        restartForCurrentCanvas()
    }

    public func networkChanged(online: Bool) {
        if online {
            if let session {
                session.networkBecameOnline()
            } else if identity != nil {
                // `retryOfflineStart`: a start that failed offline tries again.
                restartForCurrentCanvas()
            }
        } else if session != nil || state.status != .disabled {
            session?.networkWentOffline()
            if session == nil { state.status = .offline }
        }
    }

    // MARK: - Lifecycle

    private func stopActiveSession() {
        generation += 1
        let previous = session
        session = nil
        previous?.dispose()
        state.reset()
    }

    /// `restartForCurrentCanvas`.
    public func restartForCurrentCanvas(initialRole: CollaborationRole? = nil) {
        stopActiveSession()
        let expected = generation
        guard let identity else { return }
        let canvasId = host.activeCanvasId
        trackedCanvasId = canvasId
        // Sharing is opt-in per canvas; a private canvas stays on this device.
        guard host.board.canvases[canvasId]?.shared == true else { return }
        state.status = host.isOnline ? .connecting : .offline
        state.canvasId = canvasId
        state.role = initialRole
        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.startCanvasSession(identity: identity, canvasId: canvasId, expected: expected, initialRole: initialRole)
            } catch {
                guard expected == self.generation else { return }
                self.state.status = self.host.isOnline ? .error : .offline
                self.state.canvasId = canvasId
                self.state.error = "\(error)"
            }
        }
    }

    /// `startCanvasSession` up to the bootstrap; the session does the rest.
    private func startCanvasSession(identity: CollaborationIdentity, canvasId: String, expected: Int, initialRole: CollaborationRole?) async throws {
        state.status = host.isOnline ? .connecting : .offline
        state.canvasId = canvasId
        state.role = initialRole
        guard let repository = try await makeRepository() else {
            throw CollaborationError("Canvas sharing is unavailable on this build")
        }
        guard expected == generation else { return }
        let canvasName = host.board.canvases[canvasId]?.name ?? "Shared canvas"
        let cached = queue.readDocument(canvasId)
        let bootstrap: CollaborationBootstrap
        do {
            bootstrap = try await repository.bootstrap(canvasId, name: canvasName)
        } catch {
            guard !host.isOnline, let cached else { throw error }
            bootstrap = CollaborationBootstrap(role: cached.role, publicAccess: false, snapshot: cached.snapshot, lastSequence: cached.lastSequence, updates: [])
        }
        guard expected == generation, host.activeCanvasId == canvasId else { return }
        session = CollaborationSession(
            canvasId: canvasId, canvasName: canvasName, identity: identity,
            bootstrap: bootstrap, cachedDocument: cached,
            repository: repository, queue: queue, host: host, state: state, clock: clock
        )
    }

    // MARK: - Controller (collaborationController.ts)

    public func setEditingWidget(_ widgetId: String?) { session?.setEditingWidget(widgetId) }

    /// `followCollaborator`; `nil` stops following.
    public func follow(_ clientId: UInt64?) {
        if let session {
            session.follow(clientId)
        } else {
            state.followingClientId = clientId
        }
    }

    public func invite(email: String, role: CollaborationRole) async throws {
        guard let session else { throw CollaborationError("Collaboration is not connected") }
        try await session.invite(email: email, role: role)
    }

    public func setPublicAccess(_ isPublic: Bool) async throws {
        guard let session else { throw CollaborationError("Collaboration is not connected") }
        try await session.setPublicAccess(isPublic)
    }

    public func postComment(_ body: String, parentId: String? = nil, widgetId: String? = nil) async throws {
        guard let session else { throw CollaborationError("Collaboration is not connected") }
        try await session.postComment(body, parentId: parentId, widgetId: widgetId)
    }

    public func refreshComments() async throws { try await session?.refreshComments() }

    /// `retryCurrentCollaboration`.
    public func retry() {
        restartForCurrentCanvas()
    }

    /// `setCanvasShared`: on registers first, off revokes on the server
    /// before the local flag changes.
    public func setShared(_ shared: Bool) async throws {
        guard identity != nil else { throw CollaborationError("Sign in to share a canvas") }
        let canvasId = host.activeCanvasId
        let canvasName = host.board.canvases[canvasId]?.name ?? "Shared canvas"
        if shared {
            guard let repository = try await makeRepository() else { throw CollaborationError("Canvas sharing is unavailable on this build") }
            let role = try await repository.ensureCanvas(canvasId, name: canvasName)
            changingSharing = true
            host.setCanvasShared(canvasId, shared: true)
            changingSharing = false
            // The person may have navigated while registration was in flight.
            if host.activeCanvasId == canvasId { restartForCurrentCanvas(initialRole: role) }
            return
        }
        let repository: CollaborationRepository
        var knownRole: CollaborationRole?
        if let session, session.canvasId == canvasId {
            repository = session.repositoryForSharing
            knownRole = session.role
        } else {
            guard let fresh = try await makeRepository() else { throw CollaborationError("Canvas sharing is unavailable on this build") }
            repository = fresh
            // An old start that never resolved a role asks the server again.
            knownRole = try await repository.ensureCanvas(canvasId, name: canvasName)
            if host.activeCanvasId == canvasId {
                state.canvasId = canvasId
                state.role = knownRole
            }
        }
        let role: CollaborationRole
        if let knownRole { role = knownRole } else { role = try await repository.ensureCanvas(canvasId, name: canvasName) }
        guard role == .owner else { throw CollaborationError("Only the canvas owner can stop sharing") }
        try await repository.deleteCanvasCollaboration(canvasId)
        changingSharing = true
        host.setCanvasShared(canvasId, shared: false)
        changingSharing = false
        restartForCurrentCanvas()
    }

    /// `joinCanvasFromUrl`: check the link (membership RLS protects the
    /// metadata), refuse one that would overwrite a private canvas, and hold
    /// it as a pending invite.
    public func openLink(canvasId: String) async throws {
        guard identity != nil else { throw CollaborationError("Sign in to open a shared canvas") }
        guard let repository = try await makeRepository() else { throw CollaborationError("Canvas sharing is unavailable on this build") }
        let metadata = try await repository.canvasMetadata(canvasId)
        if let local = host.board.canvases[canvasId], !local.shared {
            throw CollaborationError("That link points at a canvas you already have, so it was not opened.")
        }
        state.pendingInvite = PendingCanvasInvite(canvasId: canvasId, name: metadata.name)
    }

    /// `acceptPendingCanvasInvite`: the only path that applies an invite.
    public func acceptPendingInvite() throws {
        guard let invite = state.pendingInvite else { return }
        state.pendingInvite = nil
        changingSharing = true
        defer { changingSharing = false }
        try host.adoptSharedCanvas(invite.canvasId, name: invite.name)
        trackedCanvasId = host.activeCanvasId
        restartForCurrentCanvas()
    }

    public func dismissPendingInvite() {
        state.pendingInvite = nil
    }
}
