import type { CanvasNodeData, Size, Vector2D, Widget } from '../../types/spatial'
import { ICONIFIED_SIZE, snapToGrid } from '../../types/spatial'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'
import { pillSizeForTitle } from '../../utils/collapsedWidget'
import { resizeAnomalies } from '../../utils/scaleDebugAnomalies'
import { getLiveWidgetSizing, mergeWidgetSizing } from '../liveWidgetSizing'
import { useCanvasStore } from '../useCanvasStore'
import { useScaleDebugStore } from '../useScaleDebugStore'
import { useToastStore } from '../useToastStore'
import { applyWidgetDelta, applyWidgetPositions, compactGroupPositions, movedIdsForWidget, uniqueExistingIds, withWidget } from '../widgetCollection'
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
  const minWidth = Math.max(rules.minWidth ?? DEFAULT_SIZING.minWidth, dataWidth)
  const minHeight = Math.max(rules.minHeight ?? DEFAULT_SIZING.minHeight, dataHeight)
  const maxWidth = Math.max(minWidth, rules.maxWidth ?? DEFAULT_SIZING.maxWidth)
  const configuredMaxHeight = rules.autoHeight
    ? rules.maxHeight ?? Infinity
    : rules.maxHeight ?? DEFAULT_SIZING.maxHeight
  const maxHeight = Math.max(minHeight, configuredMaxHeight)
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
      const ids = (options?.moveSelection === false
        ? uniqueExistingIds([id], state.widgets)
        : movedIdsForWidget(id, state.selectedIds, state.widgets)).filter(
        (widgetId) => !state.widgets[widgetId]?.metadata.locked,
      )
      if (ids.length === 0) return state
      const widgets = applyWidgetDelta(
        state.widgets,
        state.relations,
        ids,
        { x: screenDelta.x / safeZoom, y: screenDelta.y / safeZoom },
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
      const validIds = uniqueExistingIds(ids, state.widgets)
      if (validIds.length === 0) return state
      const requested = new Set(validIds)
      const layoutIds: string[] = []
      const directSnapIds: string[] = []

      for (const id of validIds) {
        const groupId = state.widgetGroupIndex[id]
        const members = groupId ? state.groups[groupId]?.widgetIds : undefined
        if (!members) {
          layoutIds.push(id)
          continue
        }
        // One member released on its own stays exactly where it was dragged;
        // only its grid snap is applied. The group is a rigid collision
        // cluster only when the whole group was intentionally moved.
        if (members.every((memberId) => requested.has(memberId))) layoutIds.push(id)
        else directSnapIds.push(id)
      }

      const snapped = applyWidgetPositions(
        state.widgets,
        Object.fromEntries(directSnapIds.map((id) => {
          const position = state.widgets[id]!.position
          return [id, { x: snapToGrid(position.x), y: snapToGrid(position.y) }]
        })),
      )
      return {
        widgets: layoutIds.length > 0
          ? settleWidgetLayout(snapped, layoutIds, state.widgetGroupIndex)
          : snapped,
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
      return { widgets: applyWidgetPositions(state.widgets, positions) }
    })
  },

  untangleCanvas: () => {
    const state = get()
    const canvasId = state.activeCanvasId
    // Repair existing boards created before group packing happened at commit
    // time. Untangling wide, scattered group bounds only makes the sprawl
    // worse; tighten each group first, then resolve collisions between the
    // resulting compact clusters.
    let widgets = state.widgets
    for (const group of Object.values(state.groups)) {
      const members = group.widgetIds.filter((id) => widgets[id]?.canvasId === canvasId)
      if (members.length >= 2) {
        widgets = applyWidgetPositions(widgets, compactGroupPositions(widgets, members))
      }
    }
    const untangled = untangleCanvasLayout(widgets, state.groups, canvasId)
    if (untangled === state.widgets) {
      useToastStore.getState().addToast('Layout already untangled')
      return
    }
    pushHistory()
    set({ widgets: untangled })
    useToastStore.getState().addToast('Untangled layout')
  },

  autoScaleCanvas: () => {
    const state = get()
    const canvasId = state.activeCanvasId

    // 1. Fit each expanded widget on this canvas to its content.
    let widgets = { ...state.widgets }
    for (const id of Object.keys(widgets)) {
      const w = widgets[id]!
      if (w.canvasId !== canvasId || w.collapsed || w.iconified) continue
      const size = fitWidgetSize(w)
      if (size.width !== w.size.width || size.height !== w.size.height) {
        widgets[id] = { ...w, size }
      }
    }

    // 2. Re-tidy every group's internal packing so resized members don't
    //    overlap one another inside the plate.
    for (const group of Object.values(state.groups)) {
      const members = group.widgetIds.filter((id) => widgets[id]?.canvasId === canvasId)
      if (members.length >= 2) {
        widgets = applyWidgetPositions(widgets, compactGroupPositions(widgets, members))
      }
    }

    // 3. Untangle so any overlaps the resize introduced are cleared, groups
    //    still moving as rigid units.
    widgets = untangleCanvasLayout(widgets, state.groups, canvasId)

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
      if (w.collapsed || w.iconified) return state
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

  toggleWidgetCollapsed: (id) => {
    const widget = get().widgets[id]
    if (!widget) return
    get().setWidgetScaleState(id, widget.collapsed ? 'full' : 'pill')
  },

  setWidgetScaleState: (id, target, skipHistory = false) => {
    const currentWidget = get().widgets[id]
    if (!currentWidget || currentWidget.metadata.locked) return
    const current = currentWidget.collapsed ? 'pill' : currentWidget.iconified ? 'icon' : 'full'
    if (current === target) return
    if (!skipHistory) pushHistory()
    const before = currentWidget.size
    set((state) => {
      const widget = state.widgets[id]
      if (!widget) return state
      const expandedSize = widget.collapsed || widget.iconified
        ? widget.expandedSize ?? widgetDefinition(widget.type).defaultSize
        : widget.size
      const next = target === 'full'
        ? {
            ...widget,
            collapsed: false,
            iconified: false,
            size: clampFullSize(widget, expandedSize),
            expandedSize: undefined,
          }
        : target === 'pill'
          ? {
              ...widget,
              collapsed: true,
              iconified: false,
              expandedSize,
              size: pillSizeForTitle(widget.title),
            }
          : {
              ...widget,
              collapsed: false,
              iconified: true,
              expandedSize,
              size: { ...ICONIFIED_SIZE },
            }
      const widgets = { ...state.widgets, [id]: next }
      // A scale-state round trip restores the same world geometry; expanding
      // must not silently settle the card into a new location.
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

  setWidgetsCollapsed: (ids, collapsed) => {
    const validIds = uniqueExistingIds(ids, get().widgets)
    const actionable = validIds.filter((id) => {
      const widget = get().widgets[id]
      return widget && !widget.metadata.locked && widget.collapsed !== collapsed
    })
    if (actionable.length === 0) return
    pushHistory()
    set((state) => {
      let widgets = state.widgets
      for (const id of actionable) {
        const widget = widgets[id]
        if (!widget) continue
        if (collapsed) {
          const expandedSize = widget.iconified
            ? widget.expandedSize ?? widgetDefinition(widget.type).defaultSize
            : widget.size
          widgets = withWidget(widgets, id, (item) => ({
            ...item,
            collapsed: true,
            iconified: false,
            expandedSize,
            size: pillSizeForTitle(item.title),
          }))
        } else {
          widgets = withWidget(widgets, id, (item) => ({
            ...item,
            collapsed: false,
            iconified: false,
            size: clampFullSize(item, item.expandedSize ?? widgetDefinition(item.type).defaultSize),
            expandedSize: undefined,
          }))
        }
      }
      return { widgets }
    })
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
      const maxHeight = rules?.autoHeight ? rules?.maxHeight ?? Infinity : rules?.maxHeight ?? DEFAULT_SIZING.maxHeight
      const newHeight =
        rawHeight > 0
          ? Math.min(maxHeight, Math.max(rules?.minHeight ?? DEFAULT_SIZING.minHeight, rawHeight))
          : 0
      // A legacy collapsed pill keeps its visible size. Preserve its dormant
      // full-card dimensions while accepting data updates.
      let widgets: Record<string, Widget>
      if (w.collapsed || w.iconified) {
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
          ...(w.collapsed ? { size: pillSizeForTitle(title) } : {}),
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
      const widgets = applyWidgetDelta(state.widgets, state.relations, ids, { x: dx, y: dy })
      if (widgets === state.widgets) return state
      return { widgets: settleWidgetLayout(widgets, ids) }
    })
  },
  }
}
