import type { CanvasNodeData, Size, Vector2D, Widget } from '../../types/spatial'
import { ICONIFIED_SIZE, snapToGrid, WIDGET_MAX_EDGE } from '../../types/spatial'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'
import { resizeAnomalies } from '../../utils/scaleDebugAnomalies'
import { anchoredOrigin, recenteredOrigin } from '../../utils/widgetResizeEdge'
import { isWidgetResting, restingTileSize } from '../../utils/widgetRest'
import { clampIconEdge, snapIconEdgeToGrid } from '../../utils/widgetScale'
import { getLiveWidgetSizing, mergeWidgetSizing } from '../liveWidgetSizing'
import { useCanvasStore } from '../useCanvasStore'
import { useScaleDebugStore } from '../useScaleDebugStore'
import { useToastStore } from '../useToastStore'
import { applyWidgetDelta, applyWidgetPositions, movedIdsForWidget, uniqueExistingIds, withWidget } from '../widgetCollection'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH } from '../widgetLayoutConstants'
import { fitWidgetSize, computeDataHeight, computeDataWidth } from '../widgetSizing'
import { settleWidgetLayout } from '../widgetSettling'
import { untangleCanvasLayout } from '../widgetUntangle'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
import { usesStrictRelations } from '../../utils/relationPolicy'

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
      // Glued widgets move as one object: any moved member pulls its whole
      // cluster along. An option-drag (`soloGlued`) moves only the grabbed
      // widget so it can be pulled off or re-welded elsewhere.
      const withClusters = options?.soloGlued
        ? baseIds
        : baseIds.flatMap((widgetId) => {
            const glueId = state.widgetGlueIndex[widgetId]
            return glueId ? state.glues[glueId]?.widgetIds ?? [widgetId] : [widgetId]
          })
      const ids = uniqueExistingIds(withClusters, state.widgets).filter(
        (widgetId) => !state.widgets[widgetId]?.metadata.locked,
      )
      if (ids.length === 0) return state
      const widgets = applyWidgetDelta(
        state.widgets,
        state.relations,
        ids,
        { x: screenDelta.x / safeZoom, y: screenDelta.y / safeZoom },
        usesStrictRelations(state.canvases[state.widgets[id]!.canvasId]),
      )
      if (widgets === state.widgets) return state
      return { widgets }
    })
  },

  snapWidgetToGrid: (id) => {
    set((state) => {
      const w = state.widgets[id]
      if (!w || w.metadata.locked) return state
      return {
        widgets: applyWidgetPositions(state.widgets, {
          [id]: { x: snapToGrid(w.position.x), y: snapToGrid(w.position.y) },
        }),
      }
    })
  },

  settleWidgets: (ids) => {
    set((state) => {
      // A glued widget never settles alone — its whole cluster is the rigid
      // unit, so the request expands to every clustermate and the settle pass
      // snaps the cluster by one shared delta (welds survive exactly).
      const expanded = uniqueExistingIds(ids, state.widgets).flatMap((id) => {
        const glueId = state.widgetGlueIndex[id]
        return glueId ? state.glues[glueId]?.widgetIds ?? [id] : [id]
      })
      const validIds = uniqueExistingIds(expanded, state.widgets)
      if (validIds.length === 0) return state
      return { widgets: settleWidgetLayout(state.widgets, validIds, state.widgetGlueIndex) }
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
      return { widgets: applyWidgetPositions(state.widgets, positions) }
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

  resizeWidget: (id, newSize, snap = true) => {
    // Populated during the set() pass below so the debug trace can fire once,
    // after the store update, with the full before/after/rules picture —
    // resizeWidget is the single choke point nearly every scaling path
    // (manual drag, content-floor grow, the load-time fit, snap-to-grid,
    // external callers) ultimately funnels through.
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
        trace = { before: w.size, after: w.size, rules: fullSizing(w), locked: true, changed: false }
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
      trace = { before: w.size, after: size, rules: fullSizing(w), locked: false, changed }
      if (!changed) return state
      return {
        widgets: withWidget(state.widgets, id, (w) => ({
          ...w,
          size,
        })),
      }
    })

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
    get().resizeWidget(id, newSize, snap)
    const after = get().widgets[id]
    if (!after) return
    const position = anchoredOrigin(before.position, before.size, after.size, edge)
    if (position.x === after.position.x && position.y === after.position.y) return
    set((state) => ({ widgets: withWidget(state.widgets, id, (w) => ({ ...w, position })) }))
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
      next.position = recenteredOrigin(widget.position, shownBefore, shownAfter)
      const widgets = { ...state.widgets, [id]: next }
      return { widgets }
    })
    const after = get().widgets[id]
    if (after) {
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
        if (size !== w.size) widgets = settleWidgetLayout(widgets, [widgetId])
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
      return {
        widgets: withWidget(state.widgets, widgetId, (w) => ({
          ...w,
          title,
        })),
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
    const ids = [...get().selectedIds]
    if (ids.length === 0) return
    pushHistory('nudge')
    set((state) => {
      const first = state.widgets[ids[0]!]
      const widgets = applyWidgetDelta(
        state.widgets,
        state.relations,
        ids,
        { x: dx, y: dy },
        usesStrictRelations(state.canvases[first?.canvasId ?? state.activeCanvasId]),
      )
      if (widgets === state.widgets) return state
      return { widgets: settleWidgetLayout(widgets, ids) }
    })
  },
  }
}
