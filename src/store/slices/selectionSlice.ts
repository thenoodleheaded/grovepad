import type { CanvasMeta, CanvasNodeData, Relation, Vector2D, Widget, WidgetGlue, WidgetMetadata } from '../../types/spatial'
import type { Connection } from '../../types/circuit'
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
import {
  captureClipboardPayload,
  payloadFromWidgets,
  setClipboardPayload,
  type WidgetClipboardPayload,
} from '../../utils/widgetClipboard'
import { analyzeWidgetDeletion } from '../widgetDeletion'
import { resolveCanvasTabs, type CanvasTabPosition } from '../canvasTabs'
import { expandedIconSize, restingTileSize } from '../../utils/widgetRest'
import { widgetDefinition } from '../../widgets/registry'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'

/** Prune a payload to the widgets `keep` accepts, dropping structure records
 * that reference a pruned card so every surviving record stays resolvable. */
function filterPayloadWidgets(
  payload: WidgetClipboardPayload,
  keep: (widget: Widget) => boolean,
): WidgetClipboardPayload {
  const widgets = payload.widgets.filter(keep)
  const canvasWidgets = payload.canvasWidgets.filter(keep)
  if (
    widgets.length === payload.widgets.length &&
    canvasWidgets.length === payload.canvasWidgets.length
  ) {
    return payload
  }
  const closure = new Set([...widgets, ...canvasWidgets].map((widget) => widget.id))
  return {
    widgets,
    canvases: payload.canvases,
    canvasWidgets,
    connections: payload.connections.filter(
      (connection) => closure.has(connection.fromId) && closure.has(connection.toId),
    ),
    glues: payload.glues.filter((glue) => glue.widgetIds.every((id) => closure.has(id))),
    relations: payload.relations.filter(
      (relation) => closure.has(relation.fromId) && closure.has(relation.toId),
    ),
  }
}

interface MaterializedClones {
  /** Every clone, roots first. */
  widgets: Widget[]
  /** The clones of the directly copied cards — what gets selected and settled. */
  rootIds: string[]
  canvases: CanvasMeta[]
  connections: Connection[]
  glues: WidgetGlue[]
  relations: Relation[]
}

/**
 * Turn a clipboard payload into fresh records: new ids everywhere, endpoints
 * remapped, root cards offset onto their landing canvas, captured canvas
 * subtrees rebuilt intact underneath their cloned canvas cards. Duplicate and
 * paste share this one materializer so a copied structure always comes out
 * the same way, whichever door it went through.
 */
function materializeClipboardPayload(
  payload: WidgetClipboardPayload,
  options: {
    offset: Vector2D
    /** Canvas the root clones land on; null keeps each root's own canvas (duplicate). */
    targetCanvasId: string | null
    workspaceId: string
    titleSuffix?: string
  },
): MaterializedClones {
  const { offset, targetCanvasId, workspaceId, titleSuffix = '' } = options
  const widgetIdMap = new Map<string, string>()
  for (const widget of payload.widgets) widgetIdMap.set(widget.id, crypto.randomUUID())
  for (const widget of payload.canvasWidgets) widgetIdMap.set(widget.id, crypto.randomUUID())
  const canvasIdMap = new Map<string, string>()
  for (const canvas of payload.canvases) canvasIdMap.set(canvas.id, crypto.randomUUID())
  const carriedGlueMembers = new Set(payload.glues.flatMap((glue) => glue.widgetIds))
  const rootIdSet = new Set(payload.widgets.map((widget) => widget.id))

  const canvases: CanvasMeta[] = []
  const cloneWidgets: Widget[] = []
  /** source canvas id → where its clone re-parents and what it is called now. */
  const capturedCanvasHomes = new Map<string, { parentCanvasId: string; name: string }>()

  const cloneOne = (source: Widget, isRoot: boolean): Widget => {
    const clone: Widget = {
      ...source,
      id: widgetIdMap.get(source.id)!,
      canvasId: isRoot ? targetCanvasId ?? source.canvasId : canvasIdMap.get(source.canvasId)!,
      position: isRoot
        ? {
            x: snapToGrid(source.position.x + offset.x),
            y: snapToGrid(source.position.y + offset.y),
          }
        : { ...source.position },
      title: isRoot && titleSuffix ? `${source.title}${titleSuffix}` : source.title,
      data: structuredClone(source.data),
      metadata: structuredClone(source.metadata),
    }
    // A member of a COLLAPSED cluster is a 1×1 icon only because its group is
    // folded. When the fold travels with the clone (its glue record is in the
    // payload) the icon state is legitimate and stays; otherwise the clone
    // belongs to no cluster and must not land below the 2×2 aim-at floor —
    // the single carve-out from the floor is a member of a folded group.
    if (
      clone.iconified === true &&
      clone.size.width === COLLAPSED_MEMBER_SIZE.width &&
      clone.size.height === COLLAPSED_MEMBER_SIZE.height &&
      !carriedGlueMembers.has(source.id)
    ) {
      clone.iconified = false
      clone.size = clone.expandedSize ?? clone.size
      clone.expandedSize = undefined
    }
    if (clone.type === 'canvas_node') {
      const sourceCanvasId = (source.data as CanvasNodeData).canvasId
      const mapped = canvasIdMap.get(sourceCanvasId)
      if (mapped) {
        clone.data = { ...(clone.data as CanvasNodeData), canvasId: mapped }
        capturedCanvasHomes.set(sourceCanvasId, {
          parentCanvasId: clone.canvasId,
          name: clone.title,
        })
      } else {
        // Backing canvas was not captured (bare-widget payloads): the clone
        // gets a fresh empty canvas, parented on the canvas the clone lives on.
        const subCanvasId = crypto.randomUUID()
        canvases.push({
          id: subCanvasId,
          name: clone.title,
          workspaceId,
          parentCanvasId: clone.canvasId,
        })
        clone.data = { ...(clone.data as CanvasNodeData), canvasId: subCanvasId }
      }
    }
    return clone
  }

  for (const source of payload.widgets) cloneWidgets.push(cloneOne(source, true))
  const rootIds = cloneWidgets.map((clone) => clone.id)
  for (const source of payload.canvasWidgets) cloneWidgets.push(cloneOne(source, false))

  // Captured canvases re-emerge under the landing workspace. A canvas whose
  // parent was captured too keeps the mapped parent; the top of each captured
  // subtree re-parents onto the canvas its owning clone card now lives on and
  // takes that card's (possibly suffixed) title, exactly like renameCanvas
  // keeps card and canvas names mirrored.
  for (const canvas of payload.canvases) {
    const mappedParent = canvas.parentCanvasId ? canvasIdMap.get(canvas.parentCanvasId) : undefined
    const home = capturedCanvasHomes.get(canvas.id)
    canvases.push({
      ...canvas,
      id: canvasIdMap.get(canvas.id)!,
      name: mappedParent ? canvas.name : home?.name ?? canvas.name,
      workspaceId,
      parentCanvasId: mappedParent ?? home?.parentCanvasId ?? targetCanvasId ?? canvas.parentCanvasId,
    })
  }

  const connections = payload.connections.map((connection) => ({
    ...connection,
    id: crypto.randomUUID(),
    fromId: widgetIdMap.get(connection.fromId)!,
    toId: widgetIdMap.get(connection.toId)!,
  }))
  // A glue whose members are root cards moved by the paste offset, so its
  // restore map and fold anchor shift with it; a glue inside a captured
  // canvas kept its coordinates and shifts by nothing.
  const glues = payload.glues.map((glue) => {
    const shift = rootIdSet.has(glue.widgetIds[0]!) ? offset : { x: 0, y: 0 }
    const clone: WidgetGlue = {
      ...glue,
      id: crypto.randomUUID(),
      widgetIds: glue.widgetIds.map((memberId) => widgetIdMap.get(memberId)!),
    }
    if (glue.restore) {
      const restore: NonNullable<WidgetGlue['restore']> = {}
      for (const [memberId, entry] of Object.entries(glue.restore)) {
        const cloneId = widgetIdMap.get(memberId)
        if (!cloneId) continue
        restore[cloneId] = { ...entry, x: entry.x + shift.x, y: entry.y + shift.y }
      }
      clone.restore = restore
    }
    if (glue.foldedAt) {
      clone.foldedAt = { x: glue.foldedAt.x + shift.x, y: glue.foldedAt.y + shift.y }
    }
    return clone
  })
  const relations = payload.relations.map((relation) => ({
    ...relation,
    id: crypto.randomUUID(),
    fromId: widgetIdMap.get(relation.fromId)!,
    toId: widgetIdMap.get(relation.toId)!,
  }))

  return { widgets: cloneWidgets, rootIds, canvases, connections, glues, relations }
}

export function createSelectionSlice({ set, get, pushHistory, markSpawned }: WidgetStoreSliceContext): WidgetStoreSlice {
  /** One writer for landing materialized clones on the board, shared by
   * duplicate and paste: merge every record class, rebuild the glue index,
   * recompute blockers when relations arrived, settle the root clones as
   * rigid cluster units, and select what was just made. */
  const commitClones = (clones: MaterializedClones) => {
    set((current) => {
      const widgets = { ...current.widgets }
      for (const clone of clones.widgets) widgets[clone.id] = clone
      let canvases = current.canvases
      if (clones.canvases.length > 0) {
        canvases = { ...current.canvases }
        for (const canvas of clones.canvases) canvases[canvas.id] = canvas
      }
      let connections = current.connections
      if (clones.connections.length > 0) {
        connections = { ...current.connections }
        for (const connection of clones.connections) connections[connection.id] = connection
      }
      let glues = current.glues
      if (clones.glues.length > 0) {
        glues = { ...current.glues }
        for (const glue of clones.glues) glues[glue.id] = glue
      }
      let relations = current.relations
      let blockedWidgetIds = current.blockedWidgetIds
      if (clones.relations.length > 0) {
        relations = { ...current.relations }
        for (const relation of clones.relations) relations[relation.id] = relation
        blockedWidgetIds = computeBlockedWidgetIds(relations)
      }
      const widgetGlueIndex = glues === current.glues ? current.widgetGlueIndex : buildGlueIndex(glues)
      return {
        // Settle with the fresh index so a cloned cluster snaps rigidly as
        // one unit and its weld seams survive, exactly like the original.
        widgets: settleWidgetsByCanvas(widgets, clones.rootIds, widgetGlueIndex),
        widgetStructureVersion: current.widgetStructureVersion + 1,
        selectedIds: new Set(clones.rootIds),
        contextMenu: null,
        canvases,
        connections,
        glues,
        widgetGlueIndex,
        relations,
        blockedWidgetIds,
      }
    })
    for (const id of clones.rootIds) markSpawned(id)
  }

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

  deleteWidgets: (ids, options) => {
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
      // A canvas node only ever deletes canvases *below* the one you are
      // standing on, so the active canvas survives — but another tab can be
      // parked down that branch, and those tabs have to go with it.
      let tabs: CanvasTabPosition = {
        openTabs: state.openTabs,
        activeTabId: state.activeTabId,
        activeCanvasId: state.activeCanvasId,
      }
      if (removedCanvasIds.size > 0) {
        canvases = { ...state.canvases }
        canvasViews = { ...state.canvasViews }
        for (const id of removedCanvasIds) {
          delete canvases[id]
          delete canvasViews[id]
        }
        tabs = resolveCanvasTabs(state, canvases)
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
        openTabs: tabs.openTabs,
        activeTabId: tabs.activeTabId,
        activeCanvasId: tabs.activeCanvasId,
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
    // A cut is a move in progress, not a loss — saying "Deleted" there reads as
    // if the widgets are gone when they are sitting on the clipboard.
    const verb = options?.asCut ? 'Cut' : 'Deleted'
    useToastStore.getState().addToast(
      impact.removedCanvasIds.size > 0
        ? `${verb} ${deletedCount} widgets across ${impact.removedCanvasIds.size} nested canvas${impact.removedCanvasIds.size === 1 ? '' : 'es'}`
        : deletedCount === 1 ? `${verb} widget` : `${verb} ${deletedCount} widgets`,
      { action: { label: 'Undo', run: () => get().undo() } },
    )
  },

  /**
   * The one owner of "snapshot these onto the clipboard", so the keyboard and
   * the context menu cannot drift apart on what a copy carries: the cards plus
   * every wire, glue cluster, relation, and canvas subtree wholly inside them.
   */
  copyWidgets: (ids) => {
    const state = get()
    const validIds = uniqueExistingIds([...ids], state.widgets)
    if (validIds.length === 0) return
    setClipboardPayload(captureClipboardPayload(state, validIds))
    useToastStore.getState().addToast(
      validIds.length === 1 ? 'Copied 1 widget' : `Copied ${validIds.length} widgets`,
    )
  },

  /**
   * The one owner of "put these on the clipboard, then remove them", so the
   * keyboard and the context menu cannot drift apart on either half. The
   * capture happens before the delete so a cut canvas card carries the very
   * subtree the deletion cascade is about to remove.
   */
  cutWidgets: (ids) => {
    const state = get()
    const validIds = uniqueExistingIds([...ids], state.widgets)
    if (validIds.length === 0) return
    setClipboardPayload(captureClipboardPayload(state, validIds))
    get().deleteWidgets(validIds, { asCut: true })
  },

  duplicateWidgets: (ids) => {
    const state = get()
    const candidateIds = uniqueExistingIds(ids, state.widgets)
    const validIds = candidateIds.filter((id) => !getOpaqueWidgetType(state.widgets[id]!))
    if (validIds.length !== candidateIds.length) {
      useToastStore.getState().addToast('Newer-version widgets were kept in place and not duplicated')
    }
    if (validIds.length === 0) return []
    // Wires, glue clusters (name, fold state and all), relation links, and
    // canvas subtrees fully inside the duplicated set travel with it — a
    // wired, welded structure duplicates as itself, and a canvas card
    // duplicates its whole board, not an empty shell wearing its title.
    let payload = captureClipboardPayload(state, validIds)
    if (payload.canvasWidgets.some((widget) => getOpaqueWidgetType(widget))) {
      payload = filterPayloadWidgets(payload, (widget) => !getOpaqueWidgetType(widget))
      useToastStore.getState().addToast('Newer-version widgets were kept in place and not duplicated')
    }
    pushHistory()
    const clones = materializeClipboardPayload(payload, {
      offset: { x: GRID_SIZE, y: GRID_SIZE },
      targetCanvasId: null,
      workspaceId: state.activeWorkspaceId,
      titleSuffix: ' copy',
    })
    commitClones(clones)
    useToastStore.getState().addToast(
      clones.rootIds.length === 1 ? 'Duplicated 1 widget' : `Duplicated ${clones.rootIds.length} widgets`,
    )
    return clones.rootIds
  },

  pasteWidgets: (sources, options) => {
    const rawPayload = Array.isArray(sources) ? payloadFromWidgets(sources) : sources
    const payload = filterPayloadWidgets(rawPayload, (widget) => !getOpaqueWidgetType(widget))
    if (payload.widgets.length !== rawPayload.widgets.length ||
        payload.canvasWidgets.length !== rawPayload.canvasWidgets.length) {
      useToastStore.getState().addToast('Update Grovepad before copying newer-version widgets')
    }
    if (payload.widgets.length === 0) return []
    pushHistory()
    // Default lands the group two cells off its source. A target position
    // (right-click "Paste here") instead moves the group's top-left corner to
    // that point, preserving the widgets' relative arrangement.
    let offset = { x: GRID_SIZE * 2, y: GRID_SIZE * 2 }
    if (options?.position) {
      const minX = Math.min(...payload.widgets.map((source) => source.position.x))
      const minY = Math.min(...payload.widgets.map((source) => source.position.y))
      offset = { x: options.position.x - minX, y: options.position.y - minY }
    }
    const clones = materializeClipboardPayload(payload, {
      offset,
      targetCanvasId: get().activeCanvasId,
      workspaceId: get().activeWorkspaceId,
    })
    commitClones(clones)
    useToastStore.getState().addToast(
      clones.rootIds.length === 1 ? 'Pasted 1 widget' : `Pasted ${clones.rootIds.length} widgets`,
    )
    return clones.rootIds
  },

  renamingWidgetId: null,
  startRenaming: (id) => {
    if (!get().widgets[id] || get().renamingWidgetId === id) return
    set({ renamingWidgetId: id })
  },
  stopRenaming: () =>
    set((state) => (state.renamingWidgetId ? { renamingWidgetId: null } : state)),

  // Thin wrapper so `lockWidgets` stays the single owner of the lock write.
  toggleWidgetLocked: (widgetId) => {
    const widget = get().widgets[widgetId]
    if (!widget) return
    get().lockWidgets([widgetId], widget.metadata.locked !== true)
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

  // Pressing any card raises it, so the default path records no history — a
  // hundred incidental raises must not bury the user's real edits in the undo
  // stack. Deliberate stacking (the context menu, the ⌘] shortcut) opts in.
  bringWidgetToFront: (widgetId, options) => {
    if (!get().widgets[widgetId]) return
    if (options?.recordHistory) pushHistory()
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

  /** Only ever a deliberate gesture, so it always records history. */
  sendWidgetToBack: (widgetId) => {
    if (!get().widgets[widgetId]) return
    pushHistory()
    set((state) => {
      if (!state.widgets[widgetId]) return state
      const bottom = Math.min(0, ...Object.values(state.widgets).map((item) => item.metadata.zIndex ?? 0)) - 1
      return {
        widgets: withWidget(state.widgets, widgetId, (item) => ({
          ...item,
          metadata: { ...item.metadata, zIndex: bottom },
        })),
      }
    })
  },

  lockWidgets: (ids, locked) => {
    const existing = uniqueExistingIds([...ids], get().widgets).filter(
      (id) => (get().widgets[id]!.metadata.locked === true) !== locked,
    )
    if (existing.length === 0) return
    pushHistory()
    set((state) => {
      const widgets = { ...state.widgets }
      for (const id of existing) {
        const widget = widgets[id]!
        widgets[id] = { ...widget, metadata: { ...widget.metadata, locked } }
      }
      return { widgets }
    })
  },
  }
}
