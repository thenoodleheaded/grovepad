import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The Mac and iPad sidebar: the web's workspace switcher, library and canvas
// tree drawer (`CanvasToolbar.tsx` workspace menu, `CanvasTreeDrawer.tsx`)
// as ONE system source list — the same sidebar Finder, Notes and Mail use.
//
//   top      the workspace switcher, a system menu (switch, new, rename,
//            delete), like the account picker in Mail
//   list     the active workspace's canvas outline: canvases with their
//            cards beneath, the open canvas selected with the system
//            accent highlight; rows carry native context menus
//   bottom   New Canvas
//
// Phones keep the drawer (a sheet); this view is for regular widths.
// ---------------------------------------------------------------------------

public struct BoardSidebarView: View {
    @Bindable private var tree: CanvasTreeModel
    @Bindable private var library: LibraryModel
    private let camera: ChromeCamera?

    @State private var renameText = ""
    @State private var prompt: SidebarPrompt?
    @State private var promptText = ""

    public init(tree: CanvasTreeModel, library: LibraryModel, camera: ChromeCamera?) {
        self._tree = Bindable(tree)
        self._library = Bindable(library)
        self.camera = camera
    }

    private var document: BoardDocument { tree.document }

    /// The list's selection is the open canvas (or a focused card row).
    private var selection: Binding<String?> {
        Binding(
            get: { "canvas:\(document.activeCanvasId)" },
            set: { key in
                guard let key else { return }
                if key.hasPrefix("canvas:") {
                    let id = String(key.dropFirst("canvas:".count))
                    if id != document.activeCanvasId { tree.open(id) }
                } else if key.hasPrefix("widget:") {
                    tree.activateWidget(String(key.dropFirst("widget:".count)))
                }
            }
        )
    }

    public var body: some View {
        List(selection: selection) {
            Section {
                ForEach(tree.entries, id: \.key) { entry in
                    row(entry)
                }
            } header: {
                Text("Canvases")
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .top, spacing: 0) {
            workspaceSwitcher
                .padding(.horizontal, 10)
                .padding(.top, 4)
                .padding(.bottom, 6)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                Button { beginPrompt(.newCanvas) } label: {
                    Label("New Canvas", systemImage: "plus")
                        .font(.grove(size: 12, weight: .medium))
                }
                .buttonStyle(.borderless)
                .help("Add a canvas inside the one that is open")
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .alert(prompt?.title ?? "", isPresented: Binding(get: { prompt != nil }, set: { if !$0 { prompt = nil } })) {
            TextField(prompt?.placeholder ?? "", text: $promptText)
            Button("Cancel", role: .cancel) { prompt = nil }
            Button(prompt?.confirm ?? "OK") { commitPrompt() }
                .disabled(promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .confirmationDialog(
            "Delete “\(library.deleteTarget?.name ?? "")”?",
            isPresented: Binding(get: { library.deleteTarget != nil }, set: { if !$0 { library.deleteTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete workspace", role: .destructive) {
                if let target = library.deleteTarget { library.deleteWorkspace(target.id) }
            }
            Button("Cancel", role: .cancel) { library.deleteTarget = nil }
        } message: {
            Text("Every canvas, widget, connection, and glue cluster inside this workspace will be removed. You can immediately undo this from the confirmation toast.")
        }
        .confirmationDialog(
            "Move “\(tree.movingCanvasId.flatMap { document.canvasName($0) } ?? "canvas")” to…",
            isPresented: Binding(get: { tree.movingCanvasId != nil }, set: { if !$0 { tree.movingCanvasId = nil } }),
            titleVisibility: .visible
        ) {
            ForEach(tree.moveTargets, id: \.id) { target in
                Button(target.name) { tree.move(to: target.id) }
            }
            Button("Cancel", role: .cancel) { tree.movingCanvasId = nil }
        }
    }

    // MARK: Workspace switcher

    private var activeWorkspace: LibraryWorkspaceEntry? { library.workspaces.first(where: \.isActive) }

    private var workspaceSwitcher: some View {
        Menu {
            ForEach(library.workspaces, id: \.id) { workspace in
                Button {
                    library.switchWorkspace(workspace.id)
                } label: {
                    if workspace.isActive {
                        Label(workspace.name, systemImage: "checkmark")
                    } else {
                        Text(workspace.name)
                    }
                }
            }
            Divider()
            Button("New Workspace…") { beginPrompt(.newWorkspace) }
            if let active = activeWorkspace {
                Button("Rename “\(active.name)”…") { beginPrompt(.renameWorkspace(active.id), text: active.name) }
                Button("Move Up") { library.moveWorkspace(active.id, by: -1) }
                Button("Move Down") { library.moveWorkspace(active.id, by: 1) }
                if library.canDeleteWorkspace {
                    Divider()
                    Button("Delete “\(active.name)”…", role: .destructive) { library.deleteTarget = active }
                }
            }
        } label: {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color(hex: activeWorkspace?.tint ?? "#34d399").gradient)
                    .frame(width: 22, height: 22)
                    .overlay(
                        Text(String((activeWorkspace?.name ?? "W").prefix(1)).uppercased())
                            .font(.grove(size: 11, weight: .bold))
                            .foregroundStyle(.white)
                    )
                VStack(alignment: .leading, spacing: 0) {
                    Text(activeWorkspace?.name ?? "Workspace")
                        .font(.grove(size: 13, weight: .semibold))
                        .lineLimit(1)
                    if let active = activeWorkspace {
                        Text("\(active.canvasCount) canvases · \(active.widgetCount) cards")
                            .font(.grove(size: 10.5))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .background(Color.lift.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityLabel("Workspace: \(activeWorkspace?.name ?? "Workspace")")
    }

    // MARK: Rows

    @ViewBuilder
    private func row(_ entry: CanvasOutlineEntry) -> some View {
        let indent = CGFloat(max(entry.level - 1, 0)) * 14
        switch entry.kind {
        case .canvas:
            if let canvas = document.canvas(entry.id) {
                canvasRow(canvas, indent: indent)
                    .tag("canvas:\(canvas.id)")
            }
        case .widget:
            if let widget = document.widget(entry.id) {
                widgetRow(widget, indent: indent)
                    .tag("widget:\(widget.id)")
            }
        }
    }

    private func canvasRow(_ canvas: CanvasMeta, indent: CGFloat) -> some View {
        let isRoot = canvas.parentCanvasId == nil
        return HStack(spacing: 4) {
            Button { tree.toggleExpanded(canvas.id) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .rotationEffect(.degrees(tree.isExpanded(canvas.id) ? 90 : 0))
                    .foregroundStyle(.secondary)
                    .frame(width: 14, height: 14)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(tree.hasChildren(canvas.id) ? 1 : 0)
            .disabled(!tree.hasChildren(canvas.id))
            .accessibilityLabel(tree.isExpanded(canvas.id) ? "Collapse \(canvas.name)" : "Expand \(canvas.name)")
            if tree.renamingCanvasId == canvas.id {
                TextField("Canvas name", text: $renameText)
                    .textFieldStyle(.plain)
                    .font(.grove(size: 13, weight: .medium))
                    .onSubmit { tree.rename(canvas.id, to: renameText) }
                    #if os(macOS)
                    .onExitCommand { tree.renamingCanvasId = nil }
                    #endif
            } else {
                Label {
                    Text(canvas.name).font(.grove(size: 13, weight: .medium)).lineLimit(1)
                } icon: {
                    Image(systemName: isRoot ? "house" : "rectangle.on.rectangle")
                }
                Spacer(minLength: 4)
                Text("\(tree.cardCount(canvas.id))")
                    .font(.grove(size: 11).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.leading, indent)
        .contextMenu {
            Button("Open") { tree.open(canvas.id) }
            Button("Open in New Tab") { tree.openInBackgroundTab(canvas.id) }
            Divider()
            Button("Rename…") {
                renameText = canvas.name
                tree.renamingCanvasId = canvas.id
            }
            if tree.canMoveOrDelete(canvas.id) {
                Button("Move to…") { tree.movingCanvasId = canvas.id }
                Divider()
                Button("Delete…", role: .destructive) { tree.deleteCanvas(canvas.id) }
            }
        }
        .accessibilityLabel("\(canvas.name), \(tree.cardCount(canvas.id)) cards")
    }

    private func widgetRow(_ widget: Widget, indent: CGFloat) -> some View {
        let definition = WidgetRegistry.definition(for: widget.type)
        let accent = Color.inked(CardAccent.accent(for: widget))
        return HStack(spacing: 8) {
            Image(systemName: WidgetSymbols.symbol(for: widget.type, skin: definition?.skinValue(in: widget.data) ?? ""))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: 18, height: 18)
                .background(accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
            VStack(alignment: .leading, spacing: 0) {
                Text(widget.title.isEmpty ? "Untitled" : widget.title)
                    .font(.grove(size: 12))
                    .lineLimit(1)
                Text(definition?.label ?? widget.type)
                    .font(.grove(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if widget.metadata.favorite {
                Image(systemName: "star.fill").font(.system(size: 8)).foregroundStyle(Color(hex: "#fbbf24"))
            }
        }
        .padding(.leading, indent + 18)
        .accessibilityLabel("\(widget.title), \(definition?.label ?? widget.type) card")
    }

    // MARK: Prompts

    private func beginPrompt(_ kind: SidebarPrompt, text: String = "") {
        promptText = text
        prompt = kind
    }

    private func commitPrompt() {
        let text = promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        defer { prompt = nil }
        guard !text.isEmpty, let prompt else { return }
        switch prompt {
        case .newWorkspace:
            library.createWorkspace(named: text)
        case .renameWorkspace(let id):
            library.renameWorkspace(id, to: text)
        case .newCanvas:
            let at = camera?.viewCenterWorld ?? .zero
            let parent = document.activeCanvasId
            if library.createCanvas(named: text, under: parent, at: at) != nil { tree.collapsed.remove(parent) }
        }
    }
}

enum SidebarPrompt: Equatable {
    case newWorkspace
    case renameWorkspace(String)
    case newCanvas

    var title: String {
        switch self {
        case .newWorkspace: return "New Workspace"
        case .renameWorkspace: return "Rename Workspace"
        case .newCanvas: return "New Canvas"
        }
    }

    var placeholder: String {
        switch self {
        case .newWorkspace, .renameWorkspace: return "Workspace name"
        case .newCanvas: return "Canvas name"
        }
    }

    var confirm: String {
        switch self {
        case .newWorkspace, .newCanvas: return "Create"
        case .renameWorkspace: return "Rename"
        }
    }
}
