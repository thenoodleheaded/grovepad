import type { Size, Vector2D } from '../types/spatial'

// ---------------------------------------------------------------------------
// Edge-proximity resize affordance.
//
// A widget has no corner grip. Instead the outline itself answers to the
// pointer: approach any of the four sides and that stretch of border thickens.
// Approach where two sides meet and both thicken, which is how a diagonal
// (square-preserving) drag is expressed. Everything here is pure geometry in
// the card's own local coordinates so it can be tested without a DOM.
// ---------------------------------------------------------------------------

/** Which sides a gesture moves: -1 left/top, +1 right/bottom, 0 pinned. The
 * pinned side never moves, so a drag grows the box away from it rather than
 * out of its centre. */
export interface ResizeEdge {
  x: -1 | 0 | 1
  y: -1 | 0 | 1
}

/** Screen px of border that answers to the pointer, and how far along the
 * perpendicular axis a side still counts as its own corner. Screen-space, so
 * the band stays equally reachable at every zoom. */
export const RESIZE_BAND_PX = 14
export const RESIZE_CORNER_PX = 28

/** Bands are capped against the box so a small tile never becomes one
 * undifferentiated hit area with no interior left to press. */
function scaledBands(size: Size, band: number, corner: number) {
  const limit = Math.max(2, Math.min(size.width, size.height) / 3)
  const activeBand = Math.min(band, limit)
  return { band: activeBand, corner: Math.max(activeBand, Math.min(corner, limit * 1.6)) }
}

/**
 * The edge armed for a pointer sitting at `point` in the box's local
 * coordinates, or null when the pointer is in the interior (or outside the
 * band entirely). The band reaches slightly beyond the border on purpose:
 * outlines are thin, and overshooting one by a pixel should not disarm.
 */
export function resizeEdgeAt(
  point: Vector2D,
  size: Size,
  bandPx = RESIZE_BAND_PX,
  cornerPx = RESIZE_CORNER_PX,
): ResizeEdge | null {
  const { band, corner } = scaledBands(size, bandPx, cornerPx)
  if (point.x < -band || point.x > size.width + band) return null
  if (point.y < -band || point.y > size.height + band) return null

  let x: ResizeEdge['x'] = 0
  let y: ResizeEdge['y'] = 0
  if (point.x <= band) x = -1
  else if (point.x >= size.width - band) x = 1
  if (point.y <= band) y = -1
  else if (point.y >= size.height - band) y = 1

  // One side armed, but the pointer sits inside the other axis' corner box:
  // promote to the corner so a diagonal drag is reachable without hitting an
  // exact pixel where the two thin bands overlap.
  if (x !== 0 && y === 0) {
    if (point.y <= corner) y = -1
    else if (point.y >= size.height - corner) y = 1
  } else if (y !== 0 && x === 0) {
    if (point.x <= corner) x = -1
    else if (point.x >= size.width - corner) x = 1
  }

  return x === 0 && y === 0 ? null : { x, y }
}

/** Stable attribute value so CSS can thicken exactly the armed stretch. */
export function resizeEdgeKey(edge: ResizeEdge | null): string | undefined {
  if (!edge) return undefined
  const vertical = edge.y === -1 ? 't' : edge.y === 1 ? 'b' : ''
  const horizontal = edge.x === -1 ? 'l' : edge.x === 1 ? 'r' : ''
  return `${vertical}${horizontal}` || undefined
}

export function resizeEdgeCursor(edge: ResizeEdge | null): string | undefined {
  if (!edge) return undefined
  if (edge.x === 0) return 'ns-resize'
  if (edge.y === 0) return 'ew-resize'
  return edge.x === edge.y ? 'nwse-resize' : 'nesw-resize'
}

export function sameResizeEdge(a: ResizeEdge | null, b: ResizeEdge | null): boolean {
  if (a === null || b === null) return a === b
  return a.x === b.x && a.y === b.y
}

/**
 * Outward pointer travel along each axis, signed by the armed edge: positive
 * means "bigger". A pinned axis contributes nothing, which is what makes a
 * pure side drag a one-axis intent and a corner drag a two-axis one.
 */
export function outwardGrowth(edge: ResizeEdge, dx: number, dy: number): Vector2D {
  return { x: edge.x * dx, y: edge.y * dy }
}

/**
 * Where the box's origin has to sit so the pinned sides stay exactly where
 * they were while the dragged sides move. Growing from the left edge walks the
 * origin left; growing from the right leaves it alone.
 */
export function anchoredOrigin(
  origin: Vector2D,
  from: Size,
  to: Size,
  edge: ResizeEdge,
): Vector2D {
  return {
    x: edge.x === -1 ? origin.x + (from.width - to.width) : origin.x,
    y: edge.y === -1 ? origin.y + (from.height - to.height) : origin.y,
  }
}

/** Re-centre `to` on the box `from` occupied. Every scale-state change lands
 * through here, so the asymmetry a side drag accumulates is forgotten the
 * moment the widget closes and reopens in another state. Deliberately
 * unrounded: a state round trip has to return the widget to the exact world
 * position it started from, and half-pixel rounding would let it walk. */
export function recenteredOrigin(origin: Vector2D, from: Size, to: Size): Vector2D {
  return {
    x: origin.x + (from.width - to.width) / 2,
    y: origin.y + (from.height - to.height) / 2,
  }
}
