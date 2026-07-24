import type { Vector2D, Widget } from '../types/spatial'
import { GRID_SIZE, snapToGrid } from '../types/spatial'
import { restingFootprintWidget } from '../utils/widgetRest'
import { LAYOUT_GAP, SETTLE_ITERATION_LIMIT } from './widgetLayoutConstants'
import { rectCenter, rectsOverlap, uniqueExistingIds, type LayoutRect } from './widgetCollection'

/** Uniform-grid cell size for the settle pass's spatial hash. */
const SETTLE_CELL = 640

interface CellRange {
  minCX: number
  minCY: number
  maxCX: number
  maxCY: number
}

function sameCellRange(a: CellRange, b: CellRange): boolean {
  return a.minCX === b.minCX && a.minCY === b.minCY && a.maxCX === b.maxCX && a.maxCY === b.maxCY
}

/** Glue index read at call time — settle helpers are module functions, so
 *  callers inside a set() that also rewrites glue clusters must pass the
 *  fresh index explicitly instead of relying on this fallback. */
let glueIndexProvider: () => Record<string, string> = () => ({})

export function setGlueIndexProvider(provider: () => Record<string, string>): void {
  glueIndexProvider = provider
}

function liveGlueIndex(): Record<string, string> {
  return glueIndexProvider()
}

/**
 * Push overlapping neighbors apart until the layout is collision-free.
 * Collision is resolved at CLUSTER granularity: a glue cluster moves as one
 * rigid unit, and members of the same cluster never collide with each
 * other — so the 0.3-cell weld seams survive every settle. Unglued widgets
 * are singleton clusters; their behavior is unchanged. Two clusters dragged
 * into each other therefore displace like two widgets do, instead of one
 * tearing the other apart member by member.
 */
export function settleWidgetLayout(
  widgets: Record<string, Widget>,
  activeIds: string[],
  glueIndexOverride?: Record<string, string>,
): Record<string, Widget> {
  const requested = uniqueExistingIds(activeIds, widgets)
  if (requested.length === 0) return widgets
  const glueIndex = glueIndexOverride ?? liveGlueIndex()
  // Overlap resolution is per-canvas: widgets on other canvases share world
  // coordinates but never collide visually, so they must not be pushed.
  const canvasId = widgets[requested[0]!]!.canvasId
  const allIds = Object.keys(widgets).filter((id) => widgets[id]!.canvasId === canvasId)

  const clusterOf = (id: string): string => {
    const gid = glueIndex[id]
    return gid ? `g:${gid}` : `w:${id}`
  }
  const memberIds = new Map<string, string[]>()
  for (const id of allIds) {
    const key = clusterOf(id)
    const list = memberIds.get(key)
    if (list) list.push(id)
    else memberIds.set(key, [id])
  }

  const queue: string[] = []
  const queued = new Set<string>()
  for (const id of requested) {
    if (widgets[id]!.canvasId !== canvasId) continue
    const key = clusterOf(id)
    if (queued.has(key)) continue
    queued.add(key)
    queue.push(key)
  }
  if (queue.length === 0) return widgets

  const positions: Record<string, Vector2D> = {}
  // A multi-member glue cluster snaps RIGIDLY: one delta (from its top-left
  // corner to the grid) applied to every member, so the 0.3-cell weld seams
  // inside the cluster survive the snap exactly. Snapping each member on its
  // own would round every 12px seam to 0 or a full cell.
  const rigidSnapDelta = new Map<string, Vector2D>()
  for (const [key, ids] of memberIds) {
    if (!queued.has(key) || !key.startsWith('g:') || ids.length < 2) continue
    let minX = Infinity
    let minY = Infinity
    for (const id of ids) {
      minX = Math.min(minX, widgets[id]!.position.x)
      minY = Math.min(minY, widgets[id]!.position.y)
    }
    rigidSnapDelta.set(key, { x: snapToGrid(minX) - minX, y: snapToGrid(minY) - minY })
  }
  for (const id of allIds) {
    const widget = widgets[id]!
    const key = clusterOf(id)
    const rigid = rigidSnapDelta.get(key)
    // An icon's own edge is continuous (no detents, any 80-120 square), so
    // its position already routinely sits off the 40px grid after a corner
    // drag — forcing it back onto the grid here would re-round the sub-cell
    // placement the drag chose for it.
    positions[id] = rigid
      ? { x: widget.position.x + rigid.x, y: widget.position.y + rigid.y }
      : queued.has(key) && !widget.iconified
        ? { x: snapToGrid(widget.position.x), y: snapToGrid(widget.position.y) }
        : widget.position
  }

  const rectFor = (key: string): LayoutRect => {
    const ids = memberIds.get(key)!
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of ids) {
      const widget = widgets[id]!
      const pos = positions[id]!
      // Resting cards occupy their compact, content-derived tile on the
      // board. Settling against the dormant full-card size can still leave
      // those visible tiles intersecting because the two size systems choose
      // different cheapest escape axes. Use the same idle footprint that
      // glue geometry and rendering use so creation cannot produce a board
      // that already needs Untangle.
      const footprint = restingFootprintWidget(widget)
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + footprint.size.width)
      maxY = Math.max(maxY, pos.y + footprint.size.height)
    }
    return {
      id: key,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }

  const cells = new Map<string, Set<string>>()
  const ranges = new Map<string, CellRange>()

  const rangeFor = (key: string): CellRange => {
    const rect = rectFor(key)
    return {
      minCX: Math.floor((rect.x - LAYOUT_GAP) / SETTLE_CELL),
      minCY: Math.floor((rect.y - LAYOUT_GAP) / SETTLE_CELL),
      maxCX: Math.floor((rect.x + rect.width + LAYOUT_GAP) / SETTLE_CELL),
      maxCY: Math.floor((rect.y + rect.height + LAYOUT_GAP) / SETTLE_CELL),
    }
  }

  const addToCells = (key: string, range: CellRange) => {
    for (let cy = range.minCY; cy <= range.maxCY; cy++) {
      for (let cx = range.minCX; cx <= range.maxCX; cx++) {
        const cellKey = `${cx}:${cy}`
        const bucket = cells.get(cellKey)
        if (bucket) bucket.add(key)
        else cells.set(cellKey, new Set([key]))
      }
    }
    ranges.set(key, range)
  }

  const reindex = (key: string) => {
    const previous = ranges.get(key)!
    const next = rangeFor(key)
    if (sameCellRange(previous, next)) return
    for (let cy = previous.minCY; cy <= previous.maxCY; cy++) {
      for (let cx = previous.minCX; cx <= previous.maxCX; cx++) {
        cells.get(`${cx}:${cy}`)?.delete(key)
      }
    }
    addToCells(key, next)
  }

  for (const key of memberIds.keys()) addToCells(key, rangeFor(key))

  /** Rigid move: every member shifts by the same grid-aligned delta, so a
   *  displaced glue cluster keeps its exact internal arrangement. */
  const displace = (key: string, dx: number, dy: number) => {
    for (const id of memberIds.get(key)!) {
      const pos = positions[id]!
      positions[id] = { x: pos.x + dx, y: pos.y + dy }
    }
    reindex(key)
  }

  let cursor = 0
  let iterations = 0

  while (cursor < queue.length && iterations < SETTLE_ITERATION_LIMIT) {
    const activeKey = queue[cursor++]!
    // `queued` means "still scheduled", not "has ever been visited". A
    // cluster can be displaced after its earlier pass by another neighbor;
    // allowing it back onto the queue is what makes the final layout stable
    // instead of leaving the last push overlapping a card we already checked.
    queued.delete(activeKey)
    reindex(activeKey)
    const activeRect = rectFor(activeKey)
    const activeCenter = rectCenter(activeRect)
    const activeRange = ranges.get(activeKey)!

    const candidates = new Set<string>()
    for (let cy = activeRange.minCY; cy <= activeRange.maxCY; cy++) {
      for (let cx = activeRange.minCX; cx <= activeRange.maxCX; cx++) {
        const bucket = cells.get(`${cx}:${cy}`)
        if (!bucket) continue
        for (const key of bucket) candidates.add(key)
      }
    }

    for (const otherKey of candidates) {
      if (otherKey === activeKey) continue
      const otherRect = rectFor(otherKey)
      if (!rectsOverlap(activeRect, otherRect)) continue

      const otherCenter = rectCenter(otherRect)
      const overlapX =
        Math.min(activeRect.x + activeRect.width, otherRect.x + otherRect.width) -
        Math.max(activeRect.x, otherRect.x) +
        LAYOUT_GAP
      const overlapY =
        Math.min(activeRect.y + activeRect.height, otherRect.y + otherRect.height) -
        Math.max(activeRect.y, otherRect.y) +
        LAYOUT_GAP

      // Grid-quantized shift keeps every displaced widget snapped without
      // rounding a small overlap down to a zero-pixel (infinite-loop) push.
      if (overlapX <= overlapY) {
        const direction = otherCenter.x >= activeCenter.x ? 1 : -1
        displace(otherKey, direction * Math.ceil(overlapX / GRID_SIZE) * GRID_SIZE, 0)
      } else {
        const direction = otherCenter.y >= activeCenter.y ? 1 : -1
        displace(otherKey, 0, direction * Math.ceil(overlapY / GRID_SIZE) * GRID_SIZE)
      }

      if (!queued.has(otherKey)) {
        queued.add(otherKey)
        queue.push(otherKey)
      }
    }
    iterations++
  }

  let changed = false
  // Preserve widgets that live on every other canvas. Building `next` only
  // from `allIds` silently erased sibling canvases whenever a collision was
  // resolved on the active one.
  const next: Record<string, Widget> = { ...widgets }
  for (const id of allIds) {
    const widget = widgets[id]!
    const pos = positions[id]!
    if (pos.x === widget.position.x && pos.y === widget.position.y) {
      next[id] = widget
    } else {
      next[id] = { ...widget, position: pos }
      changed = true
    }
  }
  return changed ? next : widgets
}

export function settleWidgetsByCanvas(
  widgets: Record<string, Widget>,
  activeIds: Iterable<string>,
  glueIndexOverride?: Record<string, string>,
): Record<string, Widget> {
  const idsByCanvas = new Map<string, string[]>()
  for (const id of activeIds) {
    const canvasId = widgets[id]?.canvasId
    if (!canvasId) continue
    const ids = idsByCanvas.get(canvasId)
    if (ids) ids.push(id)
    else idsByCanvas.set(canvasId, [id])
  }

  let next = widgets
  for (const ids of idsByCanvas.values()) next = settleWidgetLayout(next, ids, glueIndexOverride)
  return next
}
