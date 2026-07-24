import { useCanvasStore } from '../store/useCanvasStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { clusterFrameEnvelope, clusterTitleRowRect } from './glueGeometry'
import type { WorldRect } from './canvasView'

function hits(box: WorldRect | null, x: number, y: number): boolean {
  return Boolean(box && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height)
}

/**
 * Resolves the widget under a screen point to its widget id. When no card is
 * under the pointer, a glue group's own area is a drop hook: a relation
 * released anywhere on it allocates to the group (any member id resolves to
 * the cluster's single link node, so which member is returned does not
 * matter).
 *
 * That area is the group's frame PLUS its title/button row — two rects, never
 * one grown box. The empty canvas beside a short group name is not the group,
 * so a relation dropped there still misses, exactly as it looks.
 */
export function resolveLinkTargetAt(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY)
  const widgetEl = el?.closest('[data-widget-id]')
  if (widgetEl) {
    return widgetEl.getAttribute('data-widget-id')
  }

  const { pan, zoom } = useCanvasStore.getState()
  if (!(zoom > 0)) return null
  const worldX = (clientX - pan.x) / zoom
  const worldY = (clientY - pan.y) / zoom
  const state = useWidgetStore.getState()
  for (const glue of Object.values(state.glues)) {
    if (glue.widgetIds.length < 2) continue
    const first = glue.widgetIds[0]
    if (!first || state.widgets[first]?.canvasId !== state.activeCanvasId) continue
    if (
      hits(clusterFrameEnvelope(glue.widgetIds, state.widgets), worldX, worldY) ||
      hits(clusterTitleRowRect(glue.widgetIds, state.widgets, glue.name), worldX, worldY)
    ) {
      return first
    }
  }
  return null
}
