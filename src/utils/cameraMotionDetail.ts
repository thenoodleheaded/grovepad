import type { Vector2D, Widget } from '../types/spatial'

/** Matches WidgetLayer's stable render ceiling. */
export const MOTION_WIDGET_BUDGET = 320

/**
 * Captures are intentionally a little below world resolution. At the highest
 * camera zoom covered by the pressure target (80%), a normal card is still
 * sampled close to one source pixel per screen pixel, while 300 cached cards
 * remain a practical GPU-memory workload.
 */
export const MOTION_SNAPSHOT_MAX_SCALE = 0.75
export const MOTION_SNAPSHOT_MIN_SCALE = 0.35
export const MOTION_SNAPSHOT_MAX_PIXELS = 90_000

/**
 * The low-resolution whole-board texture and the sharper local tiles overlap
 * across this range. This is a continuous compositor blend, not a detail mode
 * switch: every widget remains present on both surfaces at every zoom level.
 */
export const MOTION_DETAIL_BLEND_START = 0.34
export const MOTION_DETAIL_BLEND_END = 0.58

export function motionLocalDetailAlpha(zoom: number): number {
  const progress =
    (zoom - MOTION_DETAIL_BLEND_START) /
    (MOTION_DETAIL_BLEND_END - MOTION_DETAIL_BLEND_START)
  return Math.max(0, Math.min(1, progress))
}

export interface MotionViewport {
  pan: Vector2D
  zoom: number
  width: number
  height: number
}

export function motionSnapshotScale(width: number, height: number): number {
  const area = Math.max(1, width) * Math.max(1, height)
  const areaScale = Math.sqrt(MOTION_SNAPSHOT_MAX_PIXELS / area)
  return Math.max(
    MOTION_SNAPSHOT_MIN_SCALE,
    Math.min(MOTION_SNAPSHOT_MAX_SCALE, areaScale),
  )
}

export function motionWidgetIsVisible(widget: Widget, viewport: MotionViewport): boolean {
  const zoom = Math.max(viewport.zoom, 0.01)
  const left = viewport.pan.x + widget.position.x * zoom
  const top = viewport.pan.y + widget.position.y * zoom
  const right = left + widget.size.width * zoom
  const bottom = top + widget.size.height * zoom
  return right > 0 && bottom > 0 && left < viewport.width && top < viewport.height
}

/**
 * Snapshot visible cards first, then work outwards from the camera. This makes
 * the detailed preview useful quickly on a large board without changing which
 * real widgets stay mounted.
 */
export function prioritizeMotionWidgets(
  widgets: Record<string, Widget>,
  activeCanvasId: string,
  viewport: MotionViewport,
): Widget[] {
  const safeZoom = Math.max(viewport.zoom, 0.01)
  const worldCenter = {
    x: (viewport.width / 2 - viewport.pan.x) / safeZoom,
    y: (viewport.height / 2 - viewport.pan.y) / safeZoom,
  }

  return Object.values(widgets)
    .filter((widget) => widget.canvasId === activeCanvasId)
    .sort((a, b) => {
      const aVisible = motionWidgetIsVisible(a, viewport)
      const bVisible = motionWidgetIsVisible(b, viewport)
      if (aVisible !== bVisible) return aVisible ? -1 : 1
      const aX = a.position.x + a.size.width / 2 - worldCenter.x
      const aY = a.position.y + a.size.height / 2 - worldCenter.y
      const bX = b.position.x + b.size.width / 2 - worldCenter.x
      const bY = b.position.y + b.size.height / 2 - worldCenter.y
      const distanceDelta = aX * aX + aY * aY - (bX * bX + bY * bY)
      if (distanceDelta !== 0) return distanceDelta
      return a.id.localeCompare(b.id)
    })
    .slice(0, MOTION_WIDGET_BUDGET)
}
