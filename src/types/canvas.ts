/** A point or displacement in either screen space or world space. */
export interface Vector2D {
  x: number
  y: number
}

/** A width/height pair in world units. */
export interface Size {
  width: number
  height: number
}

/** Full camera transform: screen = world * zoom + pan. */
export interface CanvasTransform {
  x: number
  y: number
  zoom: number
}

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 3

/** Base grid cell size in world units at zoom = 1. */
export const GRID_SIZE = 40

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

export function snapToGrid(value: number, grid: number = GRID_SIZE): number {
  return Math.round(value / grid) * grid
}

export function screenToWorld(point: Vector2D, transform: CanvasTransform): Vector2D {
  return {
    x: (point.x - transform.x) / transform.zoom,
    y: (point.y - transform.y) / transform.zoom,
  }
}
