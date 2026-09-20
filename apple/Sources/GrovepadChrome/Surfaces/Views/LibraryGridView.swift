import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The library: workspaces as a grid of blocks (two-up on a phone, wider on
// larger screens), each opening its canvases. Rename, reorder, delete and
// create are visible row actions — never hover-revealed — and deletion is
// confirmed with the same compact dialog the web uses.
// ---------------------------------------------------------------------------

public struct LibraryGridView: View {
    @Environment(\.chromeAdaptation) private var adaptation
    @Bindable private var model: LibraryModel
    @State private var newName = ""
    @State private var renameText = ""
    @State private var openWorkspaceId: String?

    public init(model: LibraryModel) { self._model = Bindable(model) }

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 10), count: adaptation.isPhone ? 2 : 3)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                GlassLabel("Workspaces")
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(model.workspaces, id: \.id) { workspace in
                        workspaceBlock(workspace)
                    }
                    newWorkspaceBlock
                }
                if let open = openWorkspaceId ?? model.workspaces.first(where: \.isActive)?.id {
                    GlassLabel("Canvases in \(model.document.board.workspaces[open]?.name ?? "workspace")")
                    canvasList(in: open)
                }
            }
            .padding(12)
        }
        .chromePanel(isPresented: Binding(get: { model.deleteTarget != nil }, set: { if !$0 { model.deleteTarget = nil } })) {
            if let target = model.deleteTarget {
                ConfirmDialogView(model: .deleteWorkspace(named: target.name, onConfirm: { model.deleteWorkspace(target.id) }, onClose: { model.deleteTarget = nil }))
            }
        }
    }

    @ViewBuilder
    private func workspaceBlock(_ workspace: LibraryWorkspaceEntry) -> some View {
        Island(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Circle().fill(Color(hex: workspace.tint)).frame(width: 8, height: 8)
                    if model.renamingWorkspaceId == workspace.id {
                        TextField("Workspace name", text: $renameText)
                            .textFieldStyle(.plain)
                            .onSubmit { model.renameWorkspace(workspace.id, to: renameText) }
                    } else {
                        Text(workspace.name).font(GlassType.body).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if workspace.isActive { Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.tone("#6ee7b7", light: "#047857")) }
                }
                Text("\(workspace.canvasCount) canvases · \(workspace.widgetCount) cards").font(GlassType.label).foregroundStyle(.secondary)
                HStack(spacing: 0) {
                    GhostButton("pencil", label: "Rename \(workspace.name)") {
                        renameText = workspace.name
                        model.renamingWorkspaceId = workspace.id
                    }
                    GhostButton("arrow.up", label: "Move \(workspace.name) up") { model.moveWorkspace(workspace.id, by: -1) }
                    GhostButton("arrow.down", label: "Move \(workspace.name) down") { model.moveWorkspace(workspace.id, by: 1) }
                    if model.canDeleteWorkspace {
                        GhostButton("trash", label: "Delete \(workspace.name)") { model.deleteTarget = workspace }
                    }
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            openWorkspaceId = workspace.id
            model.switchWorkspace(workspace.id)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Workspace \(workspace.name)")
        .accessibilityAddTraits(.isButton)
    }

    private var newWorkspaceBlock: some View {
        Island(padding: 10) {
            if model.creatingWorkspace {
                HStack {
                    TextField("Workspace name…", text: $newName)
                        .textFieldStyle(.plain)
                        .onSubmit {
                            model.createWorkspace(named: newName)
                            newName = ""
                        }
                    GhostButton("xmark", label: "Cancel new workspace") { model.creatingWorkspace = false }
                }
                .frame(minHeight: GlassTokens.touchTarget)
            } else {
                Button { model.creatingWorkspace = true } label: {
                    Label("New workspace", systemImage: "plus").font(GlassType.body).frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func canvasList(in workspaceId: String) -> some View {
        Well {
            VStack(spacing: 0) {
                ForEach(model.canvases(in: workspaceId), id: \.id) { canvas in
                    HStack(spacing: 8) {
                        Image(systemName: canvas.isRoot ? "house" : "doc").font(.system(size: 11)).foregroundStyle(.secondary)
                        Button { model.openCanvas(canvas.id) } label: {
                            HStack {
                                Text(canvas.name).font(GlassType.body).foregroundStyle(canvas.isActive ? Color.tone("#c4b5fd", light: "#6d28d9") : Color.primary).lineLimit(1)
                                Spacer()
                                Text("\(canvas.cardCount)").font(GlassType.label).foregroundStyle(.tertiary)
                            }
                            .frame(minHeight: GlassTokens.touchTarget)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Open \(canvas.name), \(canvas.cardCount) cards")
                        if !canvas.isRoot {
                            GhostButton("trash", label: "Delete \(canvas.name)") { model.deleteCanvas(canvas.id) }
                        }
                    }
                }
            }
        }
    }
}
