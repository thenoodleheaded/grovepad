import type { Connection } from '../../types/circuit'
import type { Relation } from '../../types/spatial'
import { snapToGrid } from '../../types/spatial'
import { commandsFor, fieldDescriptor } from '../../widgets/fields'
import { widgetDefinition } from '../../widgets/registry'
import { computeBlockedWidgetIds } from '../widgetGraph'
import { MIN_PARENT_CHILD_GAP } from '../widgetLayoutConstants'
import { computeDataHeight, computeDataWidth } from '../widgetSizing'
import { settleWidgetLayout } from '../widgetSettling'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
export function createCircuitSlice({ set, get, pushHistory }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  addRelation: (fromId, toId, type) => {
    if (fromId === toId) return ''
    const state = get()
    if (!state.widgets[fromId] || !state.widgets[toId]) return ''
    const duplicate = Object.values(state.relations).find(
      (r) => r.fromId === fromId && r.toId === toId && r.type === type,
    )
    if (duplicate) return duplicate.id
    pushHistory()
    const id = crypto.randomUUID()
    const relation: Relation = {
      id,
      fromId,
      toId,
      type,
      isResolved: type !== 'blocker' && type !== 'conflict',
    }
    set((current) => {
      const relations = { ...current.relations, [id]: relation }
      let widgets = current.widgets
      // A brand-new parent link should read as a tree edge immediately —
      // nudge the child down if it's currently closer than the minimum
      // clearance (existing drags already enforce this; this covers
      // relations drawn between two widgets that were never dragged).
      if (type === 'parent') {
        const parent = widgets[fromId]
        const child = widgets[toId]
        if (parent && child) {
          const minChildY = parent.position.y + parent.size.height + MIN_PARENT_CHILD_GAP
          if (child.position.y < minChildY) {
            widgets = settleWidgetLayout(
              {
                ...widgets,
                [toId]: { ...child, position: { ...child.position, y: snapToGrid(minChildY) } },
              },
              [toId],
            )
          }
        }
      }
      return { relations, widgets, blockedWidgetIds: computeBlockedWidgetIds(relations) }
    })
    return id
  },

  toggleResolveRelation: (id) => {
    if (!get().relations[id]) return
    pushHistory()
    set((state) => {
      const rel = state.relations[id]
      if (!rel) return state
      const relations = { ...state.relations, [id]: { ...rel, isResolved: !rel.isResolved } }
      return { relations, blockedWidgetIds: computeBlockedWidgetIds(relations) }
    })
  },

  updateRelation: (id, patch) => {
    if (!get().relations[id]) return
    pushHistory()
    set((state) => {
      const relation = state.relations[id]
      if (!relation) return state
      const relations = { ...state.relations, [id]: { ...relation, ...patch, isResolved: false } }
      return { relations, blockedWidgetIds: computeBlockedWidgetIds(relations) }
    })
  },

  deleteRelation: (id) => {
    if (!get().relations[id]) return
    pushHistory()
    set((state) => {
      if (!state.relations[id]) return state
      const relations = { ...state.relations }
      delete relations[id]
      return { relations, blockedWidgetIds: computeBlockedWidgetIds(relations) }
    })
  },

  toggleCriticalPath: () =>
    set((state) => ({ criticalPathVisible: !state.criticalPathVisible })),

  addConnection: (draft) => {
    const state = get()
    if (draft.fromId === draft.toId) return null
    const source = state.widgets[draft.fromId]
    const target = state.widgets[draft.toId]
    if (!source || !target) return null
    // The wire's endpoints must exist in the field registry: a readable
    // source field, and a settable target field or a real command.
    if (!fieldDescriptor(source.type, draft.fromField)) return null
    if (draft.kind === 'value') {
      const targetField = draft.toField ? fieldDescriptor(target.type, draft.toField) : undefined
      if (!targetField?.set) return null
    } else if (!commandsFor(target.type).some((command) => command.key === draft.command)) {
      return null
    }
    // A trigger wire identical to an existing one is a no-op re-draw.
    if (draft.kind === 'trigger') {
      for (const existing of Object.values(state.connections)) {
        if (
          existing.kind === 'trigger' &&
          existing.fromId === draft.fromId &&
          existing.fromField === draft.fromField &&
          existing.toId === draft.toId &&
          existing.command === draft.command
        ) {
          return existing.id
        }
      }
    }
    pushHistory()
    const id = crypto.randomUUID()
    const connection: Connection = { ...draft, id, enabled: draft.enabled ?? true }
    set((current) => {
      const connections = { ...current.connections }
      // Single-writer rule: one incoming value wire per target field.
      if (connection.kind === 'value') {
        for (const existing of Object.values(connections)) {
          if (
            existing.kind === 'value' &&
            existing.toId === connection.toId &&
            existing.toField === connection.toField
          ) {
            delete connections[existing.id]
          }
        }
      }
      connections[id] = connection
      return { connections }
    })
    return id
  },

  updateConnection: (id, patch) => {
    if (!get().connections[id]) return
    pushHistory(`connection:${id}`)
    set((state) => {
      const connection = state.connections[id]
      if (!connection) return state
      return { connections: { ...state.connections, [id]: { ...connection, ...patch } } }
    })
  },

  deleteConnection: (id) => {
    if (!get().connections[id]) return
    pushHistory()
    set((state) => {
      if (!state.connections[id]) return state
      const connections = { ...state.connections }
      delete connections[id]
      return { connections }
    })
  },

  applyWireWrites: (writes) => {
    if (writes.size === 0) return
    set((state) => {
      let widgets = state.widgets
      const resized: string[] = []
      for (const [widgetId, data] of writes) {
        const widget = widgets[widgetId]
        if (!widget || widget.data === data) continue
        if (widgets === state.widgets) widgets = { ...state.widgets }
        // Same content-height discipline as updateWidgetData: growth lands on
        // the live card, while a legacy collapsed card retains its pill size.
        const newHeight = computeDataHeight(widget.type, data)
        const newWidth = computeDataWidth(widget.type, data)
        if (widget.collapsed || widget.iconified) {
          const previousExpanded = widget.expandedSize ?? widgetDefinition(widget.type).defaultSize
          const expandedSize = {
            width: Math.max(previousExpanded.width, newWidth),
            height: Math.max(previousExpanded.height, newHeight),
          }
          widgets[widgetId] = { ...widget, data, expandedSize }
        } else {
          const size = {
            width: Math.max(widget.size.width, newWidth),
            height: Math.max(widget.size.height, newHeight),
          }
          widgets[widgetId] = { ...widget, data, size }
          if (size !== widget.size) resized.push(widgetId)
        }
      }
      if (widgets === state.widgets) return state
      if (resized.length > 0) widgets = settleWidgetLayout(widgets, resized)
      return { widgets }
    })
  },
  }
}
