import SwiftUI
import GrovepadCore
import GrovepadCanvas
import GrovepadCollaboration

// ---------------------------------------------------------------------------
// Port of `src/components/collaboration/CollaborationOverlays.tsx` and
// `CanvasInviteDialog.tsx` for the native chrome:
//
// - `CollaborationControl`: avatars + the status pill; opens the Multiplayer
//   panel (People · Share · Comments) as a popover. Shown only on a shared
//   canvas.
// - `FollowBanner`: "Following Ada · Stop".
// - `CollaborationWorldOverlay`: other people's selections, outlined in their
//   colour on the footprint actually drawn (a resting tile, not the stored box).
// - `RemoteCursorLayer`: other people's pointers in world space, a constant
//   on-screen size, gliding between presence updates.
// - `.collaborationInviteDialog`: a link waits for consent before it changes
//   anything.
// ---------------------------------------------------------------------------

struct CollaborationAvatar: View {
    let participant: CollaborationPresence
    var size: CGFloat = 28
    var local = false

    var body: some View {
        Text(participant.initials)
            .font(.grove(size: size * 0.32, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hex: participant.color), in: Circle())
            .overlay(Circle().strokeBorder(Color.black.opacity(0.55), lineWidth: 2))
            .overlay {
                if local { Circle().strokeBorder(Color(hex: "#6ee7b7").opacity(0.45), lineWidth: 2).padding(-3) }
            }
            .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
            .accessibilityHidden(true)
    }
}

struct StatusDot: View {
    let status: CollaborationStatus
    @State private var dim = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle()
            .fill(Color(hex: status.dotHex))
            .frame(width: 8, height: 8)
            .opacity(status.pulses && dim ? 0.35 : 1)
            .onAppear { animate() }
            .onChange(of: status) { _, _ in animate() }
            .accessibilityHidden(true)
    }

    private func animate() {
        dim = false
        guard status.pulses, !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { dim = true }
    }
}

/// The compact control over the canvas (`CollaborationChrome`).
public struct CollaborationControl: View {
    @Bindable private var model: CollaborationChromeModel
    private let document: BoardDocument

    public init(model: CollaborationChromeModel, document: BoardDocument) {
        self._model = Bindable(model)
        self.document = document
    }

    private var state: CollaborationState { model.state }
    private var shared: Bool { document.canvas(document.activeCanvasId)?.shared == true }

    /// "N here" counts everyone present, including this client.
    private var controlLabel: String {
        if state.status != .connected { return state.status.label }
        return state.others.isEmpty ? "Only you" : "\(state.participants.count) here"
    }

    public var body: some View {
        if shared {
            HStack(spacing: 8) {
                avatars
                Button { model.setPanelOpen(!model.panelOpen) } label: { pill }
                    .buttonStyle(.plain)
                    .floatingPill()
                    .help(state.error ?? state.status.detail)
                    .accessibilityLabel("Multiplayer: \(controlLabel)\(state.role.map { ", \($0.short)" } ?? "")")
                    .popover(isPresented: Binding(get: { model.panelOpen }, set: { model.setPanelOpen($0) }), arrowEdge: .bottom) {
                        CollaborationPanel(model: model, document: document)
                    }
            }
        }
    }

    private var avatars: some View {
        let visible = Array(state.participants.prefix(4))
        let hidden = max(0, state.participants.count - visible.count)
        return HStack(spacing: -10) {
            ForEach(visible) { participant in
                Button { model.toggleFollow(participant) } label: {
                    CollaborationAvatar(participant: participant, local: participant.clientId == state.localClientId)
                }
                .buttonStyle(.plain)
                .help(participant.clientId == state.localClientId ? "\(participant.name) (you)"
                      : state.followingClientId == participant.clientId ? "Stop following \(participant.name)" : "Follow \(participant.name)")
                .accessibilityLabel(participant.clientId == state.localClientId ? "\(participant.name), you" : "Follow \(participant.name)")
            }
            if hidden > 0 {
                Text("+\(hidden)")
                    .font(.grove(size: 9, weight: .semibold))
                    .frame(width: 28, height: 28)
                    .background(Color(hex: "#404040"), in: Circle())
                    .overlay(Circle().strokeBorder(Color.black.opacity(0.55), lineWidth: 2))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(state.participants.count) people online")
    }

    private var pill: some View {
        HStack(spacing: 7) {
            StatusDot(status: state.status)
            Image(systemName: "person.2").font(.system(size: 12, weight: .semibold))
            Text(controlLabel).font(.grove(size: 12, weight: .semibold))
            if state.pendingUpdates > 0 {
                Text("\(state.pendingUpdates) queued").font(.grove(size: 10)).foregroundStyle(Color(hex: "#fde68a"))
            }
            if let role = state.role {
                Divider().frame(height: 12)
                Text(role.short)
                    .font(.grove(size: 11, weight: .medium))
                    .foregroundStyle(role.canEdit ? Color.secondary : Color(hex: "#fde68a"))
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 36)
        .contentShape(Capsule())
    }
}

/// `Following Ada · Stop`.
public struct FollowBanner: View {
    private let model: CollaborationChromeModel

    public init(model: CollaborationChromeModel) { self.model = model }

    public var body: some View {
        if model.state.followingClientId != nil {
            Button { model.follow(nil) } label: {
                Label("Following \(model.state.followed?.name ?? "collaborator") · Stop", systemImage: "scope")
                    .font(.grove(size: 12, weight: .semibold))
                    .foregroundStyle(Color.tone("#bae6fd", light: "#0369a1"))
                    .padding(.horizontal, 14)
                    .frame(height: 32)
            }
            .buttonStyle(.plain)
            .floatingPill()
            .overlay(Capsule().strokeBorder(Color(hex: "#38bdf8").opacity(0.35), lineWidth: 1))
            .help("Stop following")
            .keyboardShortcut(.cancelAction)
        }
    }
}

/// The Multiplayer panel.
struct CollaborationPanel: View {
    @Bindable var model: CollaborationChromeModel
    let document: BoardDocument

    private var state: CollaborationState { model.state }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                StatusDot(status: state.status)
                Text("Multiplayer").font(.grove(size: 14, weight: .semibold))
                Text("\(state.participants.count) online").font(.grove(size: 10)).foregroundStyle(.secondary)
                Spacer()
            }
            Picker("Section", selection: Binding(get: { model.tab }, set: { model.tab = $0; model.message = nil })) {
                ForEach(CollaborationChromeModel.Tab.allCases) { tab in
                    Text(tabTitle(tab)).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ConnectionSummary(model: model)
                    switch model.tab {
                    case .people: PeopleTab(model: model, document: document)
                    case .share: ShareTab(model: model, document: document)
                    case .comments: CommentsTab(model: model)
                    }
                    if let message = model.message {
                        Text(message.text)
                            .font(.grove(size: 11))
                            .foregroundStyle(message.isError ? Color(hex: "#fda4af") : Color(hex: "#6ee7b7"))
                            .accessibilityAddTraits(.isStaticText)
                    }
                }
                .padding(.bottom, 4)
            }
            .frame(maxHeight: 420)
        }
        .padding(14)
        .frame(width: 340)
        .font(.grove(size: 12))
    }

    private func tabTitle(_ tab: CollaborationChromeModel.Tab) -> String {
        switch tab {
        case .people: return "People \(state.participants.count)"
        case .comments: return state.comments.isEmpty ? "Comments" : "Comments \(state.comments.count)"
        case .share: return "Share"
        }
    }
}

/// Shown unless live with nothing queued.
struct ConnectionSummary: View {
    let model: CollaborationChromeModel

    var body: some View {
        let state = model.state
        let retryable = state.status == .error || state.status == .offline || state.status == .reconnecting
        if !(state.status == .connected && state.pendingUpdates == 0) {
            HStack(spacing: 8) {
                StatusDot(status: state.status)
                Text(state.status.label).font(.grove(size: 11, weight: .semibold)).lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "checkmark.shield").foregroundStyle(Color(hex: "#6ee7b7").opacity(0.7))
                    .help("Local edits remain safe")
                if state.pendingUpdates > 0 {
                    Text("\(state.pendingUpdates) queued")
                        .font(.grove(size: 9, weight: .medium))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color(hex: "#fbbf24").opacity(0.12), in: Capsule())
                }
                if retryable {
                    Button { model.retry() } label: { Image(systemName: "arrow.clockwise") }
                        .buttonStyle(.borderless)
                        .help("Retry multiplayer")
                        .accessibilityLabel("Retry multiplayer")
                }
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 34)
            .background(
                (state.status == .error ? Color(hex: "#f43f5e").opacity(0.12) : Color.primary.opacity(0.05)),
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .help(state.error ?? state.status.detail)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Multiplayer connection: \(state.status.label). \(state.error ?? state.status.detail) Local edits remain safe.")
        }
    }
}

struct PeopleTab: View {
    let model: CollaborationChromeModel
    let document: BoardDocument

    var body: some View {
        let state = model.state
        VStack(spacing: 0) {
            if state.participants.isEmpty {
                Text("Connecting your presence…").font(.grove(size: 11)).foregroundStyle(.secondary).padding(.vertical, 18)
            }
            ForEach(state.participants) { participant in
                let local = participant.clientId == state.localClientId
                let following = participant.clientId == state.followingClientId
                let editing = participant.editingWidgetId.flatMap { document.widget($0)?.title }
                HStack(spacing: 10) {
                    CollaborationAvatar(participant: participant, size: 32, local: local)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(local ? "\(participant.name) (you)" : participant.name).font(.grove(size: 12, weight: .medium)).lineLimit(1)
                        HStack(spacing: 4) {
                            if editing != nil { Circle().fill(Color(hex: "#34d399")).frame(width: 6, height: 6) }
                            Text(editing.map { "Editing \($0)" } ?? participant.role.label)
                                .font(.grove(size: 10)).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer()
                    Image(systemName: participant.role.symbol)
                        .foregroundStyle(.secondary)
                        .help("\(participant.role.label) · \(participant.role.short)")
                        .accessibilityLabel("\(participant.role.label): \(participant.role.detail)")
                    if !local {
                        Button { model.follow(following ? nil : participant.clientId) } label: {
                            Image(systemName: "scope").foregroundStyle(following ? Color(hex: "#38bdf8") : .secondary)
                        }
                        .buttonStyle(.borderless)
                        .help(following ? "Stop following" : "Follow")
                        .accessibilityLabel(following ? "Stop following \(participant.name)" : "Follow \(participant.name)")
                        .accessibilityAddTraits(following ? .isSelected : [])
                    }
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 8)
            }
        }
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(state.participants.count) people online")
    }
}

struct ShareTab: View {
    let model: CollaborationChromeModel
    let document: BoardDocument
    @State private var email = ""
    @State private var inviteRole: CollaborationRole = .editor
    @State private var busy = false

    var body: some View {
        let state = model.state
        let canvasName = document.canvasName(document.activeCanvasId) ?? "Current canvas"
        VStack(alignment: .leading, spacing: 10) {
            card {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: state.publicAccess ? "globe" : "link")
                        .foregroundStyle(state.publicAccess ? Color(hex: "#6ee7b7") : Color(hex: "#7dd3fc"))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Only “\(canvasName)” is shared").font(.grove(size: 12, weight: .semibold))
                        Text(state.publicAccess
                             ? "Anyone signed in with this link can view. Only the owner and approved editor emails can change information."
                             : "Only invited accounts can enter. Other canvases stay private.")
                            .font(.grove(size: 10.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        Text("Files stored only on this device are not uploaded by multiplayer.")
                            .font(.grove(size: 10)).foregroundStyle(.tertiary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            Button { model.copyLink() } label: {
                Label(state.publicAccess ? "Copy public canvas link" : "Copy canvas link", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }
            .glassButton(prominent: true, radius: 12)
            .controlSize(.large)

            if state.role == .owner {
                card {
                    Toggle(isOn: Binding(get: { state.publicAccess }, set: { next in
                        busy = true
                        Task { await model.setPublicAccess(next); busy = false }
                    })) {
                        VStack(alignment: .leading, spacing: 3) {
                            Label("Public link viewing", systemImage: "globe").font(.grove(size: 12, weight: .semibold))
                            Text("Anyone signed in with the link can view, but cannot edit or comment.")
                                .font(.grove(size: 10.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .toggleStyle(.switch)
                    .tint(Color(hex: "#10b981"))
                    .disabled(busy)
                }
                card {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Approve people by email", systemImage: "checkmark.shield").font(.grove(size: 12, weight: .semibold))
                        Text("Only accounts you assign the Editor role can change canvas information. This does not send email—copy the link above and send it separately.")
                            .font(.grove(size: 10.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        TextField("person@example.com", text: $email)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(.emailAddress)
                            .onSubmit(grant)
                            .accessibilityLabel("Account email")
                        HStack {
                            Picker("Access role", selection: $inviteRole) {
                                Text("Editor · can edit").tag(CollaborationRole.editor)
                                Text("Commenter · comments only").tag(CollaborationRole.commenter)
                                Text("Viewer · view only").tag(CollaborationRole.viewer)
                            }
                            .labelsHidden()
                            Button(busy ? "Saving…" : "Grant access", action: grant)
                                .glassButton(prominent: true, radius: 10)
                                .disabled(busy || !email.contains("@"))
                        }
                        Text("Entering the same email again changes that person’s role.")
                            .font(.grove(size: 10)).foregroundStyle(.tertiary)
                    }
                }
            } else {
                card {
                    Text("Only the canvas owner can grant editing access or change public viewing. You can still copy and send this link.")
                        .font(.grove(size: 10.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func grant() {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy, address.contains("@") else { return }
        busy = true
        Task {
            if await model.invite(email: address, role: inviteRole) { email = "" }
            busy = false
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct CommentsTab: View {
    let model: CollaborationChromeModel
    @State private var draft = ""
    @State private var replyTo: String?
    @State private var busy = false

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter
    }()

    private static func displayDate(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = parser.date(from: iso) { return dateFormatter.string(from: date) }
        parser.formatOptions = [.withInternetDateTime]
        return parser.date(from: iso).map(dateFormatter.string(from:)) ?? iso
    }

    var body: some View {
        let state = model.state
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Updates automatically while this panel is open.").font(.grove(size: 10)).foregroundStyle(.secondary)
                Spacer()
                Button { Task { await model.refreshComments() } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                    .buttonStyle(.borderless)
                    .font(.grove(size: 10.5))
                    .accessibilityLabel("Refresh comments")
            }
            if state.comments.isEmpty {
                Text("No comments yet.")
                    .font(.grove(size: 11)).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity).padding(.vertical, 24)
                    .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            ForEach(state.comments) { comment in
                VStack(alignment: .leading, spacing: 6) {
                    Text(comment.body).font(.grove(size: 12)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                    HStack {
                        Text("\(model.authorName(comment.authorId)) · \(Self.displayDate(comment.createdAt))")
                            .font(.grove(size: 9.5)).foregroundStyle(.secondary)
                        Spacer()
                        if state.canComment, comment.parentId == nil {
                            Button("Reply") { replyTo = comment.id }
                                .buttonStyle(.borderless).font(.grove(size: 10)).foregroundStyle(Color(hex: "#7dd3fc"))
                        }
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(.leading, comment.parentId == nil ? 0 : 18)
            }
            if state.canComment {
                VStack(alignment: .leading, spacing: 6) {
                    if replyTo != nil {
                        HStack {
                            Text("Writing a reply").font(.grove(size: 10)).foregroundStyle(Color(hex: "#7dd3fc"))
                            Spacer()
                            Button("Cancel") { replyTo = nil }.buttonStyle(.borderless).font(.grove(size: 10))
                        }
                    }
                    HStack(alignment: .bottom, spacing: 8) {
                        TextField(replyTo == nil ? "Add a comment…" : "Write a reply…", text: $draft, axis: .vertical)
                            .lineLimit(2...5)
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: draft) { _, next in if next.count > 4000 { draft = String(next.prefix(4000)) } }
                        Button(action: post) { Image(systemName: "paperplane.fill") }
                            .glassButton(prominent: true, radius: 10)
                            .disabled(busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .keyboardShortcut(.return, modifiers: .command)
                            .accessibilityLabel(replyTo == nil ? "Post comment" : "Post reply")
                    }
                }
            } else {
                Text("Viewers can read comments but cannot post.")
                    .font(.grove(size: 10.5)).foregroundStyle(.secondary)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    private func post() {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !busy else { return }
        busy = true
        Task {
            if await model.postComment(body, replyTo: replyTo) {
                draft = ""
                replyTo = nil
            }
            busy = false
        }
    }
}

// MARK: - World-space layers

/// Other people's selections (`CollaborationWorldOverlay`).
public struct CollaborationWorldOverlay: View {
    private let model: CollaborationChromeModel
    private let document: BoardDocument
    private let chrome: ChromeState

    public init(model: CollaborationChromeModel, document: BoardDocument, chrome: ChromeState) {
        self.model = model
        self.document = document
        self.chrome = chrome
    }

    public var body: some View {
        let transform = chrome.cameraTransform
        let context = WidgetRestContextFactory.make(expandedWidgetId: document.expandedWidgetId)
        let outlines: [(key: String, rect: WorldRect, resting: Bool, participant: CollaborationPresence)] = model.state.others.flatMap { participant in
            participant.selectedWidgetIds.compactMap { id -> (key: String, rect: WorldRect, resting: Bool, participant: CollaborationPresence)? in
                guard let widget = document.widget(id), widget.canvasId == document.activeCanvasId else { return nil }
                return ("\(participant.clientId):\(id)", displayedWidgetRect(widget, restContext: context), context.isResting(widget), participant)
            }
        }
        ZStack(alignment: .topLeading) {
            ForEach(outlines, id: \.key) { outline in
                let origin = CanvasGeometry.worldToScreen(Vector2D(x: outline.rect.x - 4, y: outline.rect.y - 4), transform: transform)
                let width = (outline.rect.width + 8) * transform.zoom
                let height = (outline.rect.height + 8) * transform.zoom
                let color = Color(hex: outline.participant.color)
                RoundedRectangle(cornerRadius: (outline.resting ? 20 : 24) * transform.zoom, style: .continuous)
                    .strokeBorder(color, lineWidth: 2)
                    .background(RoundedRectangle(cornerRadius: (outline.resting ? 20 : 24) * transform.zoom, style: .continuous).stroke(color.opacity(0.24), lineWidth: 4))
                    .frame(width: width, height: height)
                    .overlay(alignment: .topLeading) {
                        NameTag(name: outline.participant.name, color: color).offset(x: 8, y: -22)
                    }
                    .offset(x: origin.x, y: origin.y)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct NameTag: View {
    let name: String
    let color: Color

    var body: some View {
        Text(name)
            .font(.grove(size: 10, weight: .medium))
            .foregroundStyle(.white)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .shadow(color: .black.opacity(0.3), radius: 3, y: 1)
    }
}

/// Other people's pointers (`RemoteCursorLayer`).
public struct RemoteCursorLayer: View {
    private let model: CollaborationChromeModel
    private let chrome: ChromeState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(model: CollaborationChromeModel, chrome: ChromeState) {
        self.model = model
        self.chrome = chrome
    }

    public var body: some View {
        let transform = chrome.cameraTransform
        let cursors = model.state.others.compactMap { participant in participant.cursor.map { (participant, $0) } }
        ZStack(alignment: .topLeading) {
            ForEach(cursors, id: \.0.clientId) { participant, cursor in
                let point = CanvasGeometry.worldToScreen(cursor, transform: transform)
                CursorGlyph(color: Color(hex: participant.color), name: participant.name)
                    .offset(x: point.x, y: point.y)
                    // Glide between presence updates, never lag the camera:
                    // the animation keys on the cursor, not the transform.
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: cursor)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .clipped()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct CursorGlyph: View {
    let color: Color
    let name: String

    var body: some View {
        ZStack(alignment: .topLeading) {
            CursorArrow()
                .fill(color)
                .overlay(CursorArrow().stroke(Color.white, lineWidth: 1.5))
                .frame(width: 18, height: 22)
            NameTag(name: name, color: color).offset(x: 12, y: 16)
        }
    }
}

/// `M2 1.5L16 11.1l-7.1 1.2-3.7 7.1L2 1.5z` in an 18×22 box.
struct CursorArrow: Shape {
    func path(in rect: CGRect) -> Path {
        let sx = rect.width / 18, sy = rect.height / 22
        var path = Path()
        path.move(to: CGPoint(x: 2 * sx, y: 1.5 * sy))
        path.addLine(to: CGPoint(x: 16 * sx, y: 11.1 * sy))
        path.addLine(to: CGPoint(x: 8.9 * sx, y: 12.3 * sy))
        path.addLine(to: CGPoint(x: 5.2 * sx, y: 19.4 * sy))
        path.closeSubpath()
        return path
    }
}

// MARK: - Invite dialog (CanvasInviteDialog.tsx)

private struct CollaborationInviteDialog: ViewModifier {
    let model: CollaborationChromeModel

    func body(content: Content) -> some View {
        let invite = model.state.pendingInvite
        content.alert(
            invite.map { "Open “\($0.name)”?" } ?? "Open shared canvas?",
            isPresented: Binding(get: { model.state.pendingInvite != nil }, set: { if !$0 { model.dismissInvite() } })
        ) {
            Button("Open canvas") { model.acceptInvite() }
            Button("Not now", role: .cancel) { model.dismissInvite() }
        } message: {
            Text("This canvas is shared with you. Opening it adds it to your board and keeps it in sync with everyone else on it, so their changes replace what this canvas holds on this device. Only open canvases from people you trust.")
        }
    }
}

public extension View {
    /// The consent gate for a shared-canvas link.
    func collaborationInviteDialog(_ model: CollaborationChromeModel?) -> some View {
        Group {
            if let model { self.modifier(CollaborationInviteDialog(model: model)) } else { self }
        }
    }
}
