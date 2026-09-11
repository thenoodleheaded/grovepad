import type { Vector2D } from '../types/spatial'
import { clamp } from './math'

/**
 * Circuit wire geometry. Card-to-card relation and dependency lines are NOT
 * here — they belong to `edgeRoute.ts`, which anchors them on real borders.
 * A wire is different in kind: it runs port to port, always exiting right and
 * entering left like a circuit trace, so it keeps its own curve.
 */

interface CubicCurveGeometry {
  start: Vector2D
  c1: Vector2D
  c2: Vector2D
  end: Vector2D
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
