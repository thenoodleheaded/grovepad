import type { Size, Vector2D, Widget } from '../types/spatial'

export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

export function viewportToWorldRect(
  pan: Vector2D,
  zoom: number,
  viewportSize: Size,
  overscanScreen = 0,
): WorldRect {
  const safeZoom = zoom > 0 ? zoom : 1
  const overscan = overscanScreen / safeZoom
  return {
    x: (-pan.x / safeZoom) - overscan,
    y: (-pan.y / safeZoom) - overscan,
    width: viewportSize.width / safeZoom + overscan * 2,
    height: viewportSize.height / safeZoom + overscan * 2,
  }
}

export function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function widgetIntersectsRect(widget: Widget, rect: WorldRect): boolean {
  // Keep this allocation-free: viewport culling calls it for every nearby
  // widget (and often twice) whenever the camera crosses a view chunk.
  return (
    widget.position.x < rect.x + rect.width &&
    widget.position.x + widget.size.width > rect.x &&
    widget.position.y < rect.y + rect.height &&
    widget.position.y + widget.size.height > rect.y
  )
}
