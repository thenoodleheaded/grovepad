import type { CanvasMeta, Relation, Widget } from '../../types/spatial'
import { GRID_SIZE, snapToGrid } from '../../types/spatial'
import { getOpaqueWidgetType } from '../../utils/persistedBoardSchema'
import { reconcileGlueClusters } from '../../utils/glueGeometry'
import { useToastStore } from '../useToastStore'
import { buildGlueIndex, computeBlockedWidgetIds } from '../widgetGraph'
import { settleWidgetsByCanvas } from '../widgetSettling'
import { uniqueExistingIds, withWidget } from '../widgetCollection'
import { analyzeWidgetDeletion } from '../widgetDeletion'
import { restingTileSize } from '../../utils/widgetRest'
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

  deleteWidget: (id) => {
    get().deleteWidgets([id])
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

      // Drop deleted members and, since deleting the card that joined two ends
      // of a cluster leaves the survivors no longer touching, re-derive
      // clusters from what still welds.
      const glues = reconcileGlueClusters(widgets, state.glues)

      const selectedIds = new Set(
        [...state.selectedIds].filter((id) => widgets[id]),
      )

      return {
        widgets,
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
      return {
        widgets: settleWidgetsByCanvas(widgets, newIds),
        widgetStructureVersion: current.widgetStructureVersion + 1,
        selectedIds: new Set(newIds),
        contextMenu: null,
        canvases,
        connections,
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
    set((state) => ({
      widgets: withWidget(state.widgets, widgetId, (widget) => {
        const nextPinned = !widget.metadata.pinned
        let position = widget.position
        if (options?.absorbOffset) {
          // Pinning an ephemerally expanded card absorbs its view offset into
          // the stored anchor, in the same history step as the pin itself. The
          // expanded card was DRAWN at position+offset while its anchor stayed
          // at the tile it opened from; a pinned card draws exactly where its
          // saved position says, so without this hand-off the card jumped
          // diagonally down-right by the whole offset the instant it was pinned.
          position = {
            x: position.x + options.absorbOffset.x,
            y: position.y + options.absorbOffset.y,
          }
        } else if (!nextPinned) {
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
        return { ...widget, position, metadata: { ...widget.metadata, pinned: nextPinned } }
      }),
    }))
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
