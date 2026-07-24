/** Resolves the widget under a screen point to its widget id. */
export function resolveLinkTargetAt(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return null

  const widgetEl = el.closest('[data-widget-id]')
  if (widgetEl) {
    return widgetEl.getAttribute('data-widget-id')
  }

  return null
}
