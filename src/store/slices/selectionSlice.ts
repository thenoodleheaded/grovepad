import type { CanvasMeta, Relation, Widget, WidgetGlue, WidgetMetadata } from '../../types/spatial'
import { GRID_SIZE, snapToGrid } from '../../types/spatial'
import { clampIconEdge } from '../../utils/widgetScale'
import { getOpaqueWidgetType } from '../../utils/persistedBoardSchema'
import {
  COLLAPSED_MEMBER_SIZE,
  closeClusterGaps,
  reconcileGlueClusters,
  refoldCollapsedCluster,
  unfoldReleasedFoldedMembers,
} from '../../utils/glueGeometry'
import { useToastStore } from '../useToastStore'
import { buildGlueIndex, computeBlockedWidgetIds } from '../widgetGraph'
import { settleWidgetsByCanvas } from '../widgetSettling'
import { uniqueExistingIds, withWidget } from '../widgetCollection'
import { analyzeWidgetDeletion } from '../widgetDeletion'
import { expandedIconSize, restingTileSize } from '../../utils/widgetRest'
import { widgetDefinition } from '../../widgets/registry'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
export function createSelectionSlice({ set, get, pushHistory, markSpawned }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  selectWidget: (id, additive) => {
    set((state) => {
      if (!state.widgets[id]) return state
      // A glued widget is one welded object: selecting a member selects the
      // whole cluster, the same unit a plain drag moves. Keeps select and drag
      // agreeing on what a cluster is.
      const glueId = state.widgetGlueIndex[id]
      const clusterIds = (
        glueId ? state.glues[glueId]?.widgetIds ?? [id] : [id]
      ).filter((wid) => state.widgets[wid])
      if (additive) {
        const next = new Set(state.selectedIds)
        if (clusterIds.every((wid) => next.has(wid))) {
          clusterIds.forEach((wid) => next.delete(wid))
        } else {
          clusterIds.forEach((wid) => next.add(wid))
        }
        return { selectedIds: next }
      }
      if (
        state.selectedIds.size === clusterIds.length &&
        clusterIds.every((wid) => state.selectedIds.has(wid))
      ) {
        return state
      }
      return { selectedIds: new Set(clusterIds) }
    })
  },

  selectWidgets: (ids) => {
    set((state) => {
      const next = new Set(uniqueExistingIds(ids, state.widgets))
      if (next.size === state.selectedIds.size && [...next].every((id) => state.selectedIds.has(id))) {
        return state
      }
      return { selectedIds: next }
    })
  },

  clearSelection: () => {
    set((state) =>
      state.selectedIds.size === 0 ? state : { selectedIds: new Set<string>() },
    )
  },

  deleteWidgets: (ids) => {
    const impact = analyzeWidgetDeletion(get(), ids)
    const deletableIds = impact.directWidgetIds
    const deletedCount = impact.removedWidgetIds.size
    if (deletedCount === 0) return
    pushHistory()
    set((state) => {
      const deletedIds = new Set(deletableIds)
      if (deletedIds.size === 0) return state

      // Cascade: deleting a canvas node deletes its canvas, everything on it,
      // and recursively any canvases nested deeper down that branch.
      const removedCanvasIds = impact.removedCanvasIds

      const widgets: Record<string, Widget> = {}
      for (const [id, widget] of Object.entries(state.widgets)) {
        if (deletedIds.has(id) || removedCanvasIds.has(widget.canvasId)) continue
        widgets[id] = widget
      }

      let canvases = state.canvases
      let canvasViews = state.canvasViews
      if (removedCanvasIds.size > 0) {
        canvases = { ...state.canvases }
        canvasViews = { ...state.canvasViews }
        for (const id of removedCanvasIds) {
          delete canvases[id]
          delete canvasViews[id]
        }
      }

      const relations: Record<string, Relation> = {}
      for (const [relationId, relation] of Object.entries(state.relations)) {
        if (!widgets[relation.fromId] || !widgets[relation.toId]) continue
        relations[relationId] = relation
      }

      let connections = state.connections
      for (const connection of Object.values(state.connections)) {
        if (widgets[connection.fromId] && widgets[connection.toId]) continue
        if (connections === state.connections) connections = { ...state.connections }
        delete connections[connection.id]
      }

      // A cluster that lost a member closes ranks instead of splitting:
      // survivors of a deleted middle card slide back together until they
      // touch (a collapsed group re-stacks its block), so the group stays ONE
      // group and only then is membership re-derived from what still welds.
      let repacked = widgets
      let glueRecords = state.glues
      for (const glue of Object.values(state.glues)) {
        const survivors = glue.widgetIds.filter((id) => repacked[id])
        if (survivors.length === glue.widgetIds.length || survivors.length < 2) continue
        if (glue.collapsed === true) {
          const folded = refoldCollapsedCluster(repacked, survivors, glue.restore, glue.foldedAt)
          repacked = folded.widgets
          if (glueRecords === state.glues) glueRecords = { ...state.glues }
          glueRecords[glue.id] = {
            ...glue,
            widgetIds: survivors,
            restore: folded.restore,
            foldedAt: folded.anchor,
          }
        } else {
          repacked = closeClusterGaps(repacked, survivors)
        }
      }
      const glues = reconcileGlueClusters(repacked, glueRecords)
      // If deleting a member drops a collapsed group below two, the lone
      // survivor is no longer a folded set — it must not be left a 1×1 icon.
      const restoredWidgets = unfoldReleasedFoldedMembers(repacked, state.glues, glues)

      const selectedIds = new Set(
        [...state.selectedIds].filter((id) => restoredWidgets[id]),
      )

      return {
        widgets: restoredWidgets,
        widgetStructureVersion: state.widgetStructureVersion + 1,
        canvases,
        canvasViews,
        relations,
        connections,
        glues,
        widgetGlueIndex: buildGlueIndex(glues),
        selectedIds,
        blockedWidgetIds: computeBlockedWidgetIds(relations),
        contextMenu:
          state.contextMenu && deletedIds.has(state.contextMenu.widgetId)
            ? null
            : state.contextMenu,
      }
    })
    useToastStore.getState().addToast(
      impact.removedCanvasIds.size > 0
        ? `Deleted ${deletedCount} widgets across ${impact.removedCanvasIds.size} nested canvas${impact.removedCanvasIds.size === 1 ? '' : 'es'}`
        : deletedCount === 1 ? 'Deleted widget' : `Deleted ${deletedCount} widgets`,
      { action: { label: 'Undo', run: () => get().undo() } },
    )
  },

  duplicateWidgets: (ids) => {
    const state = get()
    const candidateIds = uniqueExistingIds(ids, state.widgets)
    const validIds = candidateIds.filter((id) => !getOpaqueWidgetType(state.widgets[id]!))
    if (validIds.length !== candidateIds.length) {
      useToastStore.getState().addToast('Newer-version widgets were kept in place and not duplicated')
    }
    if (validIds.length === 0) return []
    pushHistory()

    const clones: Widget[] = []
    const newCanvases: CanvasMeta[] = []
    for (const id of validIds) {
      const source = state.widgets[id]!
      const clone: Widget = {
        ...source,
        id: crypto.randomUUID(),
        title: `${source.title} copy`,
        position: {
          x: snapToGrid(source.position.x + GRID_SIZE),
          y: snapToGrid(source.position.y + GRID_SIZE),
        },
        data: structuredClone(source.data),
        metadata: structuredClone(source.metadata),
      }
      if (clone.type === 'canvas_node') {
        const subCanvasId = crypto.randomUUID()
        newCanvases.push({
          id: subCanvasId,
          name: clone.title,
          workspaceId: state.activeWorkspaceId,
          parentCanvasId: source.canvasId,
        })
        clone.data = { canvasId: subCanvasId }
      }
      clones.push(clone)
    }

    const newIds = clones.map((clone) => clone.id)
    // Wires fully inside the duplicated set travel with it — a wired cluster
    // duplicates as a working circuit, not a pile of disconnected cards.
    const cloneIdBySource = new Map(validIds.map((id, index) => [id, newIds[index]!]))
    set((current) => {
      const widgets = { ...current.widgets }
      for (const clone of clones) widgets[clone.id] = clone
      let canvases = current.canvases
      if (newCanvases.length > 0) {
        canvases = { ...current.canvases }
        for (const canvas of newCanvases) canvases[canvas.id] = canvas
      }
      let connections = current.connections
      for (const connection of Object.values(current.connections)) {
        const fromClone = cloneIdBySource.get(connection.fromId)
        const toClone = cloneIdBySource.get(connection.toId)
        if (!fromClone || !toClone) continue
        if (connections === current.connections) connections = { ...current.connections }
        const id = crypto.randomUUID()
        connections[id] = { ...connection, id, fromId: fromClone, toId: toClone }
      }
      // A glue cluster wholly inside the duplicated set travels too: the copies
      // come out welded the same way (name, fold state and all), not as a loose
      // pile that only looks like the group it was copied from. The restore map
      // and fold anchor shift by the same one-cell offset the clones did.
      let glues = current.glues
      for (const glue of Object.values(current.glues)) {
        if (!glue.widgetIds.every((id) => cloneIdBySource.has(id))) continue
        if (glues === current.glues) glues = { ...current.glues }
        const id = crypto.randomUUID()
        const cloneGlue: WidgetGlue = {
          ...glue,
          id,
          widgetIds: glue.widgetIds.map((memberId) => cloneIdBySource.get(memberId)!),
        }
        if (glue.restore) {
          const restore: typeof glue.restore = {}
          for (const [memberId, entry] of Object.entries(glue.restore)) {
            const cloneId = cloneIdBySource.get(memberId)
            if (!cloneId) continue
            restore[cloneId] = { ...entry, x: entry.x + GRID_SIZE, y: entry.y + GRID_SIZE }
          }
          cloneGlue.restore = restore
        }
        if (glue.foldedAt) {
          cloneGlue.foldedAt = { x: glue.foldedAt.x + GRID_SIZE, y: glue.foldedAt.y + GRID_SIZE }
        }
        glues[id] = cloneGlue
      }
      const widgetGlueIndex = glues === current.glues ? current.widgetGlueIndex : buildGlueIndex(glues)
      return {
        // Settle with the fresh index so a duplicated cluster snaps rigidly as
        // one unit and its weld seams survive, exactly like the original.
        widgets: settleWidgetsByCanvas(widgets, newIds, widgetGlueIndex),
        widgetStructureVersion: current.widgetStructureVersion + 1,
        selectedIds: new Set(newIds),
        contextMenu: null,
        canvases,
        connections,
        glues,
        widgetGlueIndex,
      }
    })
    for (const id of newIds) markSpawned(id)
    useToastStore.getState().addToast(
      newIds.length === 1 ? 'Duplicated 1 widget' : `Duplicated ${newIds.length} widgets`,
    )
    return newIds
  },

  pasteWidgets: (sources) => {
    const supportedSources = sources.filter((source) => !getOpaqueWidgetType(source))
    if (supportedSources.length !== sources.length) {
      useToastStore.getState().addToast('Update Grovepad before copying newer-version widgets')
    }
    if (supportedSources.length === 0) return []
    pushHistory()
    const offset = { x: GRID_SIZE * 2, y: GRID_SIZE * 2 }
    const activeCanvasId = get().activeCanvasId
    const activeWorkspaceId = get().activeWorkspaceId
    const newCanvases: CanvasMeta[] = []
    const clones: Widget[] = supportedSources.map((src) => {
      const clone: Widget = {
        ...src,
        id: crypto.randomUUID(),
        canvasId: activeCanvasId,
        position: {
          x: snapToGrid(src.position.x + offset.x),
          y: snapToGrid(src.position.y + offset.y),
        },
        data: structuredClone(src.data),
        metadata: structuredClone(src.metadata),
      }
      // A member of a COLLAPSED cluster is a 1×1 icon only because its group is
      // folded, and the clipboard carries widget records with no glue record
      // behind them. Pasted as-is it lands below the 2×2 aim-at floor in no
      // cluster at all: no group frame, no Expand button, nothing to click —
      // the single carve-out from the floor is a member of a folded group, and
      // this is not one. Same restore the release paths perform.
      if (
        clone.iconified === true &&
        clone.size.width === COLLAPSED_MEMBER_SIZE.width &&
        clone.size.height === COLLAPSED_MEMBER_SIZE.height
      ) {
        clone.iconified = false
        clone.size = clone.expandedSize ?? clone.size
        clone.expandedSize = undefined
      }
      // Pasted canvas nodes get fresh empty backing canvases.
      if (clone.type === 'canvas_node') {
        const subCanvasId = crypto.randomUUID()
        newCanvases.push({
          id: subCanvasId,
          name: clone.title,
          workspaceId: activeWorkspaceId,
          parentCanvasId: activeCanvasId,
        })
        clone.data = { canvasId: subCanvasId }
      }
      return clone
    })
    const cloneIds = clones.map((c) => c.id)
    set((state) => {
      const next = { ...state.widgets }
      for (const clone of clones) next[clone.id] = clone
      let canvases = state.canvases
      if (newCanvases.length > 0) {
        canvases = { ...state.canvases }
        for (const canvas of newCanvases) canvases[canvas.id] = canvas
      }
      return {
        widgets: settleWidgetsByCanvas(next, cloneIds),
        widgetStructureVersion: state.widgetStructureVersion + 1,
        selectedIds: new Set(cloneIds),
        canvases,
      }
    })
    for (const clone of clones) markSpawned(clone.id)
    useToastStore.getState().addToast(
      clones.length === 1 ? 'Pasted 1 widget' : `Pasted ${clones.length} widgets`,
    )
    return cloneIds
  },

  renamingWidgetId: null,
  startRenaming: (id) => {
    if (!get().widgets[id] || get().renamingWidgetId === id) return
    set({ renamingWidgetId: id })
  },
  stopRenaming: () =>
    set((state) => (state.renamingWidgetId ? { renamingWidgetId: null } : state)),

  toggleWidgetLocked: (widgetId) => {
    if (!get().widgets[widgetId]) return
    pushHistory()
    set((state) => ({
      widgets: withWidget(state.widgets, widgetId, (widget) => ({
        ...widget,
        metadata: { ...widget.metadata, locked: !widget.metadata.locked },
      })),
    }))
  },

  toggleWidgetPinned: (widgetId, options) => {
    if (!get().widgets[widgetId]) return
    pushHistory()
    const glueId = get().widgetGlueIndex[widgetId]
    set((state) => ({
      widgets: withWidget(state.widgets, widgetId, (widget) => {
        const nextPinned = !widget.metadata.pinned
        const metadata: WidgetMetadata = { ...widget.metadata, pinned: nextPinned }
        let position = widget.position
        // A welded member holds the corner it is welded at, exactly like any
        // other in-group footprint change: its clustermates give way when it
        // grows and close ranks when it shrinks. Re-centring it here would
        // slide it off its own weld and off the grid the group sits on.
        const welded = Boolean(glueId)
        if (nextPinned) {
          // Remember what the pin interrupted. A card being peeked open out of
          // an icon is still STORED as that icon, so the record is its own best
          // witness and outranks whatever the caller passed; only a card that
          // is genuinely full needs the caller to say where it came from.
          metadata.pinnedFrom = widget.iconified === true
            ? { kind: 'icon' as const, width: widget.size.width, height: widget.size.height }
            : options?.from ?? { kind: 'rest' as const }
        } else {
          delete metadata.pinnedFrom
        }
        // Unpinning a card that was an icon before it was pinned puts the icon
        // back — at its own square, re-centred on the card the user can see, so
        // it folds into its own middle instead of collapsing to the top-left.
        // Without this every unpin dropped the card onto its resting face, and
        // an icon that was opened, pinned, and let go never came back.
        const restoreIcon =
          !nextPinned && widget.metadata.pinnedFrom?.kind === 'icon'
            ? widget.metadata.pinnedFrom
            : null
        if (restoreIcon) {
          const edge = clampIconEdge(Math.min(restoreIcon.width, restoreIcon.height))
          const icon = { width: edge, height: edge }
          return {
            ...widget,
            iconified: true,
            expandedSize: widget.size,
            size: icon,
            position: welded
              ? widget.position
              : {
                  x: widget.position.x + (widget.size.width - icon.width) / 2,
                  y: widget.position.y + (widget.size.height - icon.height) / 2,
                },
            metadata,
          }
        }
        if (options?.absorbOffset) {
          // Pinning an ephemerally expanded card absorbs its view offset into
          // the stored anchor, in the same history step as the pin itself. The
          // expanded card was DRAWN at position+offset while its anchor stayed
          // at the tile it opened from; a pinned card draws exactly where its
          // saved position says, so without this hand-off the card jumped
          // diagonally down-right by the whole offset the instant it was pinned.
          // The absorbed offset is view geometry and lands anywhere — snap the
          // result to the grid BEFORE the settle pass reads it: the settle
          // anchors the pinned card (never re-snaps it), so an off-grid pin
          // would shove its clustermates off rhythm by exactly that fraction.
          position = {
            x: snapToGrid(position.x + options.absorbOffset.x),
            y: snapToGrid(position.y + options.absorbOffset.y),
          }
        } else if (!nextPinned && !welded) {
          // Unpinning a card that falls back to a resting tile: shift its anchor
          // so the tile lands CENTRED under the full card, so the card collapses
          // toward its own centre instead of shrinking into its top-left corner.
          // This is the exact inverse of the offset a pin absorbs, so pinning and
          // unpinning round-trips leave the anchor exactly where it started.
          const rests =
            widgetDefinition(widget.type).restingFace !== false && widget.iconified !== true
          if (rests) {
            const tile = restingTileSize(widget)
            position = {
              x: position.x + (widget.size.width - tile.width) / 2,
              y: position.y + (widget.size.height - tile.height) / 2,
            }
          }
        }
        // Peeking at an icon leaves the board record alone — it is still an
        // icon, sitting in its own little square, while the open card is drawn
        // over the top of it. Pinning is the moment that peek becomes real, so
        // this is where the icon → card swap finally commits, and the settle
        // pass below is where the neighbours give way to it. Both halves land
        // inside the single history step the pin already opened, and the box
        // comes from the same `expandedIconSize` the peek was drawn at, so
        // nothing resizes under the user at the instant they pin.
        if (nextPinned && widget.iconified === true) {
          return {
            ...widget,
            iconified: false,
            size: expandedIconSize(widget),
            expandedSize: undefined,
            position,
            metadata,
          }
        }
        return { ...widget, position, metadata }
      }),
    }))
    // Pinning swaps a compact resting tile for the full stored card (and
    // unpinning does the reverse) — a real footprint change, so it runs the
    // overlap check. Inside a glue cluster that check also re-packs the cluster
    // around the pinned card (see reflowWeldedCluster): clustermates give way
    // to the card that just grew, and the welds hold. An UNPIN is the shrink
    // half of the same story, and nothing in the overlap check ever pulls
    // anything closer — so the cluster closes ranks here, or unpinning would
    // leave a card-sized hole where the open card used to be.
    set((state) => {
      let widgets = settleWidgetsByCanvas(state.widgets, [widgetId], state.widgetGlueIndex, {
        anchorIds: [widgetId],
      })
      const cluster = glueId ? state.glues[glueId] : undefined
      if (cluster) widgets = closeClusterGaps(widgets, cluster.widgetIds, [widgetId])
      return { widgets }
    })
  },

  toggleWidgetFavorite: (widgetId) => {
    if (!get().widgets[widgetId]) return
    pushHistory()
    set((state) => ({
      widgets: withWidget(state.widgets, widgetId, (widget) => ({
        ...widget,
        metadata: { ...widget.metadata, favorite: !widget.metadata.favorite },
      })),
    }))
  },

  updateWidgetMetadata: (widgetId, metadata) => {
    if (!get().widgets[widgetId]) return
    pushHistory()
    set((state) => ({
      widgets: withWidget(state.widgets, widgetId, (widget) => ({
        ...widget,
        metadata: { ...widget.metadata, ...metadata },
      })),
    }))
  },

  updateWidgetsMetadata: (ids, metadata) => {
    const existing = uniqueExistingIds([...ids], get().widgets)
    if (existing.length === 0) return
    pushHistory()
    set((state) => {
      const widgets = { ...state.widgets }
      for (const id of existing) {
        const widget = widgets[id]!
        widgets[id] = { ...widget, metadata: { ...widget.metadata, ...metadata } }
      }
      return { widgets }
    })
  },

  bringWidgetToFront: (widgetId) => {
    set((state) => {
      if (!state.widgets[widgetId]) return state
      const top = Math.max(0, ...Object.values(state.widgets).map((item) => item.metadata.zIndex ?? 0)) + 1
      return {
        widgets: withWidget(state.widgets, widgetId, (item) => ({
          ...item,
          metadata: { ...item.metadata, zIndex: top },
        })),
      }
    })
  },
  }
}
