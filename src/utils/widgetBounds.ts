import { GRID_SIZE, type Widget } from '../types/spatial'
import type { WorldRect } from './canvasView'

// WidgetCard's own hover catch-all reaches half a cell above every card (for
// the floating title row) and half a cell right when the button cluster
// overflows there. Shared here so the constant lives in one place.
export const WIDGET_HOVER_TOP = GRID_SIZE / 2
export const WIDGET_HOVER_RIGHT = GRID_SIZE / 2

export function boundsForWidgets(widgets: Widget[]): WorldRect | null {
  if (widgets.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const widget of widgets) {
    minX = Math.min(minX, widget.position.x)
    minY = Math.min(minY, widget.position.y)
    maxX = Math.max(maxX, widget.position.x + widget.size.width)
    maxY = Math.max(maxY, widget.position.y + widget.size.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
