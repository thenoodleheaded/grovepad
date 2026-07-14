import type { Vector2D, Widget, WidgetGroup } from '../types/spatial'
import type { WorldRect } from './canvasView'

/** World-space clearance between a member widget and the group band. */
export const GROUP_PAD = 38

/**
 * Single source of truth for a group's world-space bounding box. GroupLayer
 * (culling), RelationLines (edge routing), and WidgetCard (drop targeting)
 * all derive from this instead of re-summing member rects themselves.
 */
export function groupWorldBounds(
  group: WidgetGroup,
  widgets: Record<string, Widget>,
  pad: number = GROUP_PAD,
): WorldRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const widgetId of group.widgetIds) {
    const w = widgets[widgetId]
    if (!w) continue
    minX = Math.min(minX, w.position.x)
    minY = Math.min(minY, w.position.y)
    maxX = Math.max(maxX, w.position.x + w.size.width)
    maxY = Math.max(maxY, w.position.y + w.size.height)
  }
  if (!Number.isFinite(minX)) return null
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  }
}

function cross(o: Vector2D, a: Vector2D, b: Vector2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Andrew's monotone chain; collinear points are dropped. */
export function convexHull(points: Vector2D[]): Vector2D[] {
  const pts = [...points].sort((p, q) => p.x - q.x || p.y - q.y)
  if (pts.length <= 2) return pts
  const chain = (input: Vector2D[]): Vector2D[] => {
    const out: Vector2D[] = []
    for (const p of input) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) {
        out.pop()
      }
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...chain(pts), ...chain([...pts].reverse())]
}

/** The four corners of each member rect, inflated by the band clearance. */
export function paddedMemberCorners(members: Widget[], pad: number = GROUP_PAD): Vector2D[] {
  const corners: Vector2D[] = []
  for (const w of members) {
    const left = w.position.x - pad
    const right = w.position.x + w.size.width + pad
    const top = w.position.y - pad
    const bottom = w.position.y + w.size.height + pad
    corners.push({ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom })
  }
  return corners
}

/** How far a hull vertex corner is rounded off where the band bends around it. */
const CORNER_RADIUS = 22
/** Maximum inward sag of a band span, well under GROUP_PAD so widgets stay clear. */
const MAX_SAG = 13

/**
 * SVG path for a taut elastic band shrink-wrapped around the hull: each
 * vertex is rounded where the band bends around a widget corner, and each
 * span between vertices bows slightly inward (toward the centroid) like
 * stretched rubber. `sagScale` 1 = taut; 0 = fully relaxed (used while a
 * widget hovers to join, so the band visually opens to accept it).
 *
 * All quadratic segments with a fixed structure per hull, so the CSS `d`
 * transition can morph taut ↔ relaxed for free.
 */
export function shrinkWrapPath(hull: Vector2D[], sagScale = 1): string {
  const n = hull.length
  if (n < 3) return ''

  let cx = 0
  let cy = 0
  for (const p of hull) {
    cx += p.x
    cy += p.y
  }
  cx /= n
  cy /= n

  const dirs: Vector2D[] = []
  const lens: number[] = []
  for (let i = 0; i < n; i++) {
    const p = hull[i]!
    const q = hull[(i + 1) % n]!
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    dirs.push({ x: (q.x - p.x) / len, y: (q.y - p.y) / len })
    lens.push(len)
  }
  const radiusAt = (i: number) =>
    Math.min(CORNER_RADIUS, lens[(i + n - 1) % n]! * 0.28, lens[i]! * 0.28)

  const f = (v: number) => v.toFixed(1)
  let d = ''
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const p = hull[i]!
    const q = hull[j]!
    const dir = dirs[i]!
    const rI = radiusAt(i)
    const rJ = radiusAt(j)
    const ax = p.x + dir.x * rI
    const ay = p.y + dir.y * rI
    const bx = q.x - dir.x * rJ
    const by = q.y - dir.y * rJ

    // Span control point, pulled toward the centroid for the taut look.
    const sag = Math.min(MAX_SAG, lens[i]! * 0.055) * sagScale
    const mx = (ax + bx) / 2
    const my = (ay + by) / 2
    let nx = -dir.y
    let ny = dir.x
    if (nx * (cx - mx) + ny * (cy - my) < 0) {
      nx = -nx
      ny = -ny
    }

    if (i === 0) d += `M ${f(ax)} ${f(ay)}`
    d += ` Q ${f(mx + nx * sag)} ${f(my + ny * sag)} ${f(bx)} ${f(by)}`
    // Bend around the vertex at q into the next span.
    const next = dirs[j]!
    d += ` Q ${f(q.x)} ${f(q.y)} ${f(q.x + next.x * rJ)} ${f(q.y + next.y * rJ)}`
  }
  return d + ' Z'
}
