import Foundation
import Observation
import GrovepadCore
import GrovepadCollaboration

// ---------------------------------------------------------------------------
// The chrome's handle on realtime collaboration (the web's
// `collaborationController.ts` as the overlays use it). The app target builds
// one around its `CollaborationRuntime`; the views only talk to this.
// ---------------------------------------------------------------------------

@MainActor
@Observable
public final class CollaborationChromeModel {
    public let runtime: CollaborationRuntime
    public var state: CollaborationState { runtime.state }
    /// The signed-in account (comment authors show as "You").
    public var accountUserId: String?
    public var panelOpen = false
    public var tab: Tab = .people
    public var message: Message?
    /// `sharingTarget`: the switch is busy while a change is in flight.
    public private(set) var sharingTarget: Bool?
    public var confirmStopSharing = false
    /// Copies text to the pasteboard (injected by the app per platform).
    @ObservationIgnored public var copyToPasteboard: (String) -> Void = { _ in }
    @ObservationIgnored public var toast: (String) -> Void = { _ in }
    @ObservationIgnored private var commentTimer: Timer?

    public enum Tab: String, CaseIterable, Identifiable {
        case people, share, comments
        public var id: String { rawValue }
        public var label: String {
            switch self {
            case .people: return "People"
            case .share: return "Share"
            case .comments: return "Comments"
            }
        }
        public var symbol: String {
            switch self {
            case .people: return "person.2"
            case .share: return "square.and.arrow.up"
            case .comments: return "bubble.left"
            }
        }
    }

    public struct Message: Equatable {
        public var text: String
        public var isError: Bool
    }

    public init(runtime: CollaborationRuntime) {
        self.runtime = runtime
    }

    // MARK: - Panel

    public func setPanelOpen(_ open: Bool) {
        panelOpen = open
        message = nil
        commentTimer?.invalidate()
        commentTimer = nil
        guard open else { return }
        // "Updates automatically while this panel is open" (every 10 s).
        commentTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                Task { try? await self.runtime.refreshComments() }
            }
        }
        Task { try? await runtime.refreshComments() }
    }

    /// `run`: perform, then report success or the error in the panel.
    @discardableResult
    public func run(_ success: String, _ operation: @escaping () async throws -> Void) async -> Bool {
        message = nil
        do {
            try await operation()
            message = Message(text: success, isError: false)
            return true
        } catch {
            message = Message(text: Self.describe(error), isError: true)
            return false
        }
    }

    static func describe(_ error: Error) -> String {
        (error as? CollaborationError)?.message ?? error.localizedDescription
    }

    // MARK: - Actions

    public func follow(_ clientId: UInt64?) { runtime.follow(clientId) }

    /// An avatar tap: follow someone else, or stop following.
    public func toggleFollow(_ participant: CollaborationPresence) {
        let stop = participant.clientId == state.localClientId || state.followingClientId == participant.clientId
        runtime.follow(stop ? nil : participant.clientId)
    }

    public func retry() {
        runtime.retry()
        message = Message(text: "Reconnecting…", isError: false)
    }

    public var shareLink: String {
        CollaborationLinks.shareURL(canvasId: state.canvasId ?? runtime.activeCanvasId).absoluteString
    }

    public func copyLink() {
        copyToPasteboard(shareLink)
        message = Message(text: "Canvas link copied", isError: false)
    }

    public func setPublicAccess(_ isPublic: Bool) async {
        await run(isPublic ? "Public canvas link enabled" : "Public viewing turned off") { [runtime] in
            try await runtime.setPublicAccess(isPublic)
        }
    }

    public func invite(email: String, role: CollaborationRole) async -> Bool {
        await run("Access granted to \(email)") { [runtime] in try await runtime.invite(email: email, role: role) }
    }

    public func postComment(_ body: String, replyTo: String?) async -> Bool {
        await run(replyTo == nil ? "Comment posted" : "Reply posted") { [runtime] in
            try await runtime.postComment(body, parentId: replyTo)
        }
    }

    public func refreshComments() async {
        await run("Comments refreshed") { [runtime] in try await runtime.refreshComments() }
    }

    public func authorName(_ authorId: String) -> String {
        if authorId == accountUserId { return "You" }
        return state.participants.first { $0.userId == authorId }?.name ?? "Collaborator"
    }

    // MARK: - Sharing switch (SettingsPanel `CanvasSettings`)

    public func canToggleSharing(shared: Bool) -> Bool {
        CanvasSharingRules.canToggle(
            shared: shared, hasSession: accountUserId != nil, configured: runtime.configured,
            role: state.role, busy: sharingTarget != nil
        )
    }

    public func sharingTitle(shared: Bool) -> String {
        switch sharingTarget {
        case true?: return "Sharing canvas…"
        case false?: return "Making private…"
        case nil: return shared ? "Shared canvas" : "Private canvas"
        }
    }

    /// On: straight away. Off: asks first (`confirmStopSharing`).
    public func requestSharing(_ next: Bool) {
        if next {
            Task { await applySharing(true) }
        } else {
            confirmStopSharing = true
        }
    }

    public func applySharing(_ next: Bool) async {
        confirmStopSharing = false
        sharingTarget = next
        defer { sharingTarget = nil }
        do {
            try await runtime.setShared(next)
            toast(next ? "Canvas shared with people you invite" : "Canvas is private again")
        } catch {
            toast(Self.describe(error))
        }
    }

    // MARK: - Links and invites

    /// A pasted `?collaborate=` link (or `grovepad://collaborate/<id>`).
    public func openLink(_ text: String) async -> Bool {
        guard let canvasId = CollaborationLinks.canvasId(fromText: text) else {
            toast("That is not a Grovepad canvas link")
            return false
        }
        return await openLink(canvasId: canvasId)
    }

    public func openLink(canvasId: String) async -> Bool {
        do {
            try await runtime.openLink(canvasId: canvasId)
            return true
        } catch {
            toast(Self.describe(error))
            return false
        }
    }

    public func acceptInvite() {
        do {
            try runtime.acceptPendingInvite()
        } catch {
            toast(Self.describe(error))
        }
    }

    public func dismissInvite() { runtime.dismissPendingInvite() }
}

// MARK: - Presentation tables (CollaborationOverlays.tsx STATUS_META / ROLE_META)

public extension CollaborationStatus {
    var label: String {
        switch self {
        case .disabled: return "Unavailable"
        case .connecting: return "Connecting"
        case .connected: return "Live"
        case .reconnecting: return "Reconnecting"
        case .offline: return "Offline"
        case .error: return "Realtime paused"
        }
    }

    var detail: String {
        switch self {
        case .disabled: return "Multiplayer is not running."
        case .connecting: return "Opening the shared canvas…"
        case .connected: return "Changes and presence are updating live."
        case .reconnecting: return "Local changes are safe while Grovepad reconnects."
        case .offline: return "Changes stay on this device and will send when you reconnect."
        case .error: return "Grovepad could not open the multiplayer connection."
        }
    }

    /// Dot colour: emerald live, amber in between, rose on error.
    var dotHex: String {
        switch self {
        case .disabled: return "#737373"
        case .connecting, .reconnecting: return "#fcd34d"
        case .connected: return "#34d399"
        case .offline: return "#fbbf24"
        case .error: return "#fb7185"
        }
    }

    var pulses: Bool { self == .connecting || self == .reconnecting }
}

public extension CollaborationRole {
    var label: String {
        switch self {
        case .owner: return "Owner"
        case .editor: return "Editor"
        case .commenter: return "Commenter"
        case .viewer: return "Viewer"
        }
    }

    var short: String {
        switch self {
        case .owner: return "Full access"
        case .editor: return "Can edit"
        case .commenter: return "Comments only"
        case .viewer: return "View only"
        }
    }

    var detail: String {
        switch self {
        case .owner: return "Edit, comment, and manage access."
        case .editor: return "Edit the canvas and join comments."
        case .commenter: return "View the canvas and join comments."
        case .viewer: return "View and follow people without changing the canvas."
        }
    }

    var symbol: String {
        switch self {
        case .owner: return "checkmark.shield"
        case .editor: return "pencil"
        case .commenter: return "bubble.left"
        case .viewer: return "eye"
        }
    }
}

public extension CollaborationPresence {
    /// `initials`: first letters of the first two words.
    var initials: String {
        let letters = name.split(whereSeparator: \.isWhitespace).prefix(2).compactMap { $0.first.map { String($0).uppercased() } }
        return letters.isEmpty ? "?" : letters.joined()
    }
}
