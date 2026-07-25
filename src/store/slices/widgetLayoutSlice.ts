import type { CanvasNodeData, Size, Vector2D, Widget } from '../../types/spatial'
import { ICONIFIED_SIZE, snapToGrid, WIDGET_MAX_EDGE } from '../../types/spatial'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'
import { resizeAnomalies } from '../../utils/scaleDebugAnomalies'
import {
  closeClusterGaps,
  reconcileGlueClusters,
  unfoldReleasedFoldedMembers,
} from '../../utils/glueGeometry'
import { anchoredOrigin, recenteredOrigin } from '../../utils/widgetResizeEdge'
import { isWidgetResting, restingTileSize } from '../../utils/widgetRest'
import { clampIconEdge, snapIconEdgeToGrid } from '../../utils/widgetScale'
import { getLiveWidgetSizing, mergeWidgetSizing } from '../liveWidgetSizing'
import { useCanvasStore } from '../useCanvasStore'
import { useScaleDebugStore } from '../useScaleDebugStore'
import { useToastStore } from '../useToastStore'
import { applyWidgetDelta, applyWidgetPositions, movedIdsForWidget, uniqueExistingIds, withWidget } from '../widgetCollection'
import { buildGlueIndex, expandMovedWidgetIds } from '../widgetGraph'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH } from '../widgetLayoutConstants'
import { fitWidgetSize, computeDataHeight, computeDataWidth } from '../widgetSizing'
import { settleWidgetLayout } from '../widgetSettling'
import { untangleCanvasLayout } from '../widgetUntangle'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'

function fullSizing(widget: Widget) {
  return mergeWidgetSizing(widgetDefinition(widget.type).sizing, getLiveWidgetSizing(widget.id))
}

function clampFullSize(widget: Widget, requested: { width: number; height: number }) {
  const rules = fullSizing(widget)
  const dataWidth = computeDataWidth(widget.type, widget.data)
  const dataHeight = computeDataHeight(widget.type, widget.data)
  // Even a content-derived floor answers to the absolute ceiling: a min above
  // it would otherwise invert the range and pin the card at an illegal size.
  const minWidth = Math.min(WIDGET_MAX_EDGE, Math.max(rules.minWidth ?? DEFAULT_SIZING.minWidth, dataWidth))
  const minHeight = Math.min(WIDGET_MAX_EDGE, Math.max(rules.minHeight ?? DEFAULT_SIZING.minHeight, dataHeight))
  const maxWidth = Math.min(WIDGET_MAX_EDGE, Math.max(minWidth, rules.maxWidth ?? DEFAULT_SIZING.maxWidth))
  // Content-fit types grow past the per-type height ceiling by design, but
  // never past the absolute one — that fallback used to be Infinity, which is
  // how a long list could grow until it swallowed the board.
  const configuredMaxHeight = rules.autoHeight
    ? rules.maxHeight ?? WIDGET_MAX_EDGE
    : rules.maxHeight ?? DEFAULT_SIZING.maxHeight
  const maxHeight = Math.min(WIDGET_MAX_EDGE, Math.max(minHeight, configuredMaxHeight))
  return {
    width: Math.min(maxWidth, Math.max(minWidth, requested.width)),
    height: Math.min(maxHeight, Math.max(minHeight, requested.height)),
  }
}

export function createWidgetLayoutSlice({ set, get, pushHistory }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  moveWidget: (id, screenDelta, zoom, options) => {
    const safeZoom = zoom > 0 ? zoom : 1
    set((state) => {
      if (state.widgets[id]?.metadata.locked) return state
      const baseIds = options?.moveSelection === false
        ? uniqueExistingIds([id], state.widgets)
        : movedIdsForWidget(id, state.selectedIds, state.widgets)
      // Glued widgets move as one object, and a strict holder moves its whole
      // parent-linked family: the move expands through both closures at once.
      // An option-drag (`soloGlued`) breaks every coupling for this drag —
      // it moves only the grabbed widget so it can be pulled off, re-welded,
      // or repositioned inside its family without carrying anyone.
      const withFamilies = options?.soloGlued
        ? baseIds
        : expandMovedWidgetIds(baseIds, state)
      const ids = uniqueExistingIds(withFamilies, state.widgets).filter(
        (widgetId) => !state.widgets[widgetId]?.metadata.locked,
      )
      if (ids.length === 0) return state
      const widgets = applyWidgetDelta(state.widgets, ids, {
        x: screenDelta.x / safeZoom,
        y: screenDelta.y / safeZoom,
      })
      if (widgets === state.widgets) return state
      return { widgets }
    })
  },

  snapWidgetToGrid: (id) => {
    set((state) => {
      const w = state.widgets[id]
      if (!w || w.metadata.locked) return state
      const snapped = applyWidgetPositions(state.widgets, {
        [id]: { x: snapToGrid(w.position.x), y: snapToGrid(w.position.y) },
      })
      if (snapped === state.widgets) return state
      // Landing on the grid is a position change like any other, so it runs
      // the overlap check rather than trusting the caller to.
      return { widgets: settleWidgetLayout(snapped, [id], state.widgetGlueIndex, { anchorIds: [id] }) }
    })
  },

  settleWidgets: (ids) => {
    set((state) => {
      // A glued widget never settles alone — its whole cluster is the rigid
      // unit — and a strict family that dragged together lands together, so
      // the request expands through both closures before the settle pass
      // (the cluster snaps by one shared delta; welds survive exactly).
      const expanded = expandMovedWidgetIds(uniqueExistingIds(ids, state.widgets), state)
      const validIds = uniqueExistingIds(expanded, state.widgets)
      if (validIds.length === 0) return state
      const settled = settleWidgetLayout(state.widgets, validIds, state.widgetGlueIndex)
      // Release-time housekeeping: clusters must always equal what visibly
      // touches. Any interaction that left a member floating free of its
      // group splits here, so a "member" that no longer touches anything can
      // never keep dragging the whole group with it.
      const glues = reconcileGlueClusters(settled, state.glues)
      if (glues === state.glues) return { widgets: settled }
      return {
        widgets: unfoldReleasedFoldedMembers(settled, state.glues, glues),
        glues,
        widgetGlueIndex: buildGlueIndex(glues),
        widgetStructureVersion: state.widgetStructureVersion + 1,
      }
    })
  },

  applyGhostDisplacement: (offsets) => {
    set((state) => {
      const positions: Record<string, Vector2D> = {}
      for (const [id, offset] of Object.entries(offsets)) {
        const w = state.widgets[id]
        if (!w || w.metadata.locked || (offset.x === 0 && offset.y === 0)) continue
        positions[id] = { x: w.position.x + offset.x, y: w.position.y + offset.y }
      }
      if (Object.keys(positions).length === 0) return state
      // Committing the drag's ghost preview moves real cards, so it runs the
      // overlap check on everything it just placed.
      const moved = applyWidgetPositions(state.widgets, positions)
      return {
        widgets: settleWidgetLayout(moved, Object.keys(positions), state.widgetGlueIndex),
      }
    })
  },

  untangleCanvas: () => {
    const state = get()
    const canvasId = state.activeCanvasId
    const untangled = untangleCanvasLayout(state.widgets, state.glues, canvasId)
    if (untangled === state.widgets) {
      useToastStore.getState().addToast('Layout already untangled')
      return
    }
    pushHistory()
    set({ widgets: untangled })
    useToastStore.getState().addToast('Untangled layout')
  },

  untangleWidgets: (ids) => {
    const state = get()
    const canvasId = state.activeCanvasId
    const selectedIds = uniqueExistingIds(ids, state.widgets).filter(
      (id) => state.widgets[id]?.canvasId === canvasId,
    )
    if (selectedIds.length < 2) return

    const selectedWidgets = Object.fromEntries(
      selectedIds.map((id) => [id, state.widgets[id]!]),
    )
    const untangled = untangleCanvasLayout(selectedWidgets, state.glues, canvasId)
    if (untangled === selectedWidgets) {
      useToastStore.getState().addToast('Selection already untangled')
      return
    }

    const positions = Object.fromEntries(
      selectedIds.map((id) => [id, untangled[id]!.position]),
    )
    pushHistory()
    set({ widgets: applyWidgetPositions(state.widgets, positions) })
    useToastStore.getState().addToast('Untangled selection')
  },

  autoScaleCanvas: () => {
    const state = get()
    const canvasId = state.activeCanvasId

    // 1. Fit each expanded widget on this canvas to its content.
    let widgets = { ...state.widgets }
    for (const id of Object.keys(widgets)) {
      const w = widgets[id]!
      if (w.canvasId !== canvasId || w.iconified) continue
      const size = fitWidgetSize(w)
      if (size.width !== w.size.width || size.height !== w.size.height) {
        widgets[id] = { ...w, size }
      }
    }

    // 2. Untangle so any overlaps the resize introduced are cleared, glue
    //    clusters still moving as rigid units.
    widgets = untangleCanvasLayout(widgets, state.glues, canvasId)

    // Did anything on this canvas actually move or resize?
    const original = state.widgets
    const changed = Object.keys(widgets).some((id) => {
      const before = original[id]
      const after = widgets[id]!
      return (
        after.canvasId === canvasId &&
        before !== undefined &&
        (before.size.width !== after.size.width ||
          before.size.height !== after.size.height ||
          before.position.x !== after.position.x ||
          before.position.y !== after.position.y)
      )
    })
    if (!changed) {
      useToastStore.getState().addToast('Widgets already fit their content')
      return
    }
    pushHistory()
    set({ widgets })
    useToastStore.getState().addToast('Fit widgets to content')
  },

  resizeWidget: (id, newSize, snap = true, options = {}) => {
    // Every COMMITTED size change re-runs the overlap check, so growing a card
    // can never leave it sitting on top of a neighbour. Live gesture frames
    // (`snap: false`, one per animation frame) deliberately do not: settling
    // mid-drag would shove neighbours around under the pointer and fight the
    // gesture. The release commits, and that is what settles.
    // `settle: false` is for callers that move the box again straight after
    // (resizeWidgetFromEdge) and settle once themselves at the end.
    const shouldSettle = snap && options.settle !== false
    let sizeChanged = false
    // Populated during the set() pass below so the debug trace can fire once,
    // after the store update, with the full before/after/rules picture —
    // resizeWidget is the single choke point nearly every scaling path
    // (manual drag, content-floor grow, the load-time fit, snap-to-grid,
    // external callers) ultimately funnels through. Manual drags arrive once
    // per animation frame, so the trace only exists while the panel is open.
    const scaleDebugOpen = useScaleDebugStore.getState().isOpen
    let trace: {
      before: Size
      after: Size
      rules: ReturnType<typeof fullSizing>
      locked: boolean
      changed: boolean
    } | null = null

    set((state) => {
      const w = state.widgets[id]
      if (!w) return state
      if (w.metadata.locked) {
        if (scaleDebugOpen) trace = { before: w.size, after: w.size, rules: fullSizing(w), locked: true, changed: false }
        return state
      }
      // An icon follows live resize requests continuously across one cell.
      // A committed (`snap`) request settles to the nearest grid-sized square:
      // 2×2 or 3×3. Those are dimensions, never separate scale states.
      if (w.iconified) {
        const requestedEdge = Math.max(newSize.width, newSize.height)
        const edge = snap
          ? snapIconEdgeToGrid(requestedEdge)
          : clampIconEdge(requestedEdge)
        if (edge === w.size.width && edge === w.size.height) return state
        sizeChanged = true
        return {
          widgets: withWidget(state.widgets, id, (widget) => ({
            ...widget,
            size: { width: edge, height: edge },
          })),
        }
      }
      let size = snap
        ? {
            width: Math.max(MIN_WIDGET_WIDTH, snapToGrid(newSize.width)),
            height: Math.max(MIN_WIDGET_HEIGHT, snapToGrid(newSize.height)),
          }
        : {
            width: Math.max(MIN_WIDGET_WIDTH, newSize.width),
            height: Math.max(MIN_WIDGET_HEIGHT, newSize.height),
          }
      size = clampFullSize(w, size)
      const changed = size.width !== w.size.width || size.height !== w.size.height
      if (scaleDebugOpen) trace = { before: w.size, after: size, rules: fullSizing(w), locked: false, changed }
      if (!changed) return state
      sizeChanged = true
      return {
        widgets: withWidget(state.widgets, id, (w) => ({
          ...w,
          size,
        })),
      }
    })

    // The card just grew or shrank: re-run the overlap check so a bigger box
    // cannot end up lying on top of its neighbours. Inside a glue cluster a
    // SHRINK also leaves a hole in the weld that nothing else closes — a note
    // converging to its content height, an inward edge drag — so the cluster
    // pulls back together and stays one welded block.
    if (sizeChanged && shouldSettle) {
      set((state) => {
        let settled = settleWidgetLayout(state.widgets, [id], state.widgetGlueIndex, { anchorIds: [id] })
        const glueId = state.widgetGlueIndex[id]
        const cluster = glueId ? state.glues[glueId] : undefined
        if (cluster) settled = closeClusterGaps(settled, cluster.widgetIds)
        return { widgets: settled }
      })
    }

    if (trace) {
      const t = trace as {
        before: Size
        after: Size
        rules: ReturnType<typeof fullSizing>
        locked: boolean
        changed: boolean
      }
      const widget = get().widgets[id]
      const anomalies = resizeAnomalies(
        t.after,
        t.rules,
        { snapped: snap, locked: t.locked, changed: t.changed },
      )
      if (t.changed || anomalies.length > 0) {
        useScaleDebugStore.getState().record({
          widgetId: id,
          widgetType: widget?.type ?? 'unknown',
          kind: 'resize-request',
          before: t.before,
          after: t.after,
          zoom: useCanvasStore.getState().zoom,
          detail: {
            requestedWidth: newSize.width,
            requestedHeight: newSize.height,
            snap,
            minWidth: t.rules.minWidth ?? null,
            minHeight: t.rules.minHeight ?? null,
            maxWidth: t.rules.maxWidth ?? null,
            maxHeight: t.rules.maxHeight ?? null,
            autoHeight: t.rules.autoHeight ?? false,
            locked: t.locked,
            changed: t.changed,
          },
          anomalies,
        })
      }
    }
  },

  resizeWidgetFromEdge: (id, newSize, edge, snap = false) => {
    const before = get().widgets[id]
    if (!before) return
    // Resize without settling: the box is about to move again to hold the
    // pinned edge still, and settling against the intermediate position would
    // push neighbours away from a place this card never comes to rest at.
    get().resizeWidget(id, newSize, snap, { settle: false })
    const after = get().widgets[id]
    if (!after) return
    const position = anchoredOrigin(before.position, before.size, after.size, edge)
    const moved = position.x !== after.position.x || position.y !== after.position.y
    if (moved) {
      set((state) => ({ widgets: withWidget(state.widgets, id, (w) => ({ ...w, position })) }))
    }
    // One overlap check for the whole committed change — new size AND new
    // origin together. An inward edge drag shrinks the card, so the cluster
    // closes ranks here exactly as it does on the plain resize path: this
    // branch runs INSTEAD of resizeWidget's own settle, not after it.
    if (snap) {
      set((state) => {
        let settled = settleWidgetLayout(state.widgets, [id], state.widgetGlueIndex, {
          anchorIds: [id],
        })
        const glueId = state.widgetGlueIndex[id]
        const cluster = glueId ? state.glues[glueId] : undefined
        if (cluster) settled = closeClusterGaps(settled, cluster.widgetIds)
        return { widgets: settled }
      })
    }
  },

  setWidgetScaleState: (id, target, options = {}) => {
    const { skipHistory = false, fromSize, toSize } = options
    const currentWidget = get().widgets[id]
    if (!currentWidget || currentWidget.metadata.locked) return
    const current = currentWidget.iconified ? 'icon' : 'full'
    if (current === target) return
    if (!skipHistory) pushHistory()
    const before = currentWidget.size
    set((state) => {
      const widget = state.widgets[id]
      if (!widget) return state
      const expandedSize = widget.iconified
        ? widget.expandedSize ?? widgetDefinition(widget.type).defaultSize
        : widget.size
      const next = target === 'full'
        ? {
            ...widget,
            iconified: false,
            size: clampFullSize(widget, expandedSize),
            expandedSize: undefined,
          }
        : {
            ...widget,
            iconified: true,
            expandedSize,
            // A caller returning a card to a remembered icon (a closing
            // expansion) lands it at that exact continuous square, clamped to
            // the one-cell icon range. Without a memory, the 2×2 floor.
            size: toSize
              ? (() => {
                  const edge = clampIconEdge(Math.min(toSize.width, toSize.height))
                  return { width: edge, height: edge }
                })()
              : { ...ICONIFIED_SIZE },
          }
      // Every state change re-centres the box the user is about to see on the
      // box they were just looking at. Both ends must be the VISIBLE boxes: a
      // widget that rests draws its tile top-left-anchored at the stored
      // position, so re-centring the dormant full card there put the tile at
      // the card's top-left corner and each icon round trip walked the widget
      // up-left by half the card-minus-tile difference.
      // Same decision the resting system itself makes at idle, so a
      // duplicated local predicate would drift.
      const rests = (w: Widget) => isWidgetResting(w, { expandedWidgetId: null })
      // Callers pass `fromSize` when they know the on-screen box (the gesture
      // paths always do — an ephemerally expanded card is only their caller's
      // knowledge). The fallback is the box this store can prove: the resting
      // tile for a widget at rest, otherwise its stored size.
      const shownBefore = fromSize ?? (rests(widget) ? restingTileSize(widget) : widget.size)
      const shownAfter = rests(next) ? restingTileSize(next) : next.size
      const glueId = state.widgetGlueIndex[id]
      const cluster = glueId ? state.glues[glueId] : undefined
      // Inside a group a member is WELDED, not floating: it holds the corner
      // it was welded at while its clustermates give way (grow) or close ranks
      // (shrink) around it. Re-centring here is what made opening and closing
      // a card inside a group walk it — and the whole group with it — half the
      // size difference every single time; anchored, an open/close round trip
      // returns the exact starting layout. Free cards still re-centre, so a
      // state change on the open board grows out of the box you were looking at.
      next.position = cluster
        ? widget.position
        : recenteredOrigin(widget.position, shownBefore, shownAfter)
      const widgets = { ...state.widgets, [id]: next }
      // Icon <-> full is the single largest box change a card can make, and it
      // re-centres the card as well — so it always re-runs the overlap check.
      let settled = settleWidgetLayout(widgets, [id], state.widgetGlueIndex, { anchorIds: [id] })
      if (!cluster) return { widgets: settled }
      // A member that grew made space through the reflow above; one that
      // SHRANK left a hole nothing closes on its own. Pull the cluster back
      // together so the changed card re-welds onto its nearest clustermate,
      // then drop whatever genuinely no longer touches from the record.
      settled = closeClusterGaps(settled, cluster.widgetIds)
      const glues = reconcileGlueClusters(settled, state.glues)
      if (glues === state.glues) return { widgets: settled }
      return {
        widgets: unfoldReleasedFoldedMembers(settled, state.glues, glues),
        glues,
        widgetGlueIndex: buildGlueIndex(glues),
        widgetStructureVersion: state.widgetStructureVersion + 1,
      }
    })
    const after = get().widgets[id]
    if (after && useScaleDebugStore.getState().isOpen) {
      useScaleDebugStore.getState().record({
        widgetId: id,
        widgetType: after.type,
        kind: 'scale-state',
        before,
        after: after.size,
        zoom: useCanvasStore.getState().zoom,
        detail: {
          from: current,
          to: target,
          expandedSize: after.expandedSize ? `${after.expandedSize.width}x${after.expandedSize.height}` : null,
        },
        anomalies: [],
      })
    }
  },

  updateWidgetData: (widgetId, data, options) => {
    const previous = get().widgets[widgetId]
    if (!previous) return
    pushHistory(options?.coalesceHistory === false ? undefined : `data:${widgetId}`)
    set((state) => {
      const w = state.widgets[widgetId]
      if (!w) return state
      const rawHeight = computeDataHeight(w.type, data)
      const rawWidth = computeDataWidth(w.type, data)
      // Content-length estimates are unbounded (more rows == more height), so
      // clamp them to the type's real full-card window.
      const rules = widgetDefinition(w.type).sizing
      const maxHeight = Math.min(
        WIDGET_MAX_EDGE,
        rules?.autoHeight ? rules?.maxHeight ?? WIDGET_MAX_EDGE : rules?.maxHeight ?? DEFAULT_SIZING.maxHeight,
      )
      const newHeight =
        rawHeight > 0
          ? Math.min(maxHeight, Math.max(rules?.minHeight ?? DEFAULT_SIZING.minHeight, rawHeight))
          : 0
      // An icon keeps its visible square. Preserve its dormant full-card
      // dimensions while accepting data updates.
      let widgets: Record<string, Widget>
      if (w.iconified) {
        const previousExpanded = w.expandedSize ?? widgetDefinition(w.type).defaultSize
        const expandedSize = clampFullSize(
          { ...w, data },
          {
            width: Math.max(previousExpanded.width, rawWidth),
            height: Math.max(previousExpanded.height, newHeight),
          },
        )
        widgets = { ...state.widgets, [widgetId]: { ...w, data, expandedSize } }
      } else {
        const size = clampFullSize(
          { ...w, data },
          {
            width: Math.max(w.size.width, rawWidth),
            height: Math.max(w.size.height, newHeight),
          },
        )
        widgets = { ...state.widgets, [widgetId]: { ...w, data, size } }
        // Compare DIMENSIONS, not references: clampFullSize returns a fresh
        // object every time, so `size !== w.size` was always true and a
        // full-canvas settle ran on every keystroke. Anchored on the edited
        // card for the same reason every other size change here is — otherwise
        // the settle grid-snaps and can displace the card being typed in.
        if (size.width !== w.size.width || size.height !== w.size.height) {
          widgets = settleWidgetLayout(widgets, [widgetId], state.widgetGlueIndex, {
            anchorIds: [widgetId],
          })
        }
      }

      return { widgets }
    })
  },

  updateWidgetTitle: (widgetId, title) => {
    if (!get().widgets[widgetId] || get().widgets[widgetId]?.title === title) return
    pushHistory(`title:${widgetId}`)
    set((state) => {
      const widget = state.widgets[widgetId]
      if (!widget || widget.title === title) return state
      // Renaming a canvas node renames the canvas it opens.
      let canvases = state.canvases
      if (widget.type === 'canvas_node') {
        const canvasId = (widget.data as CanvasNodeData).canvasId
        const canvas = state.canvases[canvasId]
        if (canvas && canvas.name !== title) {
          canvases = { ...state.canvases, [canvasId]: { ...canvas, name: title } }
        }
      }
      // A resting card's tile is measured from its own title, so renaming one
      // can widen its on-screen footprint — which is a shape change, and runs
      // the overlap check like any other.
      const renamed = withWidget(state.widgets, widgetId, (w) => ({ ...w, title }))
      return {
        widgets: settleWidgetLayout(renamed, [widgetId], state.widgetGlueIndex, { anchorIds: [widgetId] }),
        canvases,
      }
    })
  },

  setWidgetHydration: (widgetId, isHydrating) => {
    if (!get().widgets[widgetId]) return
    set((state) => {
      const widget = state.widgets[widgetId]
      if (!widget || widget.isHydrating === isHydrating) return state
      return {
        widgets: {
          ...state.widgets,
          [widgetId]: { ...widget, isHydrating }
        }
      }
    })
  },


  nudgeSelection: (dx, dy) => {
    const current = get()
    if (current.selectedIds.size === 0) return
    // A keyboard nudge is a move like any other, so it passes through the one
    // moves-together closure: without it a strict holder nudged by an arrow key
    // left its whole parent-linked family standing where it was. Glue clusters
    // only survived by accident, because selectWidget already expands a click
    // to every member.
    const expanded = expandMovedWidgetIds(
      uniqueExistingIds([...current.selectedIds], current.widgets),
      current,
    )
    const ids = uniqueExistingIds(expanded, current.widgets).filter(
      (widgetId) => !current.widgets[widgetId]?.metadata.locked,
    )
    // Resolved BEFORE the history snapshot: a selection of nothing but locked
    // widgets moves nothing, and must not leave an undo step that undoes
    // nothing.
    if (ids.length === 0) return
    pushHistory('nudge')
    set((state) => {
      const widgets = applyWidgetDelta(state.widgets, ids, { x: dx, y: dy })
      if (widgets === state.widgets) return state
      // Anchored on what was nudged, exactly as every other deliberate
      // placement in this file is. Unanchored, the settle grid-snapped the very
      // cards the user just moved — so ⌥+Arrow, the one-pixel fine nudge, was
      // undone by its own settle and full cards could not be fine-positioned
      // at all.
      return {
        widgets: settleWidgetLayout(widgets, ids, state.widgetGlueIndex, { anchorIds: ids }),
      }
    })
  },
  }
}
