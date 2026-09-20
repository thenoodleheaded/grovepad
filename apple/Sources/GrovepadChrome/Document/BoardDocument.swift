import Foundation
import Observation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The document model (roadmap decision 9): one `@Observable` owner of the
// canonical `Board`, the selection and the rest state, with one plain method
// per domain mutation mirroring the web store slices (`widgetCreationSlice`,
// `selectionSlice`, `widgetLayoutSlice`, `navigationSlice`, `circuitSlice`,
// `glueSlice`). Every user mutation registers undo through the system
// `UndoManager` by snapshotting the Board value before it ran; engine wire
// deliveries (`applyWireWrites`) never do (circuit law 3). Nothing here
// depends on SwiftUI; persistence hangs off the `autosave` hook.
//
// Same-tag edits within `coalesceMs` fold into one undo step, as the web's
// history session does (`createHistorySession`), so typing is one step per
// pause rather than one per keystroke.
// ---------------------------------------------------------------------------

/// Undo/Redo supplied from outside the document (collaborative history).
public protocol BoardHistoryOverride: AnyObject {
    var canUndo: Bool { get }
    var canRedo: Bool { get }
    func undo()
    func redo()
}

@Observable
public final class BoardDocument {
    /// `createHistorySession` coalesce window, in ms.
    public static let coalesceMs = 900.0
    /// `createHistorySession` step limit: the oldest step falls off.
    public static let historyLimit = 100

    public private(set) var board: Board
    /// Selected widget ids, in selection order.
    public internal(set) var selection: [String] = []
    public private(set) var activeCanvasId: String
    /// The card under the pointer, if any (rest state, never persisted).
    public var hoverWidgetId: String?
    /// The card ephemerally expanded out of its resting face.
    public var expandedWidgetId: String?
    public private(set) var circuitUI = CircuitUIState()
    /// The option-drag weld a release would commit (ephemeral, never saved).
    public internal(set) var glueIntent: GlueIntent?
    /// The member an option-drag is pulling clear of its group.
    public internal(set) var unglueIntentWidgetId: String?

    /// Bumped whenever `board.widgets` changes (any edit, load or undo).
    public private(set) var widgetsVersion: UInt64 = 1
    /// Bumped whenever `board.connections` changes.
    public private(set) var connectionsVersion: UInt64 = 1

    @ObservationIgnored public var undoManager: UndoManager?
    /// Ticks whenever the undo/redo stacks may have changed. `UndoManager`
    /// is not observable, so `canUndo`/`canRedo` read this to make the
    /// Undo/Redo buttons redraw.
    public private(set) var historyVersion: UInt64 = 0
    /// Realtime collaboration: a Viewer or Commenter on a shared canvas may
    /// not change the board. Every mutation still runs (so callers get their
    /// usual return value) but against a throwaway copy, like the web's
    /// permission guards make prohibited actions inert. RLS stays the
    /// authority; this is defence in depth.
    public private(set) var editingLocked = false
    /// While a shared canvas is connected, Undo/Redo belong to collaborative
    /// history (only this person's own changes); local history is cleared on
    /// the way in and out and records nothing meanwhile.
    @ObservationIgnored public private(set) var historyOverride: BoardHistoryOverride?
    /// The app wires this to `LocalBoardStore.saveBoard`; no timers here.
    @ObservationIgnored public var autosave: ((Board) -> Void)?
    /// Loop-damping toasts and other messages for the person.
    @ObservationIgnored public var onToast: ((String) -> Void)?
    /// A trigger asked an automation-core widget to run (async, app-owned).
    @ObservationIgnored public var onExecuteAutomation: ((String) -> Void)?
    /// The resting tile a widget rests as, from the renderer registry; used
    /// to re-centre a card when it changes state (`setWidgetScaleState`).
    @ObservationIgnored public var restingTileSize: ((Widget) -> Size?)?

    @ObservationIgnored let mint: IdMinter
    @ObservationIgnored private let clock: Clock
    @ObservationIgnored private var listeners: [Int: () -> Void] = [:]
    @ObservationIgnored private var nextListener = 0
    @ObservationIgnored private var lastTag: String?
    @ObservationIgnored private var lastTagAt = -Double.infinity
    @ObservationIgnored private var gestureBefore: Board?
    @ObservationIgnored private var gestureName = ""

    public init(board: Board, undoManager: UndoManager? = nil, mint: IdMinter = .system, clock: Clock = .system) {
        self.board = board
        self.undoManager = undoManager
        undoManager?.levelsOfUndo = BoardDocument.historyLimit
        self.mint = mint
        self.clock = clock
        self.activeCanvasId = BoardDocument.resolvedActiveCanvas(board.activeCanvasId, in: board)
    }

    // MARK: - Reads

    public func widget(_ id: String) -> Widget? { board.widgets[id] }
    public func canvas(_ id: String) -> CanvasMeta? { board.canvases[id] }
    public func canvasName(_ id: String) -> String? { board.canvases[id]?.name }
    public var activeWorkspaceId: String {
        board.canvases[activeCanvasId]?.workspaceId ?? board.activeWorkspaceId
    }
    public var canUndo: Bool {
        _ = historyVersion
        if let historyOverride { return !editingLocked && historyOverride.canUndo }
        return undoManager?.canUndo ?? false
    }
    public var canRedo: Bool {
        _ = historyVersion
        if let historyOverride { return !editingLocked && historyOverride.canRedo }
        return undoManager?.canRedo ?? false
    }

    // MARK: - Undo plumbing

    /// Run one user mutation: snapshot, apply, stamp, register undo, notify.
    /// Internal (not private) so the navigation mutations in
    /// `BoardDocument+Navigation.swift` share this one undo path.
    @discardableResult
    func commit<T>(_ actionName: String, tag: String? = nil, _ body: (inout Board) -> T) -> T {
        let before = board
        var next = board
        let result = body(&next)
        guard next != before, !editingLocked else { return result }
        board = next
        if next.widgets != before.widgets { widgetsVersion &+= 1 }
        if next.connections != before.connections { connectionsVersion &+= 1 }
        if gestureBefore == nil, historyOverride == nil { registerUndo(from: before, actionName: actionName, tag: tag) }
        notify()
        return result
    }

    private func registerUndo(from before: Board, actionName: String, tag: String?) {
        let now = clock.nowMs()
        if let tag, tag == lastTag, now - lastTagAt < BoardDocument.coalesceMs {
            lastTagAt = now
            return
        }
        lastTag = tag
        lastTagAt = now
        guard let undoManager else { return }
        let opened = undoManager.groupingLevel == 0
        if opened { undoManager.beginUndoGrouping() }
        undoManager.registerUndo(withTarget: self) { document in document.restore(before, actionName: actionName) }
        undoManager.setActionName(actionName)
        if opened { undoManager.endUndoGrouping() }
        historyVersion &+= 1
    }

    /// Undo and redo both land here: the whole board value comes back and
    /// both version stamps move, so the circuit driver baselines silently.
    private func restore(_ snapshot: Board, actionName: String) {
        let current = board
        lastTag = nil
        if let undoManager {
            let opened = undoManager.groupingLevel == 0
            if opened { undoManager.beginUndoGrouping() }
            undoManager.registerUndo(withTarget: self) { document in document.restore(current, actionName: actionName) }
            undoManager.setActionName(actionName)
            if opened { undoManager.endUndoGrouping() }
        }
        board = snapshot
        widgetsVersion &+= 1
        connectionsVersion &+= 1
        selection = selection.filter { snapshot.widgets.contains($0) }
        activeCanvasId = BoardDocument.resolvedActiveCanvas(activeCanvasId, in: snapshot)
        notify()
    }

    public func undo() {
        if let historyOverride {
            if !editingLocked { historyOverride.undo() }
            return
        }
        undoManager?.undo()
    }

    public func redo() {
        if let historyOverride {
            if !editingLocked { historyOverride.redo() }
            return
        }
        undoManager?.redo()
    }

    /// A pointer gesture (drag, resize) is one undo step: the snapshot is
    /// taken here, live frames mutate freely, `endGesture` registers.
    public func beginGesture(named name: String) {
        guard gestureBefore == nil else { return }
        gestureBefore = board
        gestureName = name
    }

    public func endGesture() {
        guard let before = gestureBefore else { return }
        gestureBefore = nil
        guard historyOverride == nil else { return }
        registerUndo(from: before, actionName: gestureName, tag: nil)
    }

    private func notify() {
        historyVersion &+= 1
        for listener in listeners.values { listener() }
        autosave?(board)
    }

    // MARK: - Collaboration

    /// A shared canvas's merged remote state (`mergeCanvasIntoBoard` result):
    /// replaces the board without an undo step, drops selection and the
    /// expanded card when their widgets are gone, and notifies like any edit
    /// so autosave and the circuit driver follow.
    public func applyCollaborativeBoard(_ next: Board) {
        guard next != board else { return }
        let previous = board
        board = next
        if next.widgets != previous.widgets { widgetsVersion &+= 1 }
        if next.connections != previous.connections { connectionsVersion &+= 1 }
        selection = selection.filter { next.widgets.contains($0) }
        if let expanded = expandedWidgetId, !next.widgets.contains(expanded) { expandedWidgetId = nil }
        if let hover = hoverWidgetId, !next.widgets.contains(hover) { hoverWidgetId = nil }
        activeCanvasId = BoardDocument.resolvedActiveCanvas(activeCanvasId, in: next)
        notify()
    }

    /// Lock or unlock board mutations for a read-only collaboration role.
    public func setEditingLocked(_ locked: Bool) {
        editingLocked = locked
    }

    /// Hand Undo/Redo to collaborative history (`nil` returns them). Local
    /// history is cleared either way, as `installCollaborationPermissionGuards`
    /// and its disposer do.
    public func setHistoryOverride(_ override: BoardHistoryOverride?) {
        historyOverride = override
        lastTag = nil
        undoManager?.removeAllActions(withTarget: self)
        historyVersion &+= 1
    }

    /// `updateCanvasSettings(canvasId, { shared })`. Not an undo step: sharing
    /// is a server-side fact, and undoing the local flag would not revoke it.
    public func setCanvasShared(_ canvasId: String, shared: Bool) {
        guard var canvas = board.canvases[canvasId], canvas.shared != shared else { return }
        canvas.shared = shared
        board.canvases[canvasId] = canvas
        notify()
    }

    /// `adoptSharedCanvas`: an accepted invitation creates the canvas in the
    /// active workspace when it is new here and marks it shared. The caller
    /// opens it through the tabs model so the tab strip and camera follow.
    public func adoptSharedCanvas(_ canvasId: String, name: String) -> Bool {
        if board.canvases[canvasId] == nil {
            let workspaceId = activeWorkspaceId
            guard let workspace = board.workspaces[workspaceId] else { return false }
            var canvas = CanvasMeta(
                id: canvasId, name: name, workspaceId: workspace.id,
                parentCanvasId: workspace.rootCanvasId == canvasId ? nil : workspace.rootCanvasId
            )
            canvas.shared = true
            board.canvases[canvasId] = canvas
            notify()
        }
        setCanvasShared(canvasId, shared: true)
        return true
    }

    // MARK: - Load

    /// Replace the board wholesale (open, hydrate, sync). Both stamps move so
    /// every wire is baselined without firing; undo history is cleared.
    public func loadBoard(_ next: Board) {
        board = BoardDocument.healedGlues(next, mint: mint)
        widgetsVersion &+= 1
        connectionsVersion &+= 1
        selection = []
        expandedWidgetId = nil
        hoverWidgetId = nil
        activeCanvasId = BoardDocument.resolvedActiveCanvas(next.activeCanvasId, in: next)
        lastTag = nil
        gestureBefore = nil
        undoManager?.removeAllActions(withTarget: self)
        notify()
    }

    /// `loadBoard`'s glue heal: clusters are re-derived from what actually
    /// touches, skipping any record carrying keys this version does not know
    /// (those round-trip untouched).
    static func healedGlues(_ board: Board, mint: IdMinter) -> Board {
        let known: Set<String> = ["id", "widgetIds", "name", "collapsed", "restore", "foldedAt"]
        var healable = OrderedMap<WidgetGlue>()
        var opaque = OrderedMap<WidgetGlue>()
        for (id, glue) in board.glues.entries {
            if glue.record.keys.allSatisfy(known.contains) { healable[id] = glue } else { opaque[id] = glue }
        }
        guard let reconciled = GlueGeometry.reconcile(board.widgets, glues: healable, mint: mint) else { return board }
        var next = board
        next.glues = opaque.merging(reconciled)
        next.widgets = GlueGeometry.unfoldReleasedFoldedMembers(board.widgets, previous: board.glues, next: next.glues)
        return next
    }

    static func resolvedActiveCanvas(_ preferred: String, in board: Board) -> String {
        if board.canvases.contains(preferred) { return preferred }
        if let root = board.workspaces[board.activeWorkspaceId]?.rootCanvasId, board.canvases.contains(root) { return root }
        if let root = board.workspaces.values.first?.rootCanvasId, board.canvases.contains(root) { return root }
        return board.canvases.keys.first ?? preferred
    }

    // MARK: - Navigation and selection

    public func navigate(to canvasId: String) {
        guard board.canvases.contains(canvasId), canvasId != activeCanvasId else { return }
        activeCanvasId = canvasId
        selection = []
        expandedWidgetId = nil
    }

    /// `selectWidget`: a glued card is one welded object, so selecting a
    /// member selects its whole cluster (the unit a plain drag moves).
    public func select(_ id: String, additive: Bool = false) {
        guard board.widgets.contains(id) else { return }
        let cluster = clusterIds(of: id)
        if additive {
            if cluster.allSatisfy(selection.contains) {
                selection.removeAll(where: cluster.contains)
            } else {
                for member in cluster where !selection.contains(member) { selection.append(member) }
            }
        } else if !(selection.count == cluster.count && cluster.allSatisfy(selection.contains)) {
            selection = cluster
        }
    }

    /// The right-click exception: the menu acts on the pressed card alone,
    /// even when its whole cluster is the selection. A deliberate
    /// multi-card selection (marquee, shift-click) is left alone, and a
    /// folded group keeps the collection, having no card to aim at.
    public func selectForContextMenu(_ id: String) {
        guard board.widgets.contains(id) else { return }
        if isInFoldedCluster(id) {
            if !selection.contains(id) { select(id) }
            return
        }
        let cluster = clusterIds(of: id)
        let wholeCluster = cluster.count > 1 && selection.count == cluster.count && cluster.allSatisfy(selection.contains)
        if wholeCluster || !selection.contains(id) { selection = [id] }
    }

    public func selectWidgets(_ ids: [String]) {
        var seen = Set<String>()
        selection = ids.filter { board.widgets.contains($0) && seen.insert($0).inserted }
    }

    public func clearSelection() { selection = [] }

    public func isSelected(_ id: String) -> Bool { selection.contains(id) }

    // MARK: - Creation (`widgetCreationSlice.createWidget`)

    /// Spawns a widget at a grid-snapped position with the registry defaults.
    /// A canvas card is backed by a real child canvas created alongside.
    @discardableResult
    public func createWidget(type: String, at position: Vector2D, title: String, mint override: IdMinter? = nil) -> String? {
        guard let definition = WidgetRegistry.definition(for: type), definition.isPublic else { return nil }
        let mint = override ?? self.mint
        let id = mint()
        let canvasId = activeCanvasId
        let workspaceId = activeWorkspaceId
        return commit("Add \(definition.label)") { board in
            var widget = Widget(
                id: id, type: type, title: title, canvasId: canvasId,
                position: Vector2D(x: CanvasGeometry.snapToGrid(position.x), y: CanvasGeometry.snapToGrid(position.y)),
                size: definition.defaultSize,
                data: definition.defaultData(mint: mint)
            )
            if type == "canvas_node" {
                let subCanvasId = mint()
                board.canvases[subCanvasId] = CanvasMeta(id: subCanvasId, name: title, workspaceId: workspaceId, parentCanvasId: canvasId)
                var data = widget.data
                data["canvasId"] = .string(subCanvasId)
                widget.data = data
            }
            board.widgets[id] = widget
            return id
        }
    }

    // MARK: - Deletion (`selectionSlice.deleteWidgets`, `analyzeWidgetDeletion`)

    public struct DeletionImpact: Equatable {
        public var directWidgetIds: [String]
        public var removedCanvasIds: [String]
        public var removedWidgetIds: [String]
    }

    /// The blast radius of deleting `ids`: locked cards are skipped, a canvas
    /// card takes its canvas branch and everything on it.
    public func deletionImpact(of ids: [String]) -> DeletionImpact {
        var seen = Set<String>()
        let direct = ids.filter { seen.insert($0).inserted }.filter { id in
            guard let widget = board.widgets[id] else { return false }
            return !widget.metadata.locked
        }
        var removedCanvases: [String] = []
        var queue: [String] = []
        for id in direct {
            guard let widget = board.widgets[id], widget.type == "canvas_node" else { continue }
            let canvasId = widget.data.string("canvasId") ?? ""
            if board.canvases.contains(canvasId), !removedCanvases.contains(canvasId) {
                removedCanvases.append(canvasId)
                queue.append(canvasId)
            }
        }
        while let parent = queue.popLast() {
            for canvas in board.canvases.values where canvas.parentCanvasId == parent && !removedCanvases.contains(canvas.id) {
                removedCanvases.append(canvas.id)
                queue.append(canvas.id)
            }
        }
        var removedWidgets = direct
        for widget in board.widgets.values where removedCanvases.contains(widget.canvasId) && !removedWidgets.contains(widget.id) {
            removedWidgets.append(widget.id)
        }
        return DeletionImpact(directWidgetIds: direct, removedCanvasIds: removedCanvases, removedWidgetIds: removedWidgets)
    }

    /// Cascade: relations, connections and glues that lose an endpoint go
    /// with the widgets; a glue left with fewer than two members drops.
    @discardableResult
    public func deleteWidgets(_ ids: [String]) -> DeletionImpact {
        let impact = deletionImpact(of: ids)
        guard !impact.removedWidgetIds.isEmpty else { return impact }
        let removedWidgets = Set(impact.removedWidgetIds)
        let removedCanvases = Set(impact.removedCanvasIds)
        // A canvas node only deletes canvases below the one you stand on, but
        // the active canvas can be parked down that branch: climb out first.
        var nextActive = activeCanvasId
        while removedCanvases.contains(nextActive), let parent = board.canvases[nextActive]?.parentCanvasId { nextActive = parent }
        // Navigation and selection move BEFORE the commit so listeners (the
        // tab row, the canvas host) see the canvas the document will stand
        // on when the deletion is announced, never the one being removed.
        selection = selection.filter { !removedWidgets.contains($0) }
        if nextActive != activeCanvasId { activeCanvasId = BoardDocument.resolvedActiveCanvas(nextActive, in: board) }
        if let expanded = expandedWidgetId, removedWidgets.contains(expanded) { expandedWidgetId = nil }
        commit(impact.removedWidgetIds.count == 1 ? "Delete widget" : "Delete \(impact.removedWidgetIds.count) widgets") { board in
            board.widgets = board.widgets.filter { id, _ in !removedWidgets.contains(id) }
            for canvasId in removedCanvases {
                board.canvases.removeValue(forKey: canvasId)
                board.canvasViews.removeValue(forKey: canvasId)
            }
            board.relations = board.relations.filter { _, relation in
                board.widgets.contains(relation.fromId) && board.widgets.contains(relation.toId)
            }
            board.connections = board.connections.filter { _, connection in
                board.widgets.contains(connection.fromId) && board.widgets.contains(connection.toId)
            }
            // A cluster that lost a member closes ranks instead of splitting
            // (a folded one re-stacks), and only then is membership
            // re-derived from what still welds.
            let previous = board.glues
            var glueRecords = board.glues
            for glue in previous.values {
                let survivors = glue.widgetIds.filter { board.widgets.contains($0) }
                if survivors.count == glue.widgetIds.count || survivors.count < 2 { continue }
                if glue.collapsed {
                    let folded = GlueGeometry.refoldCollapsedCluster(board.widgets, memberIds: survivors, existingRestore: GlueGeometry.restoreMap(of: glue), previousFoldedAt: glue.foldedAt)
                    board.widgets = folded.widgets
                    var next = glue
                    next.widgetIds = survivors
                    next.record["restore"] = GlueGeometry.restoreJSON(folded.restore)
                    next.foldedAt = folded.anchor
                    glueRecords[glue.id] = next
                } else {
                    board.widgets = GlueGeometry.closeClusterGaps(board.widgets, memberIds: survivors)
                }
            }
            let glues = GlueGeometry.reconcile(board.widgets, glues: glueRecords, mint: mint) ?? glueRecords
            board.widgets = GlueGeometry.unfoldReleasedFoldedMembers(board.widgets, previous: previous, next: glues)
            board.glues = glues
        }
        return impact
    }

    // MARK: - Duplicate (`selectionSlice.duplicateWidgets`, `materializeClipboardPayload`)

    /// Clones the cards one cell down-right with " copy" titles. Wires,
    /// relations and glues wholly inside the set travel with it, and a canvas
    /// card duplicates its whole board underneath a fresh canvas.
    @discardableResult
    public func duplicateWidgets(_ ids: [String], mint override: IdMinter? = nil) -> [String] {
        materialize(ids, from: board, offset: Vector2D(x: CanvasGeometry.gridSize, y: CanvasGeometry.gridSize), titleSuffix: " copy", targetCanvasId: nil, actionName: { $0 == 1 ? "Duplicate widget" : "Duplicate \($0) widgets" }, mint: override)
    }

    // MARK: - Clipboard (`copyWidgets` / `cutWidgets` / `pasteWidgets`)

    /// What ⌘C captured: the board as it was, and the cards taken from it.
    /// Pasting materializes from this snapshot, so a card deleted (or cut)
    /// since still pastes whole, wires and sub-canvases included.
    public struct WidgetClipboard {
        public var source: Board
        public var ids: [String]
    }

    /// The in-app clipboard, shared by every window of this document.
    public private(set) var clipboard: WidgetClipboard?

    /// Returns how many cards were copied.
    @discardableResult
    public func copyWidgets(_ ids: [String]) -> Int {
        let valid = ids.filter { board.widgets.contains($0) }
        guard !valid.isEmpty else { return 0 }
        clipboard = WidgetClipboard(source: board, ids: valid)
        return valid.count
    }

    /// Copy, then delete — captured first so a cut canvas card carries the
    /// subtree its deletion cascade removes.
    @discardableResult
    public func cutWidgets(_ ids: [String]) -> Int {
        let count = copyWidgets(ids)
        if count > 0 { deleteWidgets(clipboard?.ids ?? []) }
        return count
    }

    /// Two cells off the source, or with the group's top-left at `position`,
    /// onto the active canvas. Returns the new root ids (now selected).
    @discardableResult
    public func pasteWidgets(at position: Vector2D? = nil, mint override: IdMinter? = nil) -> [String] {
        guard let clipboard else { return [] }
        let sources = clipboard.ids.compactMap { clipboard.source.widgets[$0] }
        guard !sources.isEmpty else { return [] }
        var offset = Vector2D(x: CanvasGeometry.gridSize * 2, y: CanvasGeometry.gridSize * 2)
        if let position {
            let minX = sources.map(\.position.x).min() ?? 0
            let minY = sources.map(\.position.y).min() ?? 0
            offset = Vector2D(x: position.x - minX, y: position.y - minY)
        }
        return materialize(clipboard.ids, from: clipboard.source, offset: offset, titleSuffix: "", targetCanvasId: activeCanvasId, actionName: { $0 == 1 ? "Paste widget" : "Paste \($0) widgets" }, mint: override)
    }

    /// `materializeClipboardPayload`: clones `ids` out of `source` with
    /// fresh ids, shifted by `offset`, onto `targetCanvasId` (nil keeps each
    /// card's own canvas), in one undo step.
    private func materialize(_ ids: [String], from source: Board, offset: Vector2D, titleSuffix: String, targetCanvasId: String?, actionName: (Int) -> String, mint override: IdMinter?) -> [String] {
        let mint = override ?? self.mint
        var seen = Set<String>()
        let roots = ids.filter { seen.insert($0).inserted }.compactMap { source.widgets[$0] }.filter { $0.opaqueSource == nil }
        guard !roots.isEmpty else { return [] }
        let workspaceId = activeWorkspaceId

        // Capture: the canvas subtrees under the duplicated canvas cards and
        // every widget on them.
        var capturedCanvasIds: [String] = []
        var queue: [String] = []
        for root in roots where root.type == "canvas_node" {
            let canvasId = root.data.string("canvasId") ?? ""
            if source.canvases.contains(canvasId), !capturedCanvasIds.contains(canvasId) {
                capturedCanvasIds.append(canvasId)
                queue.append(canvasId)
            }
        }
        while let parent = queue.popLast() {
            for canvas in source.canvases.values where canvas.parentCanvasId == parent && !capturedCanvasIds.contains(canvas.id) {
                capturedCanvasIds.append(canvas.id)
                queue.append(canvas.id)
            }
        }
        let rootIds = Set(roots.map(\.id))
        let canvasWidgets = source.widgets.values.filter { capturedCanvasIds.contains($0.canvasId) && !rootIds.contains($0.id) && $0.opaqueSource == nil }
        let closure = rootIds.union(canvasWidgets.map(\.id))
        let connections = source.connections.values.filter { closure.contains($0.fromId) && closure.contains($0.toId) }
        let glues = source.glues.values.filter { !$0.widgetIds.isEmpty && $0.widgetIds.allSatisfy(closure.contains) }
        let relations = source.relations.values.filter { closure.contains($0.fromId) && closure.contains($0.toId) }

        // Fresh ids everywhere, in the web's minting order.
        var widgetIdMap: [String: String] = [:]
        for widget in roots { widgetIdMap[widget.id] = mint() }
        for widget in canvasWidgets { widgetIdMap[widget.id] = mint() }
        var canvasIdMap: [String: String] = [:]
        for canvasId in capturedCanvasIds { canvasIdMap[canvasId] = mint() }

        var newCanvases: [CanvasMeta] = []
        var clones: [Widget] = []
        var capturedHomes: [String: (parentCanvasId: String, name: String)] = [:]

        func cloneOne(_ source: Widget, isRoot: Bool) -> Widget {
            var clone = source
            var record = clone.record
            record["id"] = .string(widgetIdMap[source.id]!)
            clone.record = record
            if isRoot {
                clone.position = Vector2D(
                    x: CanvasGeometry.snapToGrid(source.position.x + offset.x),
                    y: CanvasGeometry.snapToGrid(source.position.y + offset.y)
                )
                clone.title = source.title + titleSuffix
                if let targetCanvasId { clone.canvasId = targetCanvasId }
            } else {
                clone.canvasId = canvasIdMap[source.canvasId]!
            }
            if clone.type == "canvas_node" {
                let sourceCanvasId = source.data.string("canvasId") ?? ""
                var data = clone.data
                if let mapped = canvasIdMap[sourceCanvasId] {
                    data["canvasId"] = .string(mapped)
                    capturedHomes[sourceCanvasId] = (clone.canvasId, clone.title)
                } else {
                    let subCanvasId = mint()
                    newCanvases.append(CanvasMeta(id: subCanvasId, name: clone.title, workspaceId: workspaceId, parentCanvasId: clone.canvasId))
                    data["canvasId"] = .string(subCanvasId)
                }
                clone.data = data
            }
            return clone
        }

        for source in roots { clones.append(cloneOne(source, isRoot: true)) }
        let cloneRootIds = clones.map(\.id)
        for source in canvasWidgets { clones.append(cloneOne(source, isRoot: false)) }

        for canvasId in capturedCanvasIds {
            guard let canvas = source.canvases[canvasId] else { continue }
            let mappedParent = canvas.parentCanvasId.flatMap { canvasIdMap[$0] }
            let home = capturedHomes[canvasId]
            var clone = canvas
            clone.id = canvasIdMap[canvasId]!
            clone.name = mappedParent != nil ? canvas.name : (home?.name ?? canvas.name)
            clone.record["workspaceId"] = .string(workspaceId)
            clone.parentCanvasId = mappedParent ?? home?.parentCanvasId ?? canvas.parentCanvasId
            newCanvases.append(clone)
        }

        let newConnections: [Connection] = connections.map { connection in
            var clone = connection
            clone.record["id"] = .string(mint())
            clone.record["fromId"] = .string(widgetIdMap[connection.fromId]!)
            clone.record["toId"] = .string(widgetIdMap[connection.toId]!)
            return clone
        }
        let newGlues: [WidgetGlue] = glues.map { glue in
            let shift = rootIds.contains(glue.widgetIds[0]) ? offset : .zero
            var clone = glue
            clone.record["id"] = .string(mint())
            clone.widgetIds = glue.widgetIds.map { widgetIdMap[$0]! }
            if let restore = glue.record.object("restore") {
                var next = JSONObject()
                for (memberId, entry) in restore.entries {
                    guard let cloneId = widgetIdMap[memberId], var record = entry.objectValue else { continue }
                    record["x"] = .number((record.number("x") ?? 0) + shift.x)
                    record["y"] = .number((record.number("y") ?? 0) + shift.y)
                    next[cloneId] = .object(record)
                }
                clone.record["restore"] = .object(next)
            }
            if let folded = glue.foldedAt {
                clone.foldedAt = Vector2D(x: folded.x + shift.x, y: folded.y + shift.y)
            }
            return clone
        }
        let newRelations: [Relation] = relations.map { relation in
            var clone = relation
            clone.record["id"] = .string(mint())
            clone.record["fromId"] = .string(widgetIdMap[relation.fromId]!)
            clone.record["toId"] = .string(widgetIdMap[relation.toId]!)
            return clone
        }

        commit(actionName(cloneRootIds.count)) { board in
            for canvas in newCanvases { board.canvases[canvas.id] = canvas }
            for widget in clones { board.widgets[widget.id] = widget }
            for connection in newConnections { board.connections[connection.id] = connection }
            for glue in newGlues { board.glues[glue.id] = glue }
            for relation in newRelations { board.relations[relation.id] = relation }
        }
        selection = cloneRootIds
        return cloneRootIds
    }

    // MARK: - Layout (`widgetLayoutSlice`)

    /// A live drag frame: every unlocked card moves by the world delta. Call
    /// inside `beginGesture`/`endGesture` so the drag is one undo step.
    /// Glued cards move as one object; an option-drag (`soloGlued`) moves
    /// only the grabbed card so it can be pulled off or re-welded.
    public func moveWidgets(_ ids: [String], by delta: Vector2D, soloGlued: Bool = false) {
        if delta.x == 0, delta.y == 0 { return }
        let moving = soloGlued ? ids : expandedThroughClusters(ids)
        commit("Move") { board in
            for id in moving {
                guard var widget = board.widgets[id], !widget.metadata.locked else { continue }
                widget.position = Vector2D(x: widget.position.x + delta.x, y: widget.position.y + delta.y)
                board.widgets[id] = widget
            }
        }
    }

    /// `settleWidgets` at release: landing on the grid. A glued cluster
    /// snaps RIGIDLY by one delta (from the member already closest to the
    /// grid) so its seams survive; then clusters are re-derived from what
    /// visibly touches.
    public func snapWidgetsToGrid(_ ids: [String]) {
        let index = glueIndex
        let expanded = expandedThroughClusters(ids)
        let mint = self.mint
        commit("Move") { board in
            var rigid: [String: Vector2D] = [:]
            for id in expanded {
                guard let glueId = index[id], rigid[glueId] == nil, let glue = board.glues[glueId] else { continue }
                let members = glue.widgetIds.filter { board.widgets.contains($0) }
                guard members.count >= 2 else { continue }
                var best: Vector2D?
                for member in members {
                    let p = board.widgets[member]!.position
                    let delta = Vector2D(x: CanvasGeometry.snapToGrid(p.x) - p.x, y: CanvasGeometry.snapToGrid(p.y) - p.y)
                    if best == nil || abs(delta.x) + abs(delta.y) < abs(best!.x) + abs(best!.y) { best = delta }
                }
                rigid[glueId] = best
            }
            for id in expanded {
                guard var widget = board.widgets[id] else { continue }
                if let glueId = index[id], let delta = rigid[glueId] {
                    widget.position = Vector2D(x: widget.position.x + delta.x, y: widget.position.y + delta.y)
                    board.widgets[id] = widget
                } else {
                    board.widgets[id] = DragResize.snappedToGrid(widget)
                }
            }
            BoardDocument.reconcileGlues(&board, mint: mint)
        }
    }

    /// Move and snap as one undo step (keyboard nudges, alignment).
    public func nudgeWidgets(_ ids: [String], by delta: Vector2D, snap: Bool = true) {
        beginGesture(named: "Move")
        moveWidgets(ids, by: delta)
        if snap { snapWidgetsToGrid(ids) }
        endGesture()
    }

    /// `resizeWidget`: the registry rules are the final clamp for every
    /// path; an icon stays a capped square; a locked card ignores it.
    public func resizeWidget(_ id: String, to size: Size, snap: Bool = true) {
        guard let widget = board.widgets[id] else { return }
        let rules = WidgetRegistry.definition(for: widget.type)?.sizingRules(for: widget.data) ?? SizingRules.defaults
        let mint = self.mint
        commit("Resize") { board in
            board.widgets[id] = DragResize.resized(widget, to: size, snap: snap, rules: rules)
            // Inside a group the clustermates give way (grow) or close ranks
            // (shrink) around the card that changed, once the size lands.
            if snap { BoardDocument.repackCluster(&board, around: id, mint: mint, reconcile: false) }
        }
    }

    /// The content floor (`useContentFloor.ts`): an open card reported the
    /// height its body needs, already raised to the grid (`contentFitHeight`).
    /// A content-fit type (`autoHeight`) takes exactly that height, growing
    /// and shrinking with its content; every other card only ever grows, so
    /// nothing a person sized by hand is taken back. The width never moves.
    ///
    /// Not an undo step: the fit follows from the edit that caused it, and
    /// undoing that edit restores the height it had. A pointer gesture owns
    /// the size while it runs; the host asks again when it ends.
    public func fitWidgetHeight(_ id: String, fitted: Double) {
        guard gestureBefore == nil, !editingLocked, let widget = board.widgets[id], widget.iconified != true else { return }
        let rules = WidgetRegistry.definition(for: widget.type)?.sizingRules(for: widget.data) ?? SizingRules.defaults
        // No ceiling: a card is never scrollable, so it grows to hold its
        // whole body however tall that is (owner's rule, 18 Sep 2026).
        let floor = rules.minHeight ?? SizingRules.defaultMinHeight
        let height = max(floor, fitted)
        let current = widget.size.height
        guard rules.autoHeight ? height != current : height > current else { return }
        var next = board
        next.widgets[id]?.size = Size(width: widget.size.width, height: height)
        // Inside a group the clustermates give way or close ranks.
        BoardDocument.repackCluster(&next, around: id, mint: mint, reconcile: false)
        board = next
        widgetsVersion &+= 1
        notify()
    }

    /// `resizeWidgetFromEdge`: the sides the gesture did not grab stay
    /// pinned. Live frames pass `snap: false`; the release snaps.
    public func resizeWidgetFromEdge(_ id: String, to size: Size, edge: ResizeEdge, snap: Bool) {
        guard let widget = board.widgets[id] else { return }
        let rules = WidgetRegistry.definition(for: widget.type)?.sizingRules(for: widget.data) ?? SizingRules.defaults
        let next = DragResize.resizedFromEdge(widget, to: size, edge: edge, snap: snap, rules: rules)
        guard next.size != widget.size || next.position != widget.position else { return }
        let mint = self.mint
        commit("Resize") { board in
            board.widgets[id] = next
            if snap { BoardDocument.repackCluster(&board, around: id, mint: mint, reconcile: false) }
        }
    }

    public func renameWidget(_ id: String, title: String) {
        guard let widget = board.widgets[id], widget.title != title else { return }
        commit("Rename", tag: "title:\(id)") { board in
            board.widgets[id]?.title = title
            // Renaming a canvas node renames the canvas it opens.
            if widget.type == "canvas_node", let canvasId = widget.data.string("canvasId"), board.canvases[canvasId]?.name != title {
                board.canvases[canvasId]?.name = title
            }
        }
    }

    /// `renameCanvas`: the canvas and the card that opens it stay mirrored.
    public func renameCanvas(_ canvasId: String, name: String) {
        guard board.canvases[canvasId]?.name != name else { return }
        commit("Rename canvas", tag: "canvas-name:\(canvasId)") { board in
            board.canvases[canvasId]?.name = name
            for (id, widget) in board.widgets.entries where widget.type == "canvas_node" && widget.data.string("canvasId") == canvasId {
                board.widgets[id]?.title = name
            }
        }
    }

    /// `updateWidgetData`: mutate the data object in place (law 5). Same-id
    /// edits within the coalesce window share one undo step.
    public func updateWidgetData(_ id: String, coalesce: Bool = true, _ mutate: (inout JSONObject) -> Void) {
        guard board.widgets.contains(id) else { return }
        commit("Edit", tag: coalesce ? "data:\(id)" : nil) { board in
            guard var widget = board.widgets[id] else { return }
            var data = widget.data
            mutate(&data)
            widget.data = data
            board.widgets[id] = widget
        }
    }

    /// Runs one of the type's trigger commands the way a wire would, so a tap
    /// and a wire can never disagree.
    public func runCommand(_ id: String, _ key: String, payload: FieldValue? = nil, mint override: IdMinter? = nil) {
        guard let widget = board.widgets[id], let command = commandsFor(widget.type).first(where: { $0.key == key }) else { return }
        let mint = override ?? self.mint
        updateWidgetData(id) { data in data = command.run(data, payload, mint) }
    }

    /// Writes a settable field through its descriptor (clamping, coercion).
    public func setField(_ id: String, _ key: String, _ value: FieldValue, mint override: IdMinter? = nil) {
        guard let widget = board.widgets[id], let descriptor = fieldDescriptor(widget.type, key), let setter = descriptor.set else { return }
        let mint = override ?? self.mint
        updateWidgetData(id) { data in data = setter(data, value, mint) }
    }

    /// `dataWearingSkin`: writes the definition's skin field in place.
    @discardableResult
    public func setSkin(_ id: String, value: String) -> Bool {
        guard let widget = board.widgets[id], let definition = WidgetRegistry.definition(for: widget.type),
              definition.skins.contains(where: { $0.value == value }) else { return false }
        updateWidgetData(id) { data in data[definition.skinField] = .string(value) }
        return true
    }

    // MARK: - Lock, pin, icon (`selectionSlice.lockWidgets`, `toggleWidgetPinned`, `widgetLayoutSlice.setWidgetScaleState`)

    public func setLocked(_ ids: [String], _ locked: Bool) {
        let changing = ids.filter { board.widgets[$0]?.metadata.locked != locked && board.widgets.contains($0) }
        guard !changing.isEmpty else { return }
        commit(locked ? "Lock" : "Unlock") { board in
            for id in changing {
                var metadata = board.widgets[id]!.metadata
                metadata.locked = locked
                board.widgets[id]?.metadata = metadata
            }
        }
    }

    /// `toggleWidgetFavorite`: the web spreads `favorite: !favorite` into
    /// the metadata, so un-starring writes an explicit `false` (not a removed
    /// key) — the record is written directly to keep the bytes identical.
    public func toggleFavorite(_ id: String) {
        guard let widget = board.widgets[id] else { return }
        let next = !widget.metadata.favorite
        commit(next ? "Favorite" : "Unfavorite") { board in
            guard var metadata = board.widgets[id]?.metadata else { return }
            metadata.record["favorite"] = .bool(next)
            board.widgets[id]?.metadata = metadata
        }
    }

    /// The title row's Completed button (`updateWidgetMetadata(id,
    /// { completed: !completed })`): like the star, an explicit `false`.
    public func toggleCompleted(_ id: String) {
        guard let widget = board.widgets[id] else { return }
        let next = !widget.metadata.completed
        commit(next ? "Complete" : "Reopen") { board in
            guard var metadata = board.widgets[id]?.metadata else { return }
            metadata.record["completed"] = .bool(next)
            board.widgets[id]?.metadata = metadata
        }
    }

    /// Pinned means held open: the card keeps its stored footprint. Pinning
    /// an icon commits the peek; unpinning restores what the pin interrupted.
    public func setPinned(_ id: String, _ pinned: Bool) {
        guard let widget = board.widgets[id], widget.metadata.pinned != pinned else { return }
        let definition = WidgetRegistry.definition(for: widget.type)
        let tile = restingTileSize?(widget)
        // A welded member holds the corner it is welded at; its clustermates
        // give way or close ranks instead.
        let welded = glue(containing: id) != nil
        let mint = self.mint
        commit(pinned ? "Pin" : "Unpin") { board in
            guard var next = board.widgets[id] else { return }
            var metadata = next.metadata
            metadata.pinned = pinned
            if pinned {
                if next.iconified == true {
                    var origin = JSONObject()
                    origin["kind"] = .string("icon")
                    origin["width"] = .number(next.size.width)
                    origin["height"] = .number(next.size.height)
                    metadata.pinnedFrom = .object(origin)
                    let icon = next.size
                    next.iconified = false
                    next.size = next.expandedSize ?? definition?.defaultSize ?? next.size
                    next.expandedSize = nil
                    // A peeked icon is drawn as the full card centred on its
                    // square; pinning absorbs that view offset into the stored
                    // anchor, snapped to the grid before anything settles on it.
                    next.position = Vector2D(
                        x: CanvasGeometry.snapToGrid(next.position.x + (icon.width - next.size.width) / 2),
                        y: CanvasGeometry.snapToGrid(next.position.y + (icon.height - next.size.height) / 2)
                    )
                } else {
                    var origin = JSONObject()
                    origin["kind"] = .string("rest")
                    metadata.pinnedFrom = .object(origin)
                    // The stored corner is the tile's; the open card stood
                    // centred on it. Pinning keeps the card where it stood.
                    if !welded, definition?.restingFace == true, let tile {
                        next.position = Vector2D(
                            x: CanvasGeometry.snapToGrid(next.position.x + (tile.width - next.size.width) / 2),
                            y: CanvasGeometry.snapToGrid(next.position.y + (tile.height - next.size.height) / 2)
                        )
                    }
                }
                next.metadata = metadata
            } else {
                let origin = next.metadata.pinnedFrom?.objectValue
                metadata.pinnedFrom = nil
                next.metadata = metadata
                if origin?.string("kind") == "icon" {
                    let edge = CanvasGeometry.iconifiedSize.width
                    let full = next.size
                    next.iconified = true
                    next.expandedSize = full
                    next.size = Size(width: edge, height: edge)
                    if !welded {
                        next.position = Vector2D(x: next.position.x + (full.width - edge) / 2, y: next.position.y + (full.height - edge) / 2)
                    }
                } else if !welded, definition?.restingFace == true, next.iconified != true, let tile {
                    // A pinned card is drawn full at its anchor, and the pin
                    // moved that anchor to the card's own corner, so the
                    // unpin hands the offset back.
                    next.position = Vector2D(
                        x: next.position.x + (next.size.width - tile.width) / 2,
                        y: next.position.y + (next.size.height - tile.height) / 2
                    )
                }
            }
            board.widgets[id] = next
            BoardDocument.repackCluster(&board, around: id, mint: mint, reconcile: false)
            // A card held open now takes its full box: its neighbours make room.
            if pinned {
                board.widgets = WidgetSettling.settleWithGenerationFloor(board.widgets, activeIds: [id], glueIndex: GlueGeometry.index(board.glues), relations: board.relations)
            }
        }
        // Pinned, the card is held open by the pin itself, not by a click.
        if pinned, expandedWidgetId == id { expandedWidgetId = nil }
    }

    /// `setWidgetScaleState`: icon ↔ full. The icon parks the dormant full
    /// size; restoring clamps it to the rules; every state change re-centres
    /// the new box on the box it replaced.
    public func setIconified(_ id: String, _ iconified: Bool) {
        guard let widget = board.widgets[id], !widget.metadata.locked, (widget.iconified == true) != iconified else { return }
        let definition = WidgetRegistry.definition(for: widget.type)
        let rests = { (candidate: Widget) -> Bool in
            definition?.restingFace == true && candidate.iconified != true && !candidate.metadata.pinned
        }
        let tileOf = { (candidate: Widget) -> Size in self.restingTileSize?(candidate) ?? candidate.size }
        let welded = glue(containing: id) != nil
        let mint = self.mint
        commit(iconified ? "Shrink to icon" : "Expand") { board in
            guard var next = board.widgets[id] else { return }
            let shownBefore = rests(next) ? tileOf(next) : next.size
            if iconified {
                next.expandedSize = next.size
                next.iconified = true
                next.size = CanvasGeometry.iconifiedSize
            } else {
                let dormant = next.expandedSize ?? definition?.defaultSize ?? next.size
                let rules = definition?.sizingRules(for: next.data) ?? SizingRules.defaults
                next.iconified = false
                next.size = DragResize.clampFullSize(dormant, rules: rules)
                next.expandedSize = nil
            }
            let shownAfter = rests(next) ? tileOf(next) : next.size
            // Inside a group a member is welded, not floating: it keeps its
            // corner so an open/close round trip returns the exact layout.
            if !welded {
                next.position = Vector2D(
                    x: next.position.x + (shownBefore.width - shownAfter.width) / 2,
                    y: next.position.y + (shownBefore.height - shownAfter.height) / 2
                )
            }
            board.widgets[id] = next
            BoardDocument.repackCluster(&board, around: id, mint: mint)
        }
    }

    // MARK: - Relations (`circuitSlice.addRelation` …)

    @discardableResult
    public func addRelation(from fromId: String, to toId: String, type: RelationType, mint override: IdMinter? = nil) -> String? {
        guard fromId != toId, board.widgets.contains(fromId), board.widgets.contains(toId) else { return nil }
        if let duplicate = board.relations.values.first(where: { $0.fromId == fromId && $0.toId == toId && $0.type == type }) {
            return duplicate.id
        }
        let id = (override ?? mint)()
        commit("Link") { board in
            board.relations[id] = Relation(id: id, fromId: fromId, toId: toId, type: type, isResolved: type != .blocker && type != .conflict)
        }
        return id
    }

    public func removeRelation(_ id: String) {
        guard board.relations.contains(id) else { return }
        commit("Unlink") { board in board.relations.removeValue(forKey: id) }
    }

    /// `updateRelation(id, { type })` / `{ fromId: toId, toId: fromId }`:
    /// a changed link starts unresolved again. Mutates the record in place so
    /// unknown keys and key order survive.
    public func updateRelation(_ id: String, type: RelationType? = nil, reversed: Bool = false) {
        guard let relation = board.relations[id], type != nil || reversed else { return }
        commit(reversed ? "Reverse Link" : "Change Link") { board in
            guard var next = board.relations[id] else { return }
            if let type { next.record["type"] = .string(type.rawValue) }
            if reversed {
                next.record["fromId"] = .string(relation.toId)
                next.record["toId"] = .string(relation.fromId)
            }
            next.isResolved = false
            board.relations[id] = next
        }
    }

    public func toggleResolveRelation(_ id: String) {
        guard let relation = board.relations[id] else { return }
        commit(relation.isResolved ? "Reopen" : "Resolve") { board in board.relations[id]?.isResolved.toggle() }
    }

    // MARK: - Connections (`circuitSlice.addConnection` …)

    /// A value wire. Single-writer rule: a second incoming value wire to the
    /// same target field replaces the first. Only `connectionsVersion` moves,
    /// so the driver delivers the current value immediately.
    @discardableResult
    public func addValueConnection(from fromId: String, field fromField: String, to toId: String, field toField: String, transform: WireTransform? = nil, enabled: Bool = true, mint override: IdMinter? = nil) -> String? {
        guard fromId != toId, let source = board.widgets[fromId], let target = board.widgets[toId] else { return nil }
        guard fieldDescriptor(source.type, fromField) != nil, fieldDescriptor(target.type, toField)?.set != nil else { return nil }
        let id = (override ?? mint)()
        commit("Wire") { board in
            board.connections = board.connections.filter { _, existing in
                !(existing.kind == .value && existing.toId == toId && existing.toField == toField)
            }
            board.connections[id] = Connection.value(id: id, fromId: fromId, fromField: fromField, toId: toId, toField: toField, transform: transform, enabled: enabled)
        }
        return id
    }

    /// A trigger wire. Re-drawing an identical one is a no-op.
    @discardableResult
    public func addTriggerConnection(from fromId: String, field fromField: String, to toId: String, command: String, edge: TriggerEdge, transform: WireTransform? = nil, enabled: Bool = true, mint override: IdMinter? = nil) -> String? {
        guard fromId != toId, let source = board.widgets[fromId], let target = board.widgets[toId] else { return nil }
        guard fieldDescriptor(source.type, fromField) != nil, commandsFor(target.type).contains(where: { $0.key == command }) else { return nil }
        if let existing = board.connections.values.first(where: {
            $0.kind == .trigger && $0.fromId == fromId && $0.fromField == fromField && $0.toId == toId && $0.command == command
        }) {
            return existing.id
        }
        let id = (override ?? mint)()
        commit("Wire") { board in
            board.connections[id] = Connection.trigger(id: id, fromId: fromId, fromField: fromField, toId: toId, command: command, edge: edge, transform: transform, enabled: enabled)
        }
        return id
    }

    public func setConnectionTransform(_ id: String, _ transform: WireTransform?) {
        guard board.connections.contains(id) else { return }
        commit("Edit wire", tag: "connection:\(id)") { board in board.connections[id]?.transform = transform }
    }

    public func setConnectionEdge(_ id: String, _ edge: TriggerEdge) {
        guard let connection = board.connections[id], connection.kind == .trigger else { return }
        commit("Edit wire", tag: "connection:\(id)") { board in board.connections[id]?.record["edge"] = .string(edge.rawValue) }
    }

    public func setConnectionEnabled(_ id: String, _ enabled: Bool) {
        guard board.connections.contains(id) else { return }
        commit("Edit wire", tag: "connection:\(id)") { board in board.connections[id]?.enabled = enabled }
    }

    public func removeConnection(_ id: String) {
        guard board.connections.contains(id) else { return }
        commit("Remove wire") { board in board.connections.removeValue(forKey: id) }
    }

    // MARK: - Circuit UI state

    public func setCircuitMode(_ active: Bool) { circuitUI.setCircuitMode(active && CircuitFeature.isEnabled) }
    public func updateCircuitUI(_ mutate: (inout CircuitUIState) -> Void) { mutate(&circuitUI) }
}

// MARK: - CircuitHost

extension BoardDocument: CircuitHost {
    public var snapshot: CircuitSnapshot {
        CircuitSnapshot(widgets: board.widgets, connections: board.connections, widgetsVersion: widgetsVersion, connectionsVersion: connectionsVersion)
    }

    public var dampedIds: Set<String> { circuitUI.dampedIds }

    public func subscribe(_ listener: @escaping () -> Void) -> () -> Void {
        let id = nextListener
        nextListener += 1
        listeners[id] = listener
        return { [weak self] in self?.listeners[id] = nil }
    }

    /// Circuit law 3: one batched commit, in place, no undo entry.
    public func applyWireWrites(_ writes: OrderedMap<JSONObject>) {
        guard !editingLocked else { return }
        var changed = false
        for (id, data) in writes.entries {
            guard var widget = board.widgets[id], widget.data != data else { continue }
            widget.data = data
            board.widgets[id] = widget
            changed = true
        }
        guard changed else { return }
        widgetsVersion &+= 1
        notify()
    }

    public func dampConnections(_ ids: [String]) { circuitUI.dampConnections(ids) }
    public func clearDamped() { circuitUI.clearDamped() }
    public func recordFires(_ ids: [String], at ms: Double) { circuitUI.recordFires(ids, at: ms) }
    public func notifyLoopDamped(_ message: String) { onToast?(message) }
    public func executeAutomation(widgetId: String) { onExecuteAutomation?(widgetId) }
}
