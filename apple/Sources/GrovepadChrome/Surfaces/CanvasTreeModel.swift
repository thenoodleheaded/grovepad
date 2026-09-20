import Foundation
import Observation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The canvas tree drawer (`CanvasTreeDrawer.tsx`, `utils/canvasOutline.ts`,
// `utils/canvasTreePolicy.ts`). Canvas hierarchy is structural; cards inside
// a canvas read top-to-bottom then left-to-right; canvas-node cards are
// omitted because their target canvases already appear. Expand/collapse is
// native-only state (the web drawer is always fully open).
// ---------------------------------------------------------------------------

public struct CanvasOutlineEntry: Equatable, Hashable, Sendable {
    public enum Kind: String, Sendable { case canvas, widget }
    public var key: String
    public var kind: Kind
    public var id: String
    public var level: Int
    public var parentKey: String?
}

public enum CanvasOutlineNavigation: Sendable { case up, down, left, right, home, end }

public enum CanvasOutline {
    static func canvasKey(_ id: String) -> String { "canvas:\(id)" }
    static func widgetKey(_ id: String) -> String { "widget:\(id)" }

    /// `buildCanvasOutline`, with an optional collapsed set: a collapsed
    /// canvas still lists, but nothing beneath it does.
    public static func build(board: Board, workspaceId: String, rootCanvasId: String, collapsed: Set<String> = []) -> [CanvasOutlineEntry] {
        var childCanvases: [String?: [CanvasMeta]] = [:]
        for canvas in board.canvases.values where canvas.workspaceId == workspaceId {
            childCanvases[canvas.parentCanvasId, default: []].append(canvas)
        }
        for key in childCanvases.keys {
            childCanvases[key]!.sort { lhs, rhs in
                let byName = lhs.name.compare(rhs.name)
                return byName == .orderedSame ? lhs.id < rhs.id : byName == .orderedAscending
            }
        }
        var canvasWidgets: [String: [Widget]] = [:]
        for widget in board.widgets.values where widget.type != "canvas_node" {
            guard let canvas = board.canvases[widget.canvasId], canvas.workspaceId == workspaceId else { continue }
            canvasWidgets[widget.canvasId, default: []].append(widget)
        }
        for key in canvasWidgets.keys {
            canvasWidgets[key]!.sort { lhs, rhs in
                if lhs.position.y != rhs.position.y { return lhs.position.y < rhs.position.y }
                if lhs.position.x != rhs.position.x { return lhs.position.x < rhs.position.x }
                let byTitle = lhs.title.compare(rhs.title)
                return byTitle == .orderedSame ? lhs.id < rhs.id : byTitle == .orderedAscending
            }
        }
        var entries: [CanvasOutlineEntry] = []
        func walk(_ canvasId: String, level: Int, parentKey: String?) {
            guard let canvas = board.canvases[canvasId], canvas.workspaceId == workspaceId else { return }
            let key = canvasKey(canvas.id)
            entries.append(CanvasOutlineEntry(key: key, kind: .canvas, id: canvas.id, level: level, parentKey: parentKey))
            if collapsed.contains(canvas.id) { return }
            for widget in canvasWidgets[canvas.id] ?? [] {
                entries.append(CanvasOutlineEntry(key: widgetKey(widget.id), kind: .widget, id: widget.id, level: level + 1, parentKey: key))
            }
            for child in childCanvases[canvas.id] ?? [] {
                walk(child.id, level: level + 1, parentKey: key)
            }
        }
        walk(rootCanvasId, level: 1, parentKey: nil)
        return entries
    }

    /// `nextCanvasOutlineKey`.
    public static func next(_ entries: [CanvasOutlineEntry], from currentKey: String, _ key: CanvasOutlineNavigation) -> String {
        guard !entries.isEmpty else { return currentKey }
        let index = max(0, entries.firstIndex { $0.key == currentKey } ?? -1)
        let current = entries[index]
        switch key {
        case .home: return entries[0].key
        case .end: return entries[entries.count - 1].key
        case .up: return entries[max(0, index - 1)].key
        case .down: return entries[min(entries.count - 1, index + 1)].key
        case .left: return current.parentKey ?? current.key
        case .right: return entries.first { $0.parentKey == current.key }?.key ?? current.key
        }
    }

    /// `canvasParentTargets`: legal reparent targets, own subtree and the
    /// current parent excluded, by name.
    public static func parentTargets(board: Board, canvasId: String) -> [CanvasMeta] {
        guard let moving = board.canvases[canvasId] else { return [] }
        return board.canvases.values.filter { candidate in
            if candidate.workspaceId != moving.workspaceId || candidate.id == canvasId || candidate.id == moving.parentCanvasId { return false }
            var cursor: CanvasMeta? = candidate
            while let current = cursor {
                if current.id == canvasId { return false }
                cursor = current.parentCanvasId.flatMap { board.canvases[$0] }
            }
            return true
        }.sorted { $0.name.compare($1.name) == .orderedAscending }
    }
}

@Observable
public final class CanvasTreeModel {
    public let document: BoardDocument
    public let tabs: CanvasTabsModel
    public let chrome: ChromeState
    public var collapsed: Set<String> = []
    public var renamingCanvasId: String?
    public var movingCanvasId: String?
    /// The keyboard cursor over the outline.
    public var focusedKey: String?
    @ObservationIgnored public var camera: ChromeCamera?
    @ObservationIgnored public var requestDeletion: (([String]) -> Void)?

    public init(document: BoardDocument, tabs: CanvasTabsModel, chrome: ChromeState, camera: ChromeCamera? = nil) {
        self.document = document
        self.tabs = tabs
        self.chrome = chrome
        self.camera = camera
    }

    public var workspace: Workspace? { document.board.workspaces[document.activeWorkspaceId] }

    public var entries: [CanvasOutlineEntry] {
        guard let workspace else { return [] }
        return CanvasOutline.build(board: document.board, workspaceId: workspace.id, rootCanvasId: workspace.rootCanvasId, collapsed: collapsed)
    }

    public func isExpanded(_ canvasId: String) -> Bool { !collapsed.contains(canvasId) }

    public func toggleExpanded(_ canvasId: String) {
        if collapsed.contains(canvasId) { collapsed.remove(canvasId) } else { collapsed.insert(canvasId) }
    }

    public func hasChildren(_ canvasId: String) -> Bool {
        document.board.canvases.values.contains { $0.parentCanvasId == canvasId }
            || document.board.widgets.values.contains { $0.canvasId == canvasId && $0.type != "canvas_node" }
    }

    public func cardCount(_ canvasId: String) -> Int {
        document.board.widgets.values.filter { $0.canvasId == canvasId && $0.type != "canvas_node" }.count
    }

    public func moveFocus(_ key: CanvasOutlineNavigation) {
        let list = entries
        focusedKey = CanvasOutline.next(list, from: focusedKey ?? list.first?.key ?? "", key)
    }

    /// `openCanvasFromClick`: plain → navigate here; ⌘ → background tab;
    /// ⌘⇧ → new tab and go there.
    public func open(_ canvasId: String, command: Bool = false, shift: Bool = false) {
        guard document.board.canvases.contains(canvasId) else { return }
        if command { tabs.open(canvasId, activate: shift) } else { tabs.navigate(to: canvasId) }
        chrome.recordVisit(canvasId)
    }

    /// Middle-click / "Open in new tab" row action.
    public func openInBackgroundTab(_ canvasId: String) { tabs.open(canvasId, activate: false) }

    /// A card row: go to its canvas, select it, frame it.
    public func activateWidget(_ widgetId: String) {
        guard let widget = document.widget(widgetId) else { return }
        if widget.canvasId != document.activeCanvasId { tabs.navigate(to: widget.canvasId) }
        document.select(widgetId)
        camera?.fitRect(widget.frame, padding: 180)
    }

    public func rename(_ canvasId: String, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { document.renameCanvas(canvasId, name: trimmed) }
        renamingCanvasId = nil
    }

    public var moveTargets: [CanvasMeta] {
        movingCanvasId.map { CanvasOutline.parentTargets(board: document.board, canvasId: $0) } ?? []
    }

    public func move(to parentCanvasId: String) {
        guard let moving = movingCanvasId else { return }
        document.reparentCanvas(moving, to: parentCanvasId)
        movingCanvasId = nil
    }

    /// A nested canvas is deleted through its door card, with the dialog.
    public func deleteCanvas(_ canvasId: String) {
        guard let owner = document.ownerCanvasNode(of: canvasId) else { return }
        requestDeletion?([owner.id])
    }

    public func canMoveOrDelete(_ canvasId: String) -> Bool { document.board.canvases[canvasId]?.parentCanvasId != nil }

    public func close() {
        movingCanvasId = nil
        renamingCanvasId = nil
        chrome.treeOpen = false
    }
}
