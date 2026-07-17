import type { WidgetGroup } from '../../types/spatial'
import { useToastStore } from '../useToastStore'
import { applyWidgetDelta, applyWidgetPositions, compactGroupPositions, uniqueExistingIds } from '../widgetCollection'
import { buildGroupIndex, nextGroupColor } from '../widgetGraph'
import { detachPosition } from '../widgetUntangle'
import { settleWidgetLayout } from '../widgetSettling'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'

function groupMembersShareCanvas(
  widgetIds: string[],
  widgets: ReturnType<WidgetStoreSliceContext['get']>['widgets'],
): boolean {
  const canvasId = widgets[widgetIds[0] ?? '']?.canvasId
  return Boolean(canvasId) && widgetIds.every((id) => widgets[id]?.canvasId === canvasId)
}

function widgetCanJoinGroup(
  group: WidgetGroup | undefined,
  widgetId: string,
  widgets: ReturnType<WidgetStoreSliceContext['get']>['widgets'],
): boolean {
  const widget = widgets[widgetId]
  if (!group || !widget) return false
  const anchor = group.widgetIds.map((id) => widgets[id]).find(Boolean)
  return Boolean(anchor && anchor.canvasId === widget.canvasId)
}

function transferWidgetMembership(
  groups: Record<string, WidgetGroup>,
  widgetGroupIndex: Record<string, string>,
  targetGroupId: string,
  widgetId: string,
): Record<string, WidgetGroup> {
  const target = groups[targetGroupId]
  if (!target || target.widgetIds.includes(widgetId)) return groups
  const next = { ...groups }
  const previousGroupId = widgetGroupIndex[widgetId]
  if (previousGroupId && previousGroupId !== targetGroupId) {
    const previous = next[previousGroupId]
    if (previous) {
      const remaining = previous.widgetIds.filter((id) => id !== widgetId)
      if (remaining.length < 2) delete next[previousGroupId]
      else next[previousGroupId] = { ...previous, widgetIds: remaining }
    }
  }
  next[targetGroupId] = { ...target, widgetIds: [...target.widgetIds, widgetId] }
  return next
}

export function createGroupSlice({ set, get, pushHistory }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  createGroup: (widgetIds, label) => {
    const ids = uniqueExistingIds(widgetIds, get().widgets)
    if (ids.length < 2 || !groupMembersShareCanvas(ids, get().widgets)) return ''
    pushHistory()
    const id = crypto.randomUUID()
    const color = nextGroupColor()
    const group: WidgetGroup = { id, label: label ?? 'Group', widgetIds: [...ids], color }
    set((state) => {
      let groups = { ...state.groups }
      for (const wid of ids) {
        const existingGroupId = state.widgetGroupIndex[wid]
        if (existingGroupId && groups[existingGroupId]) {
          const existing = groups[existingGroupId]
          const remaining = existing.widgetIds.filter((w) => !ids.includes(w))
          if (remaining.length < 2) {
            delete groups[existingGroupId]
          } else {
            groups[existingGroupId] = { ...existing, widgetIds: remaining }
          }
        }
      }
      groups[id] = group
      const widgetGroupIndex = buildGroupIndex(groups)
      return {
        // Grouping adds organization without moving content. The explicit
        // Tighten action owns compact layout when the user asks for it.
        widgets: state.widgets,
        groups,
        widgetGroupIndex,
      }
    })
    useToastStore.getState().addToast(`Grouped ${ids.length} widgets`)
    return id
  },

  dissolveGroup: (groupId) => {
    if (!get().groups[groupId]) return
    pushHistory()
    set((state) => {
      if (!state.groups[groupId]) return state
      const groups = { ...state.groups }
      delete groups[groupId]
      return { groups, widgetGroupIndex: buildGroupIndex(groups) }
    })
  },

  renameGroup: (groupId, label) => {
    if (!get().groups[groupId] || get().groups[groupId]?.label === label) return
    pushHistory(`rename-group:${groupId}`)
    set((state) => {
      const g = state.groups[groupId]
      if (!g || g.label === label) return state
      return { groups: { ...state.groups, [groupId]: { ...g, label } } }
    })
  },

  compactGroup: (groupId, options) => {
    const state = get()
    const group = state.groups[groupId]
    if (!group || group.widgetIds.length < 2) return false
    const compacted = applyWidgetPositions(
      state.widgets,
      compactGroupPositions(state.widgets, group.widgetIds),
    )
    const widgets = settleWidgetLayout(compacted, group.widgetIds, state.widgetGroupIndex)
    if (widgets === state.widgets) return false
    if (!options?.skipHistory) pushHistory()
    set({ widgets })
    return true
  },

  addToGroup: (groupId, widgetId) => {
    const current = get()
    const existing = current.groups[groupId]
    if (
      !existing ||
      existing.widgetIds.includes(widgetId) ||
      !widgetCanJoinGroup(existing, widgetId, current.widgets)
    ) return
    pushHistory()
    set((state) => {
      const g = state.groups[groupId]
      if (
        !g ||
        g.widgetIds.includes(widgetId) ||
        !widgetCanJoinGroup(g, widgetId, state.widgets)
      ) return state
      const groups = transferWidgetMembership(
        state.groups,
        state.widgetGroupIndex,
        groupId,
        widgetId,
      )
      const widgetIds = groups[groupId]!.widgetIds
      const widgetGroupIndex = buildGroupIndex(groups)
      const compacted = applyWidgetPositions(state.widgets, compactGroupPositions(state.widgets, widgetIds))
      return {
        widgets: settleWidgetLayout(compacted, widgetIds, widgetGroupIndex),
        groups,
        widgetGroupIndex,
      }
    })
  },

  joinGroup: (groupId, widgetId) => {
    const state = get()
    const g = state.groups[groupId]
    if (
      !g ||
      g.widgetIds.includes(widgetId) ||
      !widgetCanJoinGroup(g, widgetId, state.widgets)
    ) return
    set((s) => {
      const group = s.groups[groupId]
      if (
        !group ||
        group.widgetIds.includes(widgetId) ||
        !widgetCanJoinGroup(group, widgetId, s.widgets)
      ) return s
      // Dragging already captured history on its first move. Keep the join in
      // that same undo step while still enforcing one-group-per-widget.
      const groups = transferWidgetMembership(
        s.groups,
        s.widgetGroupIndex,
        groupId,
        widgetId,
      )
      return { groups, widgetGroupIndex: buildGroupIndex(groups) }
    })
    useToastStore.getState().addToast(`Added to "${g.label}"`)
  },

  dragOverGroupId: null,
  setDragOverGroupId: (id) =>
    set((state) => (state.dragOverGroupId === id ? state : { dragOverGroupId: id })),

  hoveredWidgetId: null,
  setHoveredWidgetId: (id) =>
    set((state) => (state.hoveredWidgetId === id ? state : { hoveredWidgetId: id })),

  removeFromGroup: (groupId, widgetId, options) => {
    const current = get().groups[groupId]
    if (!current || !current.widgetIds.includes(widgetId)) return false
    if (!options?.skipHistory) pushHistory()
    set((state) => {
      const g = state.groups[groupId]
      if (!g) return state
      const remaining = g.widgetIds.filter((w) => w !== widgetId)
      const groups = { ...state.groups }
      if (remaining.length < 2) delete groups[groupId]
      else groups[groupId] = { ...g, widgetIds: remaining }

      const peeledPosition = detachPosition(state.widgets, g.widgetIds, widgetId)
      const widgets = peeledPosition
        ? settleWidgetLayout(
            applyWidgetPositions(state.widgets, { [widgetId]: peeledPosition }),
            [widgetId],
          )
        : state.widgets

      return {
        widgets,
        groups,
        widgetGroupIndex: buildGroupIndex(groups),
      }
    })
    return true
  },

  moveGroup: (groupId, screenDelta, zoom) => {
    const safeZoom = zoom > 0 ? zoom : 1
    set((state) => {
      const g = state.groups[groupId]
      if (!g) return state
      const widgets = applyWidgetDelta(
        state.widgets,
        state.relations,
        g.widgetIds,
        { x: screenDelta.x / safeZoom, y: screenDelta.y / safeZoom },
      )
      return widgets === state.widgets ? state : { widgets }
    })
  },
  }
}
