import type { CanvasNodeData, ChecklistData, Widget } from '../../types/spatial'
import { ICONIFIED_SIZE, snapToGrid } from '../../types/spatial'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'
import { pillSizeForTitle, type WidgetScaleState } from '../../utils/widgetScale'
import { useToastStore } from '../useToastStore'
import { applyWidgetDelta, applyWidgetPositions, compactGroupPositions, movedIdsForWidget, uniqueExistingIds, withWidget } from '../widgetCollection'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH } from '../widgetLayoutConstants'
import { fitWidgetSize, computeDataHeight } from '../widgetSizing'
import { settleWidgetLayout } from '../widgetSettling'
import { untangleCanvasLayout } from '../widgetUntangle'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
export function createWidgetLayoutSlice({ set, get, pushHistory }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  moveWidget: (id, screenDelta, zoom) => {
    const safeZoom = zoom > 0 ? zoom : 1
    set((state) => {
      if (state.widgets[id]?.metadata.locked) return state
      const ids = movedIdsForWidget(id, state.selectedIds, state.widgets).filter(
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
      // Magnet: any group a dragged widget belongs to snaps back into its
      // tight one-cell arrangement on release — members always pull
      // together instead of drifting apart inside the band.
      const touchedGroupIds = new Set<string>()
      for (const id of validIds) {
        const groupId = state.widgetGroupIndex[id]
        if (groupId && state.groups[groupId]) touchedGroupIds.add(groupId)
      }
      let widgets = state.widgets
      const settleIds = new Set(validIds)
      for (const groupId of touchedGroupIds) {
        const memberIds = state.groups[groupId]!.widgetIds
        widgets = applyWidgetPositions(widgets, compactGroupPositions(widgets, memberIds))
        for (const memberId of memberIds) settleIds.add(memberId)
      }
      return { widgets: settleWidgetLayout(widgets, [...settleIds], state.widgetGroupIndex) }
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
    set((state) => {
      const w = state.widgets[id]
      if (!w || w.metadata.locked) return state
      let size = snap
        ? {
            width: Math.max(MIN_WIDGET_WIDTH, snapToGrid(newSize.width)),
            height: Math.max(MIN_WIDGET_HEIGHT, snapToGrid(newSize.height)),
          }
        : {
            width: Math.max(MIN_WIDGET_WIDTH, newSize.width),
            height: Math.max(MIN_WIDGET_HEIGHT, newSize.height),
          }
      // Full-state cards obey their type's size window. Pills and icon tiles
      // are state-managed sizes and skip the clamp entirely.
      if (!w.collapsed && !w.iconified) {
        const rules = widgetDefinition(w.type).sizing
        size = {
          width: Math.min(
            rules?.maxWidth ?? Infinity,
            Math.max(rules?.minWidth ?? DEFAULT_SIZING.minWidth, size.width),
          ),
          height: Math.min(
            rules?.maxHeight ?? Infinity,
            Math.max(rules?.minHeight ?? DEFAULT_SIZING.minHeight, size.height),
          ),
        }
      }
      if (size.width === w.size.width && size.height === w.size.height) return state
      return {
        widgets: withWidget(state.widgets, id, (w) => ({
          ...w,
          size,
        })),
      }
    })
  },

  toggleWidgetCollapsed: (id) => {
    const w = get().widgets[id]
    if (!w) return
    get().setWidgetScaleState(id, w.collapsed ? 'full' : 'pill')
  },

  setWidgetScaleState: (id, target) => {
    const w = get().widgets[id]
    if (!w || w.metadata.locked) return
    const current: WidgetScaleState = w.collapsed ? 'pill' : w.iconified ? 'icon' : 'full'
    if (current === target) return
    pushHistory()
    set((state) => {
      const widgets = withWidget(state.widgets, id, (widget) => {
        // The size to restore on expand: stash it when leaving full state,
        // carry it through pill↔icon hops.
        const expandedSize =
          widget.collapsed || widget.iconified ? widget.expandedSize : widget.size
        if (target === 'full') {
          return {
            ...widget,
            collapsed: false,
            iconified: false,
            size: expandedSize ?? widget.size,
            expandedSize: undefined,
          }
        }
        if (target === 'pill') {
          return {
            ...widget,
            collapsed: true,
            iconified: false,
            expandedSize,
            size: pillSizeForTitle(widget.title),
          }
        }
        return {
          ...widget,
          collapsed: false,
          iconified: true,
          expandedSize,
          size: { ...ICONIFIED_SIZE },
        }
      })
      // Expanding can overlap neighbours — reuse the settle pass.
      return { widgets: target === 'full' ? settleWidgetLayout(widgets, [id]) : widgets }
    })
  },

  setWidgetsCollapsed: (ids, collapsed) => {
    const validIds = uniqueExistingIds(ids, get().widgets)
    if (
      validIds.length === 0 ||
      !validIds.some((id) => get().widgets[id]?.collapsed !== collapsed)
    ) {
      return
    }
    pushHistory()
    set((state) => {
      let widgets = state.widgets
      const toSettle: string[] = []
      for (const id of validIds) {
        const w = widgets[id]
        if (!w || w.collapsed === collapsed) continue
        if (collapsed) {
          widgets = withWidget(widgets, id, (widget) => ({
            ...widget,
            collapsed: true,
            iconified: false,
            expandedSize: widget.iconified ? widget.expandedSize : widget.size,
            size: pillSizeForTitle(widget.title),
          }))
        } else {
          widgets = withWidget(widgets, id, (widget) => ({
            ...widget,
            collapsed: false,
            iconified: false,
            size: widget.expandedSize ?? widget.size,
            expandedSize: undefined,
          }))
          toSettle.push(id)
        }
      }
      if (widgets === state.widgets) return state
      return { widgets: toSettle.length > 0 ? settleWidgetLayout(widgets, toSettle) : widgets }
    })
  },

  updateWidgetData: (widgetId, data) => {
    const previous = get().widgets[widgetId]
    if (!previous) return
    if (previous.type === 'checklist') {
      const before = (previous.data as ChecklistData).items.filter((item) => item.done).length
      const after = (data as ChecklistData).items.filter((item) => item.done).length
      if (after > before) void import('../../utils/feedbackSound').then(({ playCompletionTick }) => playCompletionTick())
    }
    pushHistory(`data:${widgetId}`)
    set((state) => {
      const w = state.widgets[widgetId]
      if (!w) return state
      const newHeight = computeDataHeight(w.type, data)
      // A collapsed pill keeps its size; content growth lands on the stored
      // expanded size so the card is right when it reopens.
      let widgets: Record<string, Widget>
      if (w.collapsed || w.iconified) {
        const expandedSize =
          newHeight > 0 && w.expandedSize && newHeight !== w.expandedSize.height
            ? { ...w.expandedSize, height: newHeight }
            : w.expandedSize
        widgets = { ...state.widgets, [widgetId]: { ...w, data, expandedSize } }
      } else {
        const size =
          newHeight > 0 && newHeight !== w.size.height ? { ...w.size, height: newHeight } : w.size
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
