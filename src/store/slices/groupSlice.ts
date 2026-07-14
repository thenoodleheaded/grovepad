import type { WidgetGroup } from '../../types/spatial'
import { useToastStore } from '../useToastStore'
import { applyWidgetDelta, applyWidgetPositions, compactGroupPositions, uniqueExistingIds } from '../widgetCollection'
import { buildGroupIndex, nextGroupColor } from '../widgetGraph'
import { detachPosition } from '../widgetUntangle'
import { settleWidgetLayout } from '../widgetSettling'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
export function createGroupSlice({ set, get, pushHistory }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  createGroup: (widgetIds, label) => {
    const ids = uniqueExistingIds(widgetIds, get().widgets)
    if (ids.length < 2) return ''
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
      const compacted = applyWidgetPositions(state.widgets, compactGroupPositions(state.widgets, ids))
      return {
        widgets: settleWidgetLayout(compacted, ids, widgetGroupIndex),
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

  compactGroup: (groupId) => {
    if (!get().groups[groupId]) return
    pushHistory()
    set((state) => {
      const group = state.groups[groupId]
      if (!group || group.widgetIds.length < 2) return state
      const compacted = applyWidgetPositions(
        state.widgets,
        compactGroupPositions(state.widgets, group.widgetIds),
      )
      return { widgets: settleWidgetLayout(compacted, group.widgetIds) }
    })
  },

  addToGroup: (groupId, widgetId) => {
    const existing = get().groups[groupId]
    if (!existing || existing.widgetIds.includes(widgetId)) return
    pushHistory()
    set((state) => {
      const g = state.groups[groupId]
      if (!g || g.widgetIds.includes(widgetId)) return state
      let groups = { ...state.groups }
      const existingGroupId = state.widgetGroupIndex[widgetId]
      if (existingGroupId && existingGroupId !== groupId && groups[existingGroupId]) {
        const existing = groups[existingGroupId]
        const remaining = existing.widgetIds.filter((w) => w !== widgetId)
        if (remaining.length < 2) delete groups[existingGroupId]
        else groups[existingGroupId] = { ...existing, widgetIds: remaining }
      }
      const widgetIds = [...g.widgetIds, widgetId]
      groups[groupId] = { ...g, widgetIds }
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
    if (!g || g.widgetIds.includes(widgetId)) return
    set((s) => {
      const group = s.groups[groupId]
      if (!group || group.widgetIds.includes(widgetId)) return s
      const groups = { ...s.groups, [groupId]: { ...group, widgetIds: [...group.widgetIds, widgetId] } }
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

  removeFromGroup: (groupId, widgetId) => {
    if (!get().groups[groupId]) return
    pushHistory()
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
