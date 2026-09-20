import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Workspace and canvas mutations (`store/slices/navigationSlice.ts`), phase 5.
// Every one runs through `commit`, so the Edit menu, ⌘Z and the mode dock
// undo them like any card edit. Tabs are device state and live in
// `CanvasTabsModel`; this file never touches them.
// ---------------------------------------------------------------------------

public extension BoardDocument {
    /// `createWorkspace`: a workspace and its "Origin" root canvas, then
    /// navigate there. Returns the workspace id.
    @discardableResult
    func createWorkspace(name: String, mint override: IdMinter? = nil, clock: Clock = .system) -> String {
        let mint = override ?? self.mint
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalName = trimmed.isEmpty ? "Untitled" : trimmed
        let workspaceId = mint()
        let rootCanvasId = mint()
        let count = board.workspaces.count
        commit("New workspace") { board in
            var workspace = Workspace(id: workspaceId, name: finalName, rootCanvasId: rootCanvasId, createdAt: clock.nowMs())
            workspace.sortIndex = Double(count)
            workspace.tint = ["#84cc16", "#60a5fa", "#a78bfa", "#f59e0b"][count % 4]
            board.workspaces[workspaceId] = workspace
            board.canvases[rootCanvasId] = CanvasMeta(id: rootCanvasId, name: "Origin", workspaceId: workspaceId, parentCanvasId: nil)
        }
        navigate(to: rootCanvasId)
        return workspaceId
    }

    /// `renameWorkspace`: blank names and no-ops are refused; keystrokes
    /// within the coalesce window fold into one undo step.
    func renameWorkspace(_ id: String, name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let existing = board.workspaces[id], existing.name != trimmed else { return }
        commit("Rename workspace", tag: "workspace-name:\(id)") { board in
            board.workspaces[id]?.name = trimmed
        }
    }

    /// The row order the library and the workspace menu show: `sortIndex`,
    /// falling back to `createdAt` for workspaces that predate ordering.
    var orderedWorkspaces: [Workspace] {
        board.workspaces.values.sorted { ($0.sortIndex ?? $0.createdAt) < ($1.sortIndex ?? $1.createdAt) }
    }

    /// `reorderWorkspace`: lift `sourceId` out of the row and drop it where
    /// `targetId` sits; every workspace is then renumbered 0…n.
    func reorderWorkspace(_ sourceId: String, before targetId: String) {
        guard sourceId != targetId, board.workspaces.contains(sourceId), board.workspaces.contains(targetId) else { return }
        let ordered = orderedWorkspaces
        guard let source = ordered.first(where: { $0.id == sourceId }) else { return }
        var remaining = ordered.filter { $0.id != sourceId }
        guard let at = remaining.firstIndex(where: { $0.id == targetId }) else { return }
        remaining.insert(source, at: at)
        commit("Reorder workspaces") { board in
            for (index, workspace) in remaining.enumerated() {
                board.workspaces[workspace.id]?.sortIndex = Double(index)
            }
        }
    }

    /// `deleteWorkspace` refuses the last workspace: the board always has one.
    var canDeleteWorkspace: Bool { board.workspaces.count > 1 }

    /// `deleteWorkspace`: the workspace, its canvases, their widgets, and every
    /// relation, wire and glue that loses a member. Standing inside it lands
    /// you on the first surviving workspace's root.
    func deleteWorkspace(_ id: String) {
        guard board.workspaces[id] != nil, canDeleteWorkspace else { return }
        // Land first, then delete: listeners announced the deletion must see
        // the surviving root as the active canvas, not a canvas being removed.
        if activeWorkspaceId == id, let landing = orderedWorkspaces.first(where: { $0.id != id }) {
            navigate(to: landing.rootCanvasId)
        }
        clearSelection()
        commit("Delete workspace") { board in
            board.workspaces.removeValue(forKey: id)
            let removedCanvasIds = Set(board.canvases.values.filter { $0.workspaceId == id }.map(\.id))
            board.canvases = board.canvases.filter { _, canvas in canvas.workspaceId != id }
            board.widgets = board.widgets.filter { _, widget in !removedCanvasIds.contains(widget.canvasId) }
            board.relations = board.relations.filter { _, relation in
                board.widgets.contains(relation.fromId) && board.widgets.contains(relation.toId)
            }
            board.connections = board.connections.filter { _, connection in
                board.widgets.contains(connection.fromId) && board.widgets.contains(connection.toId)
            }
            var glues = OrderedMap<WidgetGlue>()
            for (glueId, glue) in board.glues.entries {
                let survivors = glue.widgetIds.filter { board.widgets.contains($0) }
                guard survivors.count >= 2 else { continue }
                var next = glue
                if survivors.count != glue.widgetIds.count { next.widgetIds = survivors }
                glues[glueId] = next
            }
            board.glues = glues
            board.canvasViews = board.canvasViews.filter { canvasId, _ in !removedCanvasIds.contains(canvasId) }
            if board.activeWorkspaceId == id, let first = board.workspaces.values.first {
                board.activeWorkspaceId = first.id
                board.activeCanvasId = first.rootCanvasId
            }
        }
    }

    /// `switchWorkspace`: land on the canvas last visited there, else its root.
    func switchWorkspace(_ id: String, lastVisitedCanvasId: String? = nil) {
        guard let workspace = board.workspaces[id] else { return }
        if let remembered = lastVisitedCanvasId, board.canvases[remembered]?.workspaceId == id {
            navigate(to: remembered)
        } else {
            navigate(to: workspace.rootCanvasId)
        }
    }

    /// `updateCanvasSettings`: the grid slider is one continuous adjustment
    /// (one undo step per canvas); intensity is clamped to 0…100 and rounded.
    func updateCanvasSettings(_ canvasId: String, gridIntensity: Double? = nil, linksVisible: Bool? = nil) {
        guard board.canvases.contains(canvasId) else { return }
        commit("Canvas settings", tag: "canvas-settings:\(canvasId)") { board in
            guard var canvas = board.canvases[canvasId] else { return }
            if let gridIntensity, gridIntensity.isFinite {
                canvas.gridIntensity = min(100, max(0, jsRound(gridIntensity)))
            }
            if let linksVisible { canvas.linksVisible = linksVisible }
            board.canvases[canvasId] = canvas
        }
    }

    /// `reparentCanvas`: a root never moves, a canvas never leaves its
    /// workspace, and nothing may become its own descendant.
    func reparentCanvas(_ canvasId: String, to parentCanvasId: String) {
        guard let canvas = board.canvases[canvasId], let parent = board.canvases[parentCanvasId],
              canvas.parentCanvasId != nil, canvas.workspaceId == parent.workspaceId, canvasId != parentCanvasId else { return }
        var cursor: CanvasMeta? = parent
        while let current = cursor {
            if current.id == canvasId { return }
            cursor = current.parentCanvasId.flatMap { board.canvases[$0] }
        }
        commit("Move canvas") { board in
            board.canvases[canvasId]?.parentCanvasId = parentCanvasId
        }
    }

    /// `updateWidgetsMetadata({ strictHold })`: nil clears the node's own
    /// answer so it inherits again.
    func setStrictHold(_ ids: [String], _ strict: Bool?) {
        let changing = ids.filter { board.widgets.contains($0) }
        guard !changing.isEmpty else { return }
        commit(strict == false ? "Release strict hold" : "Hold family strictly") { board in
            for id in changing {
                guard var widget = board.widgets[id] else { continue }
                var metadata = widget.metadata
                // Written raw: the typed setter drops `false`, but a released
                // family is stored as an explicit `strictHold: false` on the web.
                metadata.record["strictHold"] = strict.map(JSONValue.bool)
                widget.metadata = metadata
                board.widgets[id] = widget
            }
        }
    }

    /// The canvas card that owns a nested canvas, if any (roots have none).
    func ownerCanvasNode(of canvasId: String) -> Widget? {
        board.widgets.values.first { $0.type == "canvas_node" && $0.data.string("canvasId") == canvasId }
    }

    /// Origin → … → current, as the breadcrumbs and the palette preview read it.
    func canvasPath(to canvasId: String) -> [CanvasMeta] {
        var path: [CanvasMeta] = []
        var cursor = board.canvases[canvasId]
        var seen = Set<String>()
        while let canvas = cursor, seen.insert(canvas.id).inserted {
            path.insert(canvas, at: 0)
            cursor = canvas.parentCanvasId.flatMap { board.canvases[$0] }
        }
        return path
    }

    /// `resolveStrictHold`: the node's own flag, else the nearest released
    /// ancestor's along parent edges, else hard.
    func resolveStrictHold(_ widgetId: String) -> (strict: Bool, inheritedFrom: String?) {
        if let own = board.widgets[widgetId]?.metadata.record.bool("strictHold") { return (own, nil) }
        var parents: [String: [String]] = [:]
        for relation in board.relations.values where relation.type == .parent {
            parents[relation.toId, default: []].append(relation.fromId)
        }
        var seen: Set<String> = [widgetId]
        var queue = parents[widgetId] ?? []
        while !queue.isEmpty {
            let id = queue.removeFirst()
            guard seen.insert(id).inserted, let widget = board.widgets[id] else { continue }
            if let flag = widget.metadata.record.bool("strictHold") { return (flag, id) }
            queue.append(contentsOf: parents[id] ?? [])
        }
        return (true, nil)
    }

    /// Whether a node has parent-linked children (a family to hold).
    func hasFamily(_ widgetId: String) -> Bool {
        board.relations.values.contains { $0.type == .parent && $0.fromId == widgetId }
    }
}
