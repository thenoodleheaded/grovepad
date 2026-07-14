import type { Vector2D } from '../types/spatial'

/**
 * How an edge's tangents should leave and enter its endpoints.
 * - 'vertical': out of the bottom of one card, into the top of the other —
 *   the org-chart flow used by parent→child edges.
 * - 'auto': tangents follow the dominant axis of the connection, so a link
 *   that runs mostly sideways leaves horizontally and one that runs mostly
 *   up/down leaves vertically.
 */
export type CurveAxis = 'auto' | 'vertical'

interface CubicCurveGeometry {
  start: Vector2D
  c1: Vector2D
  c2: Vector2D
  end: Vector2D
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Cubic-bezier control points for a natural "flow" curve. The tangents
 * extend along the chosen axis from each endpoint, which makes edges ease
 * out of one card and ease into the other instead of bowing sideways.
 * Pure math, computed once per edge — no per-frame cost.
 */
function controlPoints(
  start: Vector2D,
  end: Vector2D,
  axis: CurveAxis,
): { c1: Vector2D; c2: Vector2D } {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (axis === 'vertical') {
    // Parent edges anchor bottom→top, so tangents always exit downward and
    // enter from above — even when the child sits beside or above its
    // parent, the line loops around legibly like a hand-drawn branch.
    const reach = clamp(Math.abs(dy) * 0.55 + Math.abs(dx) * 0.12, 28, 180)
    return {
      c1: { x: start.x, y: start.y + reach },
      c2: { x: end.x, y: end.y - reach },
    }
  }

  // Auto: follow the dominant axis, signed toward the other endpoint.
  if (Math.abs(dx) >= Math.abs(dy)) {
    const reach = clamp(Math.abs(dx) * 0.45, 24, 150)
    const dir = dx >= 0 ? 1 : -1
    return {
      c1: { x: start.x + dir * reach, y: start.y },
      c2: { x: end.x - dir * reach, y: end.y },
    }
  }
  const reach = clamp(Math.abs(dy) * 0.45, 24, 150)
  const dir = dy >= 0 ? 1 : -1
  return {
    c1: { x: start.x, y: start.y + dir * reach },
    c2: { x: end.x, y: end.y - dir * reach },
  }
}

function pointOnCubic(curve: CubicCurveGeometry, t: number): Vector2D {
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return {
    x:
      curve.start.x * mt2 * mt +
      3 * curve.c1.x * mt2 * t +
      3 * curve.c2.x * mt * t2 +
      curve.end.x * t2 * t,
    y:
      curve.start.y * mt2 * mt +
      3 * curve.c1.y * mt2 * t +
      3 * curve.c2.y * mt * t2 +
      curve.end.y * t2 * t,
  }
}

/** Cubic geometry shared by SVG rendering, hit testing, and obstacle routing. */
function curvedGeometry(
  start: Vector2D,
  end: Vector2D,
  axis: CurveAxis = 'auto',
): CubicCurveGeometry {
  const { c1, c2 } = controlPoints(start, end, axis)
  return { start, c1, c2, end }
}

/** SVG path `d` for a smooth flow curve between two points. */
export function curvedPath(start: Vector2D, end: Vector2D, axis: CurveAxis = 'auto'): string {
  const { c1, c2 } = curvedGeometry(start, end, axis)
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`
}

/**
 * Stable card-to-card route. Each endpoint first travels a short, bounded
 * distance along its card's outward normal, then the escaped points connect
 * with the ordinary dominant-axis curve. Unlike the old single radial cubic,
 * distant or reversed cards cannot pull controls hundreds of pixels backward
 * and create a seemingly random loop when an anchor changes sides.
 */
export function anchoredCurvePath(
  start: Vector2D,
  startCenter: Vector2D,
  end: Vector2D,
  endCenter: Vector2D,
): string {
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const escape = clamp(distance * 0.08, 10, 30)
  const startNormal = unitAway(start, startCenter)
  const endNormal = unitAway(end, endCenter)
  const escapedStart = addScaled(start, startNormal, escape)
  const escapedEnd = addScaled(end, endNormal, escape)
  const middle = boundedMiddleGeometry(escapedStart, escapedEnd)
  const startC1 = addScaled(start, startNormal, escape * 0.55)
  const startC2 = addScaled(escapedStart, startNormal, -escape * 0.18)
  const endC1 = addScaled(escapedEnd, endNormal, -escape * 0.18)
  const endC2 = addScaled(end, endNormal, escape * 0.55)
  return [
    `M ${start.x} ${start.y}`,
    `C ${startC1.x} ${startC1.y} ${startC2.x} ${startC2.y} ${escapedStart.x} ${escapedStart.y}`,
    `C ${middle.c1.x} ${middle.c1.y} ${middle.c2.x} ${middle.c2.y} ${escapedEnd.x} ${escapedEnd.y}`,
    `C ${endC1.x} ${endC1.y} ${endC2.x} ${endC2.y} ${end.x} ${end.y}`,
  ].join(' ')
}

export function anchoredCurveMidpoint(
  start: Vector2D,
  startCenter: Vector2D,
  end: Vector2D,
  endCenter: Vector2D,
): Vector2D {
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const escape = clamp(distance * 0.08, 10, 30)
  const escapedStart = addScaled(start, unitAway(start, startCenter), escape)
  const escapedEnd = addScaled(end, unitAway(end, endCenter), escape)
  return pointOnCubic(boundedMiddleGeometry(escapedStart, escapedEnd), 0.5)
}

function boundedMiddleGeometry(start: Vector2D, end: Vector2D): CubicCurveGeometry {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const reach = Math.min(Math.abs(dx) * 0.35, 120)
    const direction = dx >= 0 ? 1 : -1
    return {
      start,
      c1: { x: start.x + direction * reach, y: start.y },
      c2: { x: end.x - direction * reach, y: end.y },
      end,
    }
  }
  const reach = Math.min(Math.abs(dy) * 0.35, 120)
  const direction = dy >= 0 ? 1 : -1
  return {
    start,
    c1: { x: start.x, y: start.y + direction * reach },
    c2: { x: end.x, y: end.y - direction * reach },
    end,
  }
}

function unitAway(point: Vector2D, center: Vector2D): Vector2D {
  const dx = point.x - center.x
  const dy = point.y - center.y
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

function addScaled(point: Vector2D, direction: Vector2D, amount: number): Vector2D {
  return { x: point.x + direction.x * amount, y: point.y + direction.y * amount }
}

export interface FlowCurve {
  /** Full cubic path: M P0 C P1, P2, P3. */
  d: string
  /** Exact curve point at t = 0.5 — where the mapping chip pins. */
  mid: Vector2D
}

/**
 * Port-oriented cubic for field wires: the curve always EXITS the source
 * port horizontally to the right and ENTERS the target port horizontally
 * from the left, like a circuit trace.
 *
 * Tangent reach adapts to the endpoints' actual layout:
 * - Cards side by side → reach shrinks toward a tight, short bow.
 * - Far apart → reach grows (capped) so the curve stretches gracefully.
 * - Target BEHIND the source (dx < 0) → reach grows with the overlap plus
 *   a share of the vertical gap, producing a clean S-loop around the cards
 *   instead of a pinched hairpin.
 *
 * Pure math over two points — callers feed world coordinates from state,
 * so the result is zoom/pan-invariant by construction.
 */
export function flowCurve(start: Vector2D, end: Vector2D): FlowCurve {
  const curve = flowCurveGeometry(start, end)
  const { c1, c2 } = curve
  return {
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
    mid: pointOnCubic(curve, 0.5),
  }
}

/** Port-oriented cubic geometry used by field wires and their router. */
function flowCurveGeometry(start: Vector2D, end: Vector2D): CubicCurveGeometry {
  const dx = end.x - start.x
  const dy = end.y - start.y

  let reach: number
  if (dx >= 0) {
    // Forward run: mostly proportional to distance, tight when adjacent.
    reach = clamp(dx * 0.5 + Math.abs(dy) * 0.08, 24, 220)
  } else {
    // Backward run: push the tangents out past both cards to loop around.
    reach = clamp(-dx * 0.55 + Math.abs(dy) * 0.22 + 48, 72, 320)
  }

  const c1 = { x: start.x + reach, y: start.y }
  const c2 = { x: end.x - reach, y: end.y }
  return { start, c1, c2, end }
}
