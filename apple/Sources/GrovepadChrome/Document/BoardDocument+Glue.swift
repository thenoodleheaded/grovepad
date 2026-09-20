import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Widget groups: `store/slices/glueSlice.ts`, action for action, over the
// geometry in `Glue/GlueGeometry.swift`. A group is a `WidgetGlue` record
// naming touching cards; everything that changes a footprint inside one
// re-packs it, and every path that can leave a record whose pieces no longer
// touch re-derives membership (`reconcileGlues`).
//
// Deviation (owner's rule, 18 Sep 2026; recorded in apple/AGENTS.md): the web
// follows most of these with its board-level settle pass
// (`settleWidgetsByCanvas`), which shoves OUTSIDE cards clear of a group.
// Here cards push each other only when a drag is let go, so only the
// in-cluster half runs (`GlueGeometry.reflowCluster`).
// ---------------------------------------------------------------------------

extension BoardDocument {
    /// `MAX_GLUE_NAME`.
    static let maxGlueName = 60

    // MARK: - Reads

    /// Member → glue id (`widgetGlueIndex`).
    public var glueIndex: [String: String] { GlueGeometry.index(board.glues) }

    public func glue(containing widgetId: String) -> WidgetGlue? {
        guard let id = glueIndex[widgetId] else { return nil }
        return board.glues[id]
    }

    /// The whole cluster a card belongs to (itself when unglued).
    public func clusterIds(of widgetId: String) -> [String] {
        guard let glue = glue(containing: widgetId) else { return [widgetId] }
        return glue.widgetIds.filter { board.widgets.contains($0) }
    }

    /// `inFoldedCluster`: the card sits inside a collapsed group, which is
    /// ONE object — its members are inert and any press unfolds it.
    public func isInFoldedCluster(_ widgetId: String) -> Bool {
        glue(containing: widgetId)?.collapsed == true
    }

    /// Closure of `ids` through every glue cluster they touch (the unit a
    /// plain drag moves and a release settles).
    public func expandedThroughClusters(_ ids: [String]) -> [String] {
        let index = glueIndex
        var seen = Set<String>()
        var result: [String] = []
        for id in ids {
            let members = index[id].flatMap { board.glues[$0]?.widgetIds } ?? [id]
            for member in members where board.widgets.contains(member) && seen.insert(member).inserted {
                result.append(member)
            }
        }
        return result
    }

    // MARK: - Glue

    /// `glueWidgets(draggedId, targetId)`: merge both sides' records into
    /// one fresh group. A merge touching a collapsed group stays collapsed
    /// and folds the newcomers in; the name and the fold memory carry over.
    @discardableResult
    static func weld(_ board: inout Board, draggedId: String, targetId: String, mint: IdMinter) -> Bool {
        guard draggedId != targetId, let dragged = board.widgets[draggedId], let target = board.widgets[targetId],
              dragged.canvasId == target.canvasId else { return false }
        let index = GlueGeometry.index(board.glues)
        let draggedGlueId = index[draggedId]
        let targetGlueId = index[targetId]
        if let draggedGlueId, draggedGlueId == targetGlueId { return false }
        var glues = board.glues
        let draggedGlue = draggedGlueId.flatMap { glues[$0] }
        let targetGlue = targetGlueId.flatMap { glues[$0] }
        func memberIds(_ glueId: String?, fallback: String) -> [String] {
            guard let glueId, let glue = glues[glueId] else { return [fallback] }
            glues.removeValue(forKey: glueId)
            return glue.widgetIds
        }
        var seen = Set<String>()
        let merged = (memberIds(targetGlueId, fallback: targetId) + memberIds(draggedGlueId, fallback: draggedId))
            .filter { seen.insert($0).inserted && board.widgets.contains($0) }
        guard merged.count >= 2 else { return false }

        let collapsed = targetGlue?.collapsed == true || draggedGlue?.collapsed == true
        let name = targetGlue?.name ?? draggedGlue?.name
        let id = mint()
        var glue = WidgetGlue(id: id, widgetIds: merged)
        if let name, !name.isEmpty { glue.name = name }

        if collapsed {
            var mergedRestore = GlueGeometry.RestoreMap()
            for source in [draggedGlue, targetGlue] {
                guard let source, let map = GlueGeometry.restoreMap(of: source) else { continue }
                for (memberId, entry) in map.entries { mergedRestore[memberId] = entry }
            }
            let previousFoldedAt = (targetGlue?.collapsed == true ? targetGlue?.foldedAt : nil)
                ?? (draggedGlue?.collapsed == true ? draggedGlue?.foldedAt : nil)
            let folded = GlueGeometry.refoldCollapsedCluster(board.widgets, memberIds: merged, existingRestore: mergedRestore, previousFoldedAt: previousFoldedAt)
            glue.collapsed = true
            glue.record["restore"] = GlueGeometry.restoreJSON(folded.restore)
            glue.foldedAt = folded.anchor
            glues[id] = glue
            board.widgets = folded.widgets
        } else {
            glues[id] = glue
        }
        board.glues = glues
        return true
    }

    /// Welds two cards as its own undo step (`glueWidgets` outside a drag).
    public func glueWidgets(_ draggedId: String, _ targetId: String) {
        let welded = commit("Glue") { board in BoardDocument.weld(&board, draggedId: draggedId, targetId: targetId, mint: mint) }
        if welded { onToast?("Glued") }
    }

    /// `glueSelection(ids)`: every other card welds onto the first, one undo
    /// step. False when there is nothing new to weld.
    @discardableResult
    public func glueSelection(_ ids: [String], mint override: IdMinter? = nil) -> Bool {
        guard let anchorId = ids.first, let anchor = board.widgets[anchorId] else { return false }
        let index = glueIndex
        let anchorGlueId = index[anchorId]
        var seen = Set<String>()
        let joining = ids.dropFirst().filter { id in
            guard seen.insert(id).inserted, id != anchorId, board.widgets[id]?.canvasId == anchor.canvasId else { return false }
            return !(anchorGlueId != nil && index[id] == anchorGlueId)
        }
        guard !joining.isEmpty else { return false }
        let mint = override ?? self.mint
        let welded = commit("Glue") { board -> Bool in
            var any = false
            for id in joining where BoardDocument.weld(&board, draggedId: id, targetId: anchorId, mint: mint) { any = true }
            return any
        }
        if welded { onToast?("Glued") }
        return welded
    }

    /// Welds the cards into one group and returns its id (a
    /// `glueSelection` whose result the caller wants to name).
    @discardableResult
    public func addGlue(_ widgetIds: [String], mint override: IdMinter? = nil) -> String? {
        guard glueSelection(widgetIds, mint: override), let first = widgetIds.first else { return nil }
        return glueIndex[first]
    }

    /// ⌘G / ⇧⌘G (`CanvasViewport.tsx`'s `g` key): glue the selection, or
    /// pull every selected card out of its group. Only the cases where
    /// nothing happened need a toast of their own.
    public func glueSelectionCommand(unglue: Bool) {
        let ids = selection
        guard !ids.isEmpty else { return }
        if unglue {
            var released = 0
            for id in ids where unglueWidget(id) { released += 1 }
            if released == 0 { onToast?("Nothing here is glued") }
        } else if ids.count >= 2 {
            glueSelection(ids)
        } else {
            onToast?("Select at least 2 widgets to glue")
        }
    }

    // MARK: - Unglue

    /// `unglueWidget(id, { skipHistory, heldByPointer })`: the member leaves;
    /// the survivors close ranks (a folded group re-stacks) BEFORE membership
    /// is re-derived, so cards beyond the one that left stay grouped. Inside
    /// a drag gesture the change rides the drag's undo step.
    @discardableResult
    public func unglueWidget(_ widgetId: String, heldByPointer: Bool = false) -> Bool {
        guard let glueId = glueIndex[widgetId], board.glues[glueId] != nil else { return false }
        let mint = self.mint
        commit("Unglue") { board in
            guard let glue = board.glues[glueId] else { return }
            let previous = board.glues
            let wasCollapsed = glue.collapsed
            let remaining = glue.widgetIds.filter { $0 != widgetId }
            var glues = board.glues
            var widgets = board.widgets
            if remaining.count < 2 {
                glues.removeValue(forKey: glueId)
            } else if wasCollapsed {
                let folded = GlueGeometry.refoldCollapsedCluster(widgets, memberIds: remaining, existingRestore: GlueGeometry.restoreMap(of: glue), previousFoldedAt: glue.foldedAt)
                widgets = folded.widgets
                var next = glue
                next.widgetIds = remaining
                next.collapsed = true
                next.record["restore"] = GlueGeometry.restoreJSON(folded.restore)
                next.foldedAt = folded.anchor
                glues[glueId] = next
            } else {
                var next = glue
                next.widgetIds = remaining
                glues[glueId] = next
            }
            if !wasCollapsed && remaining.count >= 2 {
                widgets = GlueGeometry.closeClusterGaps(widgets, memberIds: remaining)
            }
            let reconciled = GlueGeometry.reconcile(widgets, glues: glues, mint: mint) ?? glues
            widgets = GlueGeometry.unfoldReleasedFoldedMembers(widgets, previous: previous, next: reconciled)
            board.widgets = widgets
            board.glues = reconciled
            // The acting card holds its ground on an option-drag release;
            // from a menu the survivors hold and the freed card gives way.
            BoardDocument.reflowClusters(&board, touching: glue.widgetIds, anchors: heldByPointer ? [widgetId] : remaining)
        }
        // Selecting a member selects the whole cluster; the freed card leaves
        // alone, so it is selected alone.
        if selection.contains(widgetId) { selection = [widgetId] }
        onToast?("Unglued")
        return true
    }

    /// `unglueCluster(glueId)`: the record goes, a folded group restores
    /// every member, and the cards push a clear cell apart so the split is
    /// physical.
    public func unglueCluster(_ glueId: String) {
        guard let cluster = board.glues[glueId] else { return }
        commit("Ungroup") { board in
            let previous = board.glues
            var glues = board.glues
            glues.removeValue(forKey: glueId)
            var widgets = GlueGeometry.unfoldReleasedFoldedMembers(board.widgets, previous: previous, next: glues)
            widgets = GlueGeometry.spreadClusterMembers(widgets, memberIds: cluster.widgetIds)
            board.widgets = widgets
            board.glues = glues
        }
        let dissolved = Set(cluster.widgetIds)
        if selection.contains(where: dissolved.contains) { selection = selection.filter { !dissolved.contains($0) } }
        onToast?("Ungrouped")
    }

    // MARK: - Rename, collapse

    /// `renameGlue`: whitespace collapsed, trimmed, capped at 60; an empty
    /// name removes the key (the frame then reads "Group").
    public func renameGlue(_ glueId: String, name: String) {
        guard let glue = board.glues[glueId] else { return }
        let collapsedSpaces = name.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        // `.slice(0, 60)` counts UTF-16 units.
        let clean = String(decoding: Array(collapsedSpaces.utf16.prefix(BoardDocument.maxGlueName)), as: UTF16.self)
        guard (glue.name ?? "") != clean else { return }
        commit("Rename group") { board in
            guard var current = board.glues[glueId] else { return }
            current.name = clean.isEmpty ? nil : clean
            board.glues[glueId] = current
        }
    }

    /// `setClusterCollapsed`: fold every member to one cell in a packed
    /// block, or unfold each back to the state the fold recorded, translated
    /// by however far the block travelled while folded.
    public func setClusterCollapsed(_ glueId: String, _ collapsed: Bool) {
        guard board.glues[glueId] != nil else { return }
        let mint = self.mint
        commit(collapsed ? "Collapse group" : "Expand group") { board in
            guard let cluster = board.glues[glueId] else { return }
            let memberIds = cluster.widgetIds.filter { board.widgets.contains($0) }
            guard !memberIds.isEmpty else { return }
            var nextGlue = cluster
            var widgets: OrderedMap<Widget>
            if collapsed {
                let folded = GlueGeometry.refoldCollapsedCluster(board.widgets, memberIds: memberIds, existingRestore: GlueGeometry.restoreMap(of: cluster), previousFoldedAt: cluster.foldedAt)
                widgets = folded.widgets
                nextGlue.collapsed = true
                nextGlue.record["restore"] = GlueGeometry.restoreJSON(folded.restore)
                nextGlue.foldedAt = folded.anchor
            } else {
                widgets = board.widgets
                let restore = GlueGeometry.restoreMap(of: cluster)
                let shift = GlueGeometry.foldedBlockShift(board.widgets, glue: cluster)
                for id in memberIds {
                    var w = board.widgets[id]!
                    if let saved = restore?[id] {
                        w.iconified = saved.iconified
                        w.size = Size(width: saved.width, height: saved.height)
                        w.position = Vector2D(x: saved.x + shift.x, y: saved.y + shift.y)
                    } else {
                        let size = w.expandedSize ?? w.size
                        w.iconified = false
                        w.size = size
                    }
                    widgets[id] = w
                }
                nextGlue.collapsed = false
                nextGlue.record["restore"] = nil
                nextGlue.foldedAt = nil
                widgets = GlueGeometry.closeClusterGaps(widgets, memberIds: memberIds)
            }
            var glues = board.glues
            glues[glueId] = nextGlue
            let reconciled = GlueGeometry.reconcile(widgets, glues: glues, mint: mint) ?? glues
            board.widgets = widgets
            board.glues = reconciled
            BoardDocument.reflowClusters(&board, touching: memberIds, anchors: memberIds)
        }
    }

    // MARK: - The option-drag

    /// `setGlueIntent`: the weld a release would commit, previewed live.
    public func setGlueIntent(_ intent: GlueIntent?) {
        if glueIntent != intent { glueIntent = intent }
    }

    /// `setUnglueIntentWidgetId`: the card a release would pull out.
    public func setUnglueIntentWidgetId(_ id: String?) {
        if unglueIntentWidgetId != id { unglueIntentWidgetId = id }
    }

    /// `commitGlue`: the dragged card lands on the exact seam the preview
    /// showed, welds, and anything the merge left adrift splits off.
    @discardableResult
    public func commitGlue() -> Bool {
        guard let intent = glueIntent else { return false }
        guard board.widgets.contains(intent.draggedId), board.widgets.contains(intent.targetId) else {
            setGlueIntent(nil)
            return false
        }
        let mint = self.mint
        let welded = commit("Glue") { board -> Bool in
            board.widgets[intent.draggedId]?.position = intent.position
            let welded = BoardDocument.weld(&board, draggedId: intent.draggedId, targetId: intent.targetId, mint: mint)
            let previous = board.glues
            if let reconciled = GlueGeometry.reconcile(board.widgets, glues: board.glues, mint: mint) {
                board.widgets = GlueGeometry.unfoldReleasedFoldedMembers(board.widgets, previous: previous, next: reconciled)
                board.glues = reconciled
            }
            BoardDocument.reflowClusters(&board, touching: [intent.draggedId], anchors: [intent.draggedId])
            return welded
        }
        if welded { onToast?("Glued") }
        setGlueIntent(nil)
        return true
    }

    // MARK: - Group-wide buttons (`updateWidgetsMetadata`)

    /// Complete-all / Favorite-all on the group frame: one undo step. The
    /// web spreads the flag into each member's metadata, so the key is
    /// written explicitly (never removed) to keep the bytes identical.
    public func setMetadataFlag(_ key: String, _ value: Bool, on ids: [String]) {
        let targets = ids.filter { board.widgets.contains($0) }
        guard !targets.isEmpty else { return }
        commit(key == "favorite" ? (value ? "Favorite all" : "Unfavorite all") : (value ? "Complete all" : "Reopen all")) { board in
            for id in targets {
                guard var metadata = board.widgets[id]?.metadata else { continue }
                metadata.record[key] = .bool(value)
                board.widgets[id]?.metadata = metadata
            }
        }
    }

    // MARK: - Shared housekeeping

    /// The in-cluster half of the settle pass: every cluster holding one of
    /// `ids` resolves overlaps between its own members, anchors holding.
    static func reflowClusters(_ board: inout Board, touching ids: [String], anchors: [String]) {
        let index = GlueGeometry.index(board.glues)
        var done = Set<String>()
        for id in ids {
            guard let glueId = index[id], done.insert(glueId).inserted, let glue = board.glues[glueId], !glue.collapsed else { continue }
            let held = anchors.filter(glue.widgetIds.contains)
            let requested = ids.filter(glue.widgetIds.contains)
            board.widgets = GlueGeometry.reflowCluster(board.widgets, memberIds: glue.widgetIds, anchorIds: held.isEmpty ? requested : held)
        }
    }

    /// Release-time housekeeping: clusters must equal what visibly touches;
    /// a member released from a fold is never left a 1×1 icon.
    static func reconcileGlues(_ board: inout Board, mint: IdMinter) {
        let previous = board.glues
        guard let reconciled = GlueGeometry.reconcile(board.widgets, glues: previous, mint: mint) else { return }
        board.widgets = GlueGeometry.unfoldReleasedFoldedMembers(board.widgets, previous: previous, next: reconciled)
        board.glues = reconciled
    }

    /// A member whose footprint changed (pin, icon ↔ full, resize): the
    /// cluster gives way around it, closes any hole it left, and splits off
    /// whatever no longer touches (`setWidgetScaleState`, `toggleWidgetPinned`,
    /// `resizeWidget` inside a group).
    static func repackCluster(_ board: inout Board, around widgetId: String, mint: IdMinter, reconcile: Bool = true) {
        let index = GlueGeometry.index(board.glues)
        guard let glueId = index[widgetId], let glue = board.glues[glueId], !glue.collapsed else { return }
        board.widgets = GlueGeometry.reflowCluster(board.widgets, memberIds: glue.widgetIds, anchorIds: [widgetId])
        board.widgets = GlueGeometry.closeClusterGaps(board.widgets, memberIds: glue.widgetIds, anchorIds: [widgetId])
        if reconcile { reconcileGlues(&board, mint: mint) }
    }
}
