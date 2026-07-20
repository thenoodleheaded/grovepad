import { GRID_SIZE, type Vector2D, type Widget } from '../types/spatial'
import type { WorldRect } from './canvasView'
import { GROUP_PAD, widgetHoverRect } from './groupGeometry'

// ---------------------------------------------------------------------------
// Group plate silhouette
//
// The shared group backplate is not a bounding rectangle: it is the union of
// every member's padded hover footprint, traced into rectilinear outlines and
// rounded at the corners. All functions here are pure world-space geometry so
// the silhouette is deterministic and unit-testable without a DOM.
// ---------------------------------------------------------------------------

/** Visible glass extends this far beyond each member's hover footprint. */
export const PLATE_GLASS_PAD = GROUP_PAD - GRID_SIZE / 2 // 18
/** Corner radius of the silhouette (clamped per-corner to short edges). */
export const PLATE_RADIUS = GRID_SIZE

export function padRect(rect: WorldRect, pad: number): WorldRect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

interface DirectedEdge {
  from: Vector2D
  to: Vector2D
  used: boolean
}

const pointKey = (p: Vector2D) => `${p.x},${p.y}`

/**
 * Union outline(s) of axis-aligned rects as closed rectilinear polygons.
 * Contours are traced with the covered region on the right of the direction
 * of travel (screen coordinates, y down), so outer boundaries come out with
 * positive shoelace area. Interior holes (a ring of widgets around empty
 * canvas) are dropped — the plate reads better as solid glass than as a
 * donut, and nothing anchors to a hole edge.
 */
export function unionOutlines(rects: readonly WorldRect[]): Vector2D[][] {
  const boxes = rects.filter((r) => r.width > 0 && r.height > 0)
  if (boxes.length === 0) return []

  // Coordinate compression: every rect edge becomes a grid line; each grid
  // cell is uniformly covered or uncovered, so coverage at the cell center
  // decides the whole cell.
  const xs = [...new Set(boxes.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b)
  const ys = [...new Set(boxes.flatMap((r) => [r.y, r.y + r.height]))].sort((a, b) => a - b)
  const cols = xs.length - 1
  const rows = ys.length - 1

  const covered: boolean[] = new Array(cols * rows)
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2
      const cy = (ys[j]! + ys[j + 1]!) / 2
      covered[j * cols + i] = boxes.some(
        (r) => cx > r.x && cx < r.x + r.width && cy > r.y && cy < r.y + r.height,
      )
    }
  }
  const isCovered = (i: number, j: number): boolean =>
    i >= 0 && j >= 0 && i < cols && j < rows && covered[j * cols + i] === true

  // Boundary edges of covered cells, directed so the interior stays on the
  // right of travel.
  const edgesByStart = new Map<string, DirectedEdge[]>()
  const addEdge = (from: Vector2D, to: Vector2D) => {
    const edge: DirectedEdge = { from, to, used: false }
    const key = pointKey(from)
    const list = edgesByStart.get(key)
    if (list) list.push(edge)
    else edgesByStart.set(key, [edge])
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (!isCovered(i, j)) continue
      const x0 = xs[i]!
      const x1 = xs[i + 1]!
      const y0 = ys[j]!
      const y1 = ys[j + 1]!
      if (!isCovered(i, j - 1)) addEdge({ x: x0, y: y0 }, { x: x1, y: y0 }) // top → +x
      if (!isCovered(i + 1, j)) addEdge({ x: x1, y: y0 }, { x: x1, y: y1 }) // right → +y
      if (!isCovered(i, j + 1)) addEdge({ x: x1, y: y1 }, { x: x0, y: y1 }) // bottom → −x
      if (!isCovered(i - 1, j)) addEdge({ x: x0, y: y1 }, { x: x0, y: y0 }) // left → −y
    }
  }

  // Chain directed edges into closed contours. Where two contours touch at a
  // single point (rects meeting corner-to-corner) there are two candidate
  // continuations; taking the sharpest right turn keeps each contour simple.
  const contours: Vector2D[][] = []
  for (const list of edgesByStart.values()) {
    for (const seed of list) {
      if (seed.used) continue
      const contour: Vector2D[] = [seed.from]
      let current = seed
      current.used = true
      for (;;) {
        const nextCandidates = (edgesByStart.get(pointKey(current.to)) ?? []).filter((e) => !e.used)
        if (nextCandidates.length === 0) break
        const dir = {
          x: Math.sign(current.to.x - current.from.x),
          y: Math.sign(current.to.y - current.from.y),
        }
        // Rank turns: right turn > straight > left turn (cross > 0 is a right
        // turn with y down and interior-on-right winding).
        let next = nextCandidates[0]!
        let bestRank = -Infinity
        for (const candidate of nextCandidates) {
          const out = {
            x: Math.sign(candidate.to.x - candidate.from.x),
            y: Math.sign(candidate.to.y - candidate.from.y),
          }
          const cross = dir.x * out.y - dir.y * out.x
          const rank = cross > 0 ? 2 : cross === 0 ? 1 : 0
          if (rank > bestRank) {
            bestRank = rank
            next = candidate
          }
        }
        next.used = true
        contour.push(next.from)
        current = next
        if (pointKey(current.to) === pointKey(contour[0]!)) break
      }
      contours.push(mergeCollinear(contour))
    }
  }

  // Positive shoelace area (with this winding, y down) marks outer boundaries;
  // holes trace the other way and are dropped.
  return contours.filter((contour) => shoelaceArea(contour) > 0)
}

function mergeCollinear(points: Vector2D[]): Vector2D[] {
  const merged: Vector2D[] = []
  const n = points.length
  for (let k = 0; k < n; k++) {
    const prev = points[(k - 1 + n) % n]!
    const cur = points[k]!
    const next = points[(k + 1) % n]!
    const straight =
      (prev.x === cur.x && cur.x === next.x) || (prev.y === cur.y && cur.y === next.y)
    if (!straight) merged.push(cur)
  }
  return merged
}

function shoelaceArea(points: readonly Vector2D[]): number {
  let sum = 0
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!
    const b = points[(k + 1) % points.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

const fmt = (value: number) => {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/**
 * SVG path for one closed rectilinear polygon with rounded corners. Convex
 * and concave corners both round with `radius`, clamped to half of each
 * adjacent edge so short seams between neighbouring members never overlap.
 */
export function roundedRectilinearPath(points: readonly Vector2D[], radius: number): string {
  const n = points.length
  if (n < 3) return ''
  const parts: string[] = []
  for (let k = 0; k < n; k++) {
    const prev = points[(k - 1 + n) % n]!
    const cur = points[k]!
    const next = points[(k + 1) % n]!
    const inLen = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y)
    const outLen = Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const inDir = { x: Math.sign(cur.x - prev.x), y: Math.sign(cur.y - prev.y) }
    const outDir = { x: Math.sign(next.x - cur.x), y: Math.sign(next.y - cur.y) }
    const start = { x: cur.x - inDir.x * r, y: cur.y - inDir.y * r }
    const end = { x: cur.x + outDir.x * r, y: cur.y + outDir.y * r }
    const sweep = inDir.x * outDir.y - inDir.y * outDir.x > 0 ? 1 : 0
    if (k === 0) parts.push(`M ${fmt(start.x)} ${fmt(start.y)}`)
    else parts.push(`L ${fmt(start.x)} ${fmt(start.y)}`)
    parts.push(`A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(end.x)} ${fmt(end.y)}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

/** All outlines of a rect union as one SVG path (nonzero fill keeps it solid). */
export function unionRoundedPath(rects: readonly WorldRect[], radius: number): string {
  return unionOutlines(rects)
    .map((outline) => roundedRectilinearPath(outline, radius))
    .filter(Boolean)
    .join(' ')
}

export interface GroupPlateGeometry {
  /** Layout box for the plate element (hover footprints + GROUP_PAD). */
  bounds: WorldRect
  /** Visible glass silhouette, in coordinates local to `bounds`. */
  glassPath: string
  /** Grab/hit silhouette (wider rim), in coordinates local to `bounds`. */
  hitPath: string
}

/**
 * Complete plate geometry for a member list. The glass silhouette pads each
 * hover footprint by PLATE_GLASS_PAD; the invisible grab surface pads by the
 * full GROUP_PAD, giving the same easy rim the rectangular plate had without
 * hit-testing the empty canvas inside concave notches.
 */
export function groupPlateGeometry(
  members: readonly Pick<Widget, 'position' | 'size' | 'type' | 'metadata' | 'title'>[],
): GroupPlateGeometry | null {
  if (members.length === 0) return null
  const footprints = members.map((member) => widgetHoverRect(member, true))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of footprints) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  const bounds: WorldRect = {
    x: minX - GROUP_PAD,
    y: minY - GROUP_PAD,
    width: maxX - minX + GROUP_PAD * 2,
    height: maxY - minY + GROUP_PAD * 2,
  }
  const local = footprints.map((r) => ({ ...r, x: r.x - bounds.x, y: r.y - bounds.y }))
  return {
    bounds,
    glassPath: unionRoundedPath(local.map((r) => padRect(r, PLATE_GLASS_PAD)), PLATE_RADIUS),
    hitPath: unionRoundedPath(local.map((r) => padRect(r, GROUP_PAD)), PLATE_RADIUS),
  }
}
