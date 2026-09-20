import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Where am I, and how do I get elsewhere — one glass pill, bottom-left.
//
//   ‹ ›           the camera trail (Back / Forward, ⌘[ ⌘])
//   folder        the workspace's root canvas ("Origin"); click to go there
//   Workspace ⌃   a menu that opens upward: switch workspace, or make one
//   › crumbs      the canvases from the root to the open one; every crumb
//                 but the last is a button, and the last lists the canvases
//                 inside it, so going deeper is one click too
//
// The web spreads these over the top bar (`CanvasToolbar.tsx`: workspace
// dropdown, arrows, `CanvasBreadcrumbs`); the Mac gathers them here so the
// title-bar row stays quiet.
// ---------------------------------------------------------------------------

public struct CanvasNavigationPill: View {
    private let toolbar: ToolbarModel
    private let library: LibraryModel
    @State private var creatingWorkspace = false
    @State private var newWorkspaceName = ""

    public init(toolbar: ToolbarModel, library: LibraryModel) {
        self.toolbar = toolbar
        self.library = library
    }

    private var document: BoardDocument { toolbar.document }
    private var rootCanvasId: String? { toolbar.tabs.rootCanvasId }

    /// The path below the root: what sits to the right of the workspace.
    private var crumbs: [Breadcrumb] {
        let path = document.canvasPath(to: document.activeCanvasId)
        return path.dropFirst().enumerated().map { index, canvas in
            Breadcrumb(canvasId: canvas.id, name: canvas.name, isCurrent: index == path.count - 2)
        }
    }

    /// Canvases whose parent is `canvasId`, in board order.
    private func children(of canvasId: String) -> [CanvasMeta] {
        document.board.canvases.values.filter { $0.parentCanvasId == canvasId }
    }

    public var body: some View {
        ChromePlate(padding: 4, radius: 22) {
            HStack(spacing: 2) {
                pillButton("chevron.left", label: "Back (⌘[)", disabled: !toolbar.canGoBack) { toolbar.goBack() }
                pillButton("chevron.right", label: "Forward (⌘])", disabled: !toolbar.canGoForward) { toolbar.goForward() }
                separator
                pillButton(crumbs.isEmpty ? "folder.fill" : "folder", label: "Open the workspace's root canvas", disabled: crumbs.isEmpty) {
                    if let rootCanvasId { toolbar.tabs.navigate(to: rootCanvasId); toolbar.chrome.recordVisit(rootCanvasId) }
                }
                workspaceMenu
                ForEach(Array(crumbs.enumerated()), id: \.offset) { _, crumb in
                    Image(systemName: "chevron.compact.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.tertiary)
                    crumbView(crumb)
                }
                if crumbs.isEmpty, let rootCanvasId, !children(of: rootCanvasId).isEmpty {
                    Image(systemName: "chevron.compact.right").font(.system(size: 12, weight: .medium)).foregroundStyle(.tertiary)
                    childMenu(of: rootCanvasId, title: "Canvases")
                }
            }
            .padding(.trailing, 6)
        }
        .fixedSize()
        .alert("New Workspace", isPresented: $creatingWorkspace) {
            TextField("Workspace name", text: $newWorkspaceName)
            Button("Cancel", role: .cancel) {}
            Button("Create") { library.createWorkspace(named: newWorkspaceName) }
                .disabled(newWorkspaceName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Canvas navigation")
    }

    private var separator: some View {
        Rectangle().fill(Color.lift.opacity(0.14)).frame(width: 1, height: 20).padding(.horizontal, 4)
    }

    private func pillButton(_ symbol: String, label: String, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.35 : 1)
        .help(label)
        .accessibilityLabel(label)
    }

    // MARK: Workspace (opens upward: the pill sits on the window's bottom edge)

    private var workspaceMenu: some View {
        Menu {
            ForEach(library.workspaces, id: \.id) { workspace in
                Button {
                    library.switchWorkspace(workspace.id)
                } label: {
                    if workspace.isActive { Label(workspace.name, systemImage: "checkmark") } else { Text(workspace.name) }
                }
            }
            Divider()
            Button("New Workspace…") {
                newWorkspaceName = ""
                creatingWorkspace = true
            }
        } label: {
            HStack(spacing: 5) {
                Text(toolbar.workspaceName)
                    .font(.grove(size: 13, weight: .semibold))
                    .lineLimit(1)
                Image(systemName: "chevron.up")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .frame(height: 36)
            .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .menuOrder(.fixed)
        .fixedSize()
        .help("Switch workspace")
        .accessibilityLabel("Workspace: \(toolbar.workspaceName)")
    }

    // MARK: Canvases

    @ViewBuilder
    private func crumbView(_ crumb: Breadcrumb) -> some View {
        if crumb.isCurrent, let id = crumb.canvasId, !children(of: id).isEmpty {
            childMenu(of: id, title: crumb.name)
        } else if crumb.isCurrent {
            Text(crumb.name)
                .font(.grove(size: 13, weight: .semibold))
                .lineLimit(1)
                .padding(.horizontal, 6)
                .accessibilityAddTraits(.isSelected)
        } else {
            Button { toolbar.openBreadcrumb(crumb) } label: {
                Text(crumb.name)
                    .font(.grove(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .padding(.horizontal, 6)
                    .frame(height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Open \(crumb.name)")
        }
    }

    /// A canvas name whose menu lists the canvases inside it.
    private func childMenu(of canvasId: String, title: String) -> some View {
        Menu {
            ForEach(children(of: canvasId), id: \.id) { child in
                Button(child.name) {
                    toolbar.tabs.navigate(to: child.id)
                    toolbar.chrome.recordVisit(child.id)
                }
            }
        } label: {
            HStack(spacing: 5) {
                Text(title).font(.grove(size: 13, weight: .semibold)).lineLimit(1)
                Image(systemName: "chevron.up").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 6)
            .frame(height: 36)
            .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
        .help("Canvases inside \(title)")
    }
}
