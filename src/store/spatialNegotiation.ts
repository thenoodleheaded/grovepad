import type { Vector2D } from '../types/spatial'
import { GRID_SIZE, snapToGrid } from '../types/spatial'
import { LAYOUT_GAP } from './widgetLayoutConstants'
import { rectCenter, type LayoutRect } from './widgetCollection'

/**
 * Pure displacement negotiation for drag-onto and resize-into-crowd.
 *
 * Given the dragged (or growing) rect, the recent drag direction, and the
 * nearby rects on the same canvas, this computes grid-aligned ghost offsets:
 * which neighbors slide aside, and by how much, if the gesture committed
 * right now. Nothing here touches stores or React — callers render the
 * offsets in a ghost layer and only write positions on drop, so Escape is a
 * free cancel and the whole gesture stays one undo step.
 *
 * Groups must be passed as a single rigid rect (their padded bounds, the
 * same cluster shape the settle pass uses); the caller fans a cluster's
 * offset back out to its members. Dwell timing (the ~150ms intent gate)
 * is gesture state and lives with the caller — this module only applies
 * the geometric half of the gate, the meaningful-coverage threshold.
 */

export interface NegotiationRect extends LayoutRect {
  /** Locked rects are walls: never displaced, chains deflect around them. */
  locked?: boolean
}

export interface NegotiationOptions {
  /** Clear air required around every settled rect. Default LAYOUT_GAP. */
  gap?: number
  /** Coverage below this fraction is treated as passing over, not intent. */
  minOverlapRatio?: number
  /** How many rects a single push may knock on in sequence. */
  maxChainDepth?: number
  /** Total area (px²) allowed to move per negotiation; the rest is left
   *  overlapped for the release settle. */
  maxDisplacedArea?: number
}

export interface NegotiationResult {
  /** Grid-aligned ghost offset per displaced rect id. */
  offsets: Record<string, Vector2D>
  /** Rects the gesture overlaps but that stayed put (locked, over budget,
   *  past chain depth, or already displaced once) — render as "will settle". */
  overflowIds: string[]
}

const DISPLACEMENT_MIN_OVERLAP_RATIO = 1 / 3
export const DISPLACEMENT_CHAIN_DEPTH = 3
/** Roughly three medium widgets' worth of area. */
const DISPLACEMENT_AREA_BUDGET = 160 * GRID_SIZE * GRID_SIZE

function emptyResult(): NegotiationResult {
  return { offsets: {}, overflowIds: [] }
}

interface Motion {
  x: -1 | 0 | 1
  y: -1 | 0 | 1
}

function rectArea(rect: LayoutRect): number {
  return rect.width * rect.height
}

/** Raw geometric intersection — the gap plays no part in detecting contact,
 *  only in how far a displaced rect must travel to be settle-stable. */
function rawOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function intersectionArea(a: LayoutRect, b: LayoutRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function shifted(rect: LayoutRect, dx: number, dy: number): LayoutRect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy }
}

/** Grid-quantized distance for `target` to clear `pusher` along one axis,
 *  gap included; ≤ 0 when already clear in that direction. */
function separation(pusher: LayoutRect, target: LayoutRect, axis: 'x' | 'y', sign: 1 | -1, gap: number): number {
  const raw =
    axis === 'x'
      ? sign > 0
        ? pusher.x + pusher.width + gap - target.x
        : target.x + target.width + gap - pusher.x
      : sign > 0
        ? pusher.y + pusher.height + gap - target.y
        : target.y + target.height + gap - pusher.y
  return raw > 0 ? Math.ceil(raw / GRID_SIZE) * GRID_SIZE : 0
}

/** Of the axes the pusher actually moved along, the cheapest positive escape. */
function escapeDelta(pusher: LayoutRect, target: LayoutRect, motion: Motion, gap: number): Vector2D | null {
  let best: Vector2D | null = null
  let bestDistance = Infinity
  if (motion.x !== 0) {
    const d = separation(pusher, target, 'x', motion.x, gap)
    if (d > 0 && d < bestDistance) {
      best = { x: motion.x * d, y: 0 }
      bestDistance = d
    }
  }
  if (motion.y !== 0) {
    const d = separation(pusher, target, 'y', motion.y, gap)
    if (d > 0 && d < bestDistance) {
      best = { x: 0, y: motion.y * d }
      bestDistance = d
    }
  }
  return best
}

interface PushRequest {
  targetId: string
  pusher: LayoutRect
  motion: Motion
  depth: number
}

/**
 * Negotiate ghost displacement for the current gesture frame.
 *
 * `direction` is the recent drag movement (any magnitude; only its dominant
 * axis and sign matter). For a resize, pass the grown rect as `dragged` and
 * the edge normal as `direction`. A zero direction falls back to per-neighbor
 * minimum-translation pushes, the same choice the settle pass makes.
 *
 * Deterministic: identical inputs give identical outputs, independent of
 * `neighbors` array order.
 */
export function negotiateDisplacement(
  dragged: LayoutRect,
  direction: Vector2D,
  neighbors: NegotiationRect[],
  options: NegotiationOptions = {},
): NegotiationResult {
  const gap = options.gap ?? LAYOUT_GAP
  const minOverlapRatio = options.minOverlapRatio ?? DISPLACEMENT_MIN_OVERLAP_RATIO
  const maxChainDepth = options.maxChainDepth ?? DISPLACEMENT_CHAIN_DEPTH
  const maxDisplacedArea = options.maxDisplacedArea ?? DISPLACEMENT_AREA_BUDGET

  // Negotiate against the grid projection of the drag — the preview shows
  // where the card would land, and offsets only change on cell crossings.
  const active: LayoutRect = {
    ...dragged,
    x: snapToGrid(dragged.x),
    y: snapToGrid(dragged.y),
  }
  const activeArea = rectArea(active)
  const activeCenter = rectCenter(active)

  const byId = new Map<string, NegotiationRect>()
  for (const rect of neighbors) {
    if (rect.id !== dragged.id) byId.set(rect.id, rect)
  }
  if (byId.size === 0) return emptyResult()

  // Intent gate, geometric half: coverage of either party must be meaningful.
  // A sliver graze moves nothing; a small card sunk into a big one counts.
  const seeds: { rect: NegotiationRect; coverage: number }[] = []
  for (const rect of byId.values()) {
    const inter = intersectionArea(active, rect)
    if (inter <= 0) continue
    const coverage = Math.max(inter / rectArea(rect), inter / activeArea)
    if (coverage >= minOverlapRatio) seeds.push({ rect, coverage })
  }
  if (seeds.length === 0) return emptyResult()
  seeds.sort((a, b) => b.coverage - a.coverage || (a.rect.id < b.rect.id ? -1 : 1))

  const hasDirection = Math.abs(direction.x) > 1e-6 || Math.abs(direction.y) > 1e-6
  const dominantMotion: Motion | null = hasDirection
    ? Math.abs(direction.x) >= Math.abs(direction.y)
      ? { x: direction.x >= 0 ? 1 : -1, y: 0 }
      : { x: 0, y: direction.y >= 0 ? 1 : -1 }
    : null

  /** Directionless fallback: minimum-translation axis, pushed away from the
   *  active center — identical policy to the settle pass. */
  const mtvMotion = (rect: LayoutRect): Motion => {
    const overlapX = Math.min(active.x + active.width, rect.x + rect.width) - Math.max(active.x, rect.x)
    const overlapY = Math.min(active.y + active.height, rect.y + rect.height) - Math.max(active.y, rect.y)
    const center = rectCenter(rect)
    if (overlapX <= overlapY) return { x: center.x >= activeCenter.x ? 1 : -1, y: 0 }
    return { x: 0, y: center.y >= activeCenter.y ? 1 : -1 }
  }

  const offsets: Record<string, Vector2D> = {}
  const overflow = new Set<string>()
  let displacedArea = 0

  const lockedRects: NegotiationRect[] = []
  for (const rect of byId.values()) if (rect.locked) lockedRects.push(rect)
  lockedRects.sort((a, b) => (a.id < b.id ? -1 : 1))

  const positioned = (rect: NegotiationRect): LayoutRect => {
    const offset = offsets[rect.id]
    return offset ? shifted(rect, offset.x, offset.y) : rect
  }

  const queue: PushRequest[] = []
  for (const seed of seeds) {
    queue.push({
      targetId: seed.rect.id,
      pusher: active,
      motion: dominantMotion ?? mtvMotion(seed.rect),
      depth: 1,
    })
  }

  let head = 0
  while (head < queue.length) {
    const request = queue[head++]!
    const target = byId.get(request.targetId)!

    if (target.locked || offsets[target.id] || request.depth > maxChainDepth) {
      overflow.add(target.id)
      continue
    }

    const delta = escapeDelta(request.pusher, target, request.motion, gap)
    if (!delta) continue

    if (displacedArea + rectArea(target) > maxDisplacedArea) {
      overflow.add(target.id)
      continue
    }

    // Walls: a push that would land inside a locked rect deflects on the
    // perpendicular axis, away from the wall. If even the deflected spot
    // is inside a wall, the push is abandoned and the overlap is allowed.
    let moved = shifted(target, delta.x, delta.y)
    let motion: Motion = { x: Math.sign(delta.x) as Motion['x'], y: Math.sign(delta.y) as Motion['y'] }
    const wall = lockedRects.find((locked) => rawOverlap(moved, locked))
    if (wall) {
      const perp: 'x' | 'y' = delta.x !== 0 ? 'y' : 'x'
      const movedCenter = rectCenter(moved)
      const wallCenter = rectCenter(wall)
      const sign: 1 | -1 = movedCenter[perp] < wallCenter[perp] ? -1 : 1
      const clearance =
        perp === 'y'
          ? sign > 0
            ? wall.y + wall.height + gap - moved.y
            : moved.y + moved.height + gap - wall.y
          : sign > 0
            ? wall.x + wall.width + gap - moved.x
            : moved.x + moved.width + gap - wall.x
      const deflect = sign * Math.ceil(Math.max(clearance, 0) / GRID_SIZE) * GRID_SIZE
      moved = perp === 'y' ? shifted(moved, 0, deflect) : shifted(moved, deflect, 0)
      if (lockedRects.some((locked) => rawOverlap(moved, locked))) {
        overflow.add(target.id)
        continue
      }
      motion = {
        x: Math.sign(moved.x - target.x) as Motion['x'],
        y: Math.sign(moved.y - target.y) as Motion['y'],
      }
    }

    offsets[target.id] = { x: moved.x - target.x, y: moved.y - target.y }
    displacedArea += rectArea(target)

    // Cascade only onto rects this move NEWLY overlaps — pre-existing
    // contact is not this gesture's doing and is left for the settle pass.
    const knocked: string[] = []
    for (const other of byId.values()) {
      if (other.id === target.id) continue
      const at = positioned(other)
      if (rawOverlap(moved, at) && !rawOverlap(target, at)) knocked.push(other.id)
    }
    knocked.sort()
    for (const id of knocked) {
      queue.push({ targetId: id, pusher: moved, motion, depth: request.depth + 1 })
    }
  }

  if (Object.keys(offsets).length === 0 && overflow.size === 0) return emptyResult()
  return { offsets, overflowIds: [...overflow].sort() }
}
