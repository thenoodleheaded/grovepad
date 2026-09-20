import Foundation
import Observation
import GrovepadCore

// ---------------------------------------------------------------------------
// The library: workspaces and their canvases. On the web this is the
// workspace dropdown in `CanvasToolbar.tsx` (create / rename / reorder /
// delete / switch) and the canvas rows of `CanvasTreeDrawer.tsx`; the phone
// gets them as one grid screen (roadmap phase 5 "library grid"). Every
// mutation is the document's; the model only sorts, counts and asks.
// ---------------------------------------------------------------------------

public struct LibraryWorkspaceEntry: Equatable, Sendable {
    public var id: String
    public var name: String
    public var tint: String
    public var canvasCount: Int
    public var widgetCount: Int
    public var isActive: Bool
}

public struct LibraryCanvasEntry: Equatable, Sendable {
    public var id: String
    public var name: String
    public var parentCanvasId: String?
    public var cardCount: Int
    public var isRoot: Bool
    public var isActive: Bool
}

@Observable
public final class LibraryModel {
    public let document: BoardDocument
    public let tabs: CanvasTabsModel
    public let chrome: ChromeState
    public var creatingWorkspace = false
    public var renamingWorkspaceId: String?
    public var deleteTarget: LibraryWorkspaceEntry?
    @ObservationIgnored public var requestDeletion: (([String]) -> Void)?
    @ObservationIgnored public var toast: ((String) -> Void)?
    @ObservationIgnored private let mint: IdMinter?
    @ObservationIgnored private let clock: Clock

    public init(document: BoardDocument, tabs: CanvasTabsModel, chrome: ChromeState, mint: IdMinter? = nil, clock: Clock = .system) {
        self.document = document
        self.tabs = tabs
        self.chrome = chrome
        self.mint = mint
        self.clock = clock
    }

    /// Workspaces in row order (`sortIndex ?? createdAt`).
    public var workspaces: [LibraryWorkspaceEntry] {
        let board = document.board
        return document.orderedWorkspaces.map { workspace in
            let canvasIds = Set(board.canvases.values.filter { $0.workspaceId == workspace.id }.map(\.id))
            return LibraryWorkspaceEntry(
                id: workspace.id, name: workspace.name, tint: workspace.tint ?? "#64748b",
                canvasCount: canvasIds.count,
                widgetCount: board.widgets.values.filter { canvasIds.contains($0.canvasId) }.count,
                isActive: workspace.id == document.activeWorkspaceId
            )
        }
    }

    /// The canvases of one workspace: root first, then by name.
    public func canvases(in workspaceId: String) -> [LibraryCanvasEntry] {
        let board = document.board
        let root = board.workspaces[workspaceId]?.rootCanvasId
        return board.canvases.values
            .filter { $0.workspaceId == workspaceId }
            .sorted { lhs, rhs in
                if (lhs.id == root) != (rhs.id == root) { return lhs.id == root }
                let byName = lhs.name.compare(rhs.name)
                return byName == .orderedSame ? lhs.id < rhs.id : byName == .orderedAscending
            }
            .map { canvas in
                LibraryCanvasEntry(
                    id: canvas.id, name: canvas.name, parentCanvasId: canvas.parentCanvasId,
                    cardCount: board.widgets.values.filter { $0.canvasId == canvas.id && $0.type != "canvas_node" }.count,
                    isRoot: canvas.id == root, isActive: canvas.id == document.activeCanvasId
                )
            }
    }

    public var canDeleteWorkspace: Bool { document.canDeleteWorkspace }

    @discardableResult
    public func createWorkspace(named name: String) -> String {
        let id = document.createWorkspace(name: name, mint: mint, clock: clock)
        tabs.resolve()
        creatingWorkspace = false
        toast?("Workspace “\(document.board.workspaces[id]?.name ?? name)” created")
        return id
    }

    public func renameWorkspace(_ id: String, to name: String) {
        document.renameWorkspace(id, name: name)
        renamingWorkspaceId = nil
    }

    public func reorderWorkspace(_ sourceId: String, before targetId: String) {
        document.reorderWorkspace(sourceId, before: targetId)
    }

    /// Up/down buttons for a finger (the web's `gp-workspace-reorder`).
    public func moveWorkspace(_ id: String, by delta: Int) {
        let ordered = document.orderedWorkspaces
        guard let index = ordered.firstIndex(where: { $0.id == id }) else { return }
        let target = index + delta
        guard ordered.indices.contains(target) else { return }
        if delta < 0 { document.reorderWorkspace(id, before: ordered[target].id) } else { document.reorderWorkspace(ordered[target].id, before: id) }
    }

    /// Deletion is confirmed first (`deleteTarget`), then run here.
    public func deleteWorkspace(_ id: String) {
        guard let name = document.board.workspaces[id]?.name else { return }
        document.deleteWorkspace(id)
        tabs.resolve()
        deleteTarget = nil
        toast?("Deleted workspace “\(name)”")
    }

    public func switchWorkspace(_ id: String) {
        document.switchWorkspace(id, lastVisitedCanvasId: chrome.lastVisitedCanvas(in: id, board: document.board))
        tabs.resolve()
        chrome.recordVisit(document.activeCanvasId)
    }

    /// Open a canvas; ⌘ opens a background tab as everywhere else.
    public func openCanvas(_ canvasId: String, inBackgroundTab: Bool = false) {
        if inBackgroundTab { tabs.open(canvasId, activate: false); return }
        tabs.navigate(to: canvasId)
        chrome.recordVisit(canvasId)
    }

    /// A canvas is created the way the document creates canvases: as a
    /// canvas card on the parent canvas (the "door"), at a world point.
    @discardableResult
    public func createCanvas(named name: String, under parentCanvasId: String, at position: Vector2D) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, document.board.canvases.contains(parentCanvasId) else { return nil }
        if parentCanvasId != document.activeCanvasId { tabs.navigate(to: parentCanvasId) }
        guard let door = document.createWidget(type: "canvas_node", at: position, title: trimmed, mint: mint) else { return nil }
        return document.widget(door)?.data.string("canvasId")
    }

    public func renameCanvas(_ canvasId: String, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        document.renameCanvas(canvasId, name: trimmed)
    }

    /// A nested canvas goes through its door card and the deletion dialog;
    /// a root canvas cannot be deleted (delete the workspace instead).
    public func deleteCanvas(_ canvasId: String) {
        guard let owner = document.ownerCanvasNode(of: canvasId) else { return }
        requestDeletion?([owner.id])
    }
}
