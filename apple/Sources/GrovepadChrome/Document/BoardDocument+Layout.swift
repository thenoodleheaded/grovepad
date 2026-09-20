import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The board making room at a drop: `widgetLayoutSlice.ts`'s `settleWidgets`
// and `snapWidgetToGrid`, over the pure passes in `Layout/WidgetSettling.swift`.
// Called by `CanvasInteraction.cardDragEnd` inside the drag's gesture, so the
// drag and its settle are one undo step.
//
// Owner's rule (18 Sep 2026; a deviation from the web, recorded in
// apple/AGENTS.md): cards push each other away ONLY when a dragged card is let
// go, and when a card is pinned open (21 Sep 2026). The web also settles on create, paste, nudge, resize, scale state, pin,
// rename, parent links, glue actions and tree commits; the port does not.
// ---------------------------------------------------------------------------

extension BoardDocument {
    /// `settleWidgets(ids)` — the release settle. A glued card never settles
    /// alone (its whole cluster snaps rigidly by one delta), the drop is
    /// where the generation floor lands, and clusters are then re-derived
    /// from what visibly touches.
    public func settleWidgets(_ ids: [String]) {
        let expanded = expandedThroughClusters(ids)
        guard !expanded.isEmpty else { return }
        let mint = self.mint
        commit("Move") { board in
            board.widgets = WidgetSettling.settleWithGenerationFloor(board.widgets, activeIds: expanded, glueIndex: GlueGeometry.index(board.glues), relations: board.relations)
            BoardDocument.reconcileGlues(&board, mint: mint)
        }
    }

    /// `snapWidgetToGrid(id)`: a dropped icon lands on the grid (its edge is
    /// continuous, so the settle never snaps it), then the overlap check
    /// runs anchored on it.
    public func snapWidgetToGrid(_ id: String) {
        guard let widget = board.widgets[id], !widget.metadata.locked else { return }
        let snapped = DragResize.snappedToGrid(widget)
        guard snapped.position != widget.position else { return }
        commit("Move") { board in
            board.widgets[id] = snapped
            board.widgets = WidgetSettling.settleWithGenerationFloor(board.widgets, activeIds: [id], glueIndex: GlueGeometry.index(board.glues), relations: board.relations, anchorIds: [id])
        }
    }
}
