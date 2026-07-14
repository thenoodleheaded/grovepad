import { useWidgetStore, type WidgetStoreState } from '../store/useWidgetStore'

/**
 * A grouped widget can't be an individual link endpoint — the group box owns
 * the connection instead. Resolves any widget id to itself (ungrouped) or to
 * its group's anchor member (grouped), so relation storage stays widget-to-
 * widget while every grouped member routes through one consistent id.
 */
export function linkAnchorId(state: WidgetStoreState, widgetId: string): string {
  const groupId = state.widgetGroupIndex[widgetId]
  if (!groupId) return widgetId
  return state.groups[groupId]?.widgetIds[0] ?? widgetId
}

/** Resolves the widget/group under a screen point to its link-anchor widget id. */
export function resolveLinkTargetAt(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return null
  const state = useWidgetStore.getState()

  const widgetEl = el.closest('[data-widget-id]')
  if (widgetEl) {
    const widgetId = widgetEl.getAttribute('data-widget-id')
    return widgetId ? linkAnchorId(state, widgetId) : null
  }

  const groupEl = el.closest('[data-group-id]')
  if (groupEl) {
    const groupId = groupEl.getAttribute('data-group-id')
    return groupId ? (state.groups[groupId]?.widgetIds[0] ?? null) : null
  }

  return null
}
