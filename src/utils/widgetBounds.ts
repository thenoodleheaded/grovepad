import type { Widget } from '../types/spatial'
import type { WorldRect } from './canvasView'

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
