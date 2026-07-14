import type { Vector2D, Widget, WidgetGroup } from '../types/spatial'
import { GRID_SIZE, snapToGrid } from '../types/spatial'
import { DETACH_GAP } from './widgetLayoutConstants'
import { groupBounds } from './widgetCollection'

const UNTANGLE_GAP = GRID_SIZE * 2

interface ClusterRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Split a required separation into two grid-cell-exact shares that sum to
 * exactly `totalPixels`. Both `rects` and `UNTANGLE_GAP` are always integer
 * multiples of `GRID_SIZE`, so `totalPixels` is too — but naively halving it
 * in continuous space (`totalPixels / 2`) is only itself grid-exact when the
 * cell count is even. Splitting in whole cells first (favoring the far side
 * by one extra cell when the count is odd) keeps every individual push
 * grid-aligned, so the sum can never drift from the exact target the way an
 * independent per-side rounding pass would.
 */
export function splitGridCells(totalPixels: number): [number, number] {
  const cells = Math.round(totalPixels / GRID_SIZE)
  const near = Math.floor(cells / 2) * GRID_SIZE
  return [near, totalPixels - near]
}

/**
 * Spread every node on a canvas apart until nothing overlaps, leaving
 * EXACTLY UNTANGLE_GAP (2×2 cells) of clearance between separate nodes —
 * without disturbing arrangements that are already clean.
 *
 * A group untangles AS A UNIT: its members form one rigid cluster (bounding
 * box of the members) that translates together, so their internal layout is
 * preserved and only whole groups are pushed off each other. Every ungrouped
 * widget is its own single-member cluster. Clusters are separated by
 * iterative symmetric relaxation; every push is computed in whole grid cells
 * (`splitGridCells`) so the resulting gap between any two clusters that were
 * touching is exactly UNTANGLE_GAP, never a pixel more or less.
 */
/** Exported for direct unit testing of the exact-gap guarantee — not part of the store's public action surface. */
export function untangleCanvasLayout(
  widgets: Record<string, Widget>,
  groups: Record<string, WidgetGroup>,
  canvasId: string,
): Record<string, Widget> {
  const onCanvas = (id: string) => widgets[id] && widgets[id]!.canvasId === canvasId

  const clusterMembers: string[][] = []
  const assigned = new Set<string>()
  for (const group of Object.values(groups)) {
    const members = group.widgetIds.filter(onCanvas)
    if (members.length === 0) continue
    clusterMembers.push(members)
    for (const id of members) assigned.add(id)
  }
  for (const id of Object.keys(widgets)) {
    if (!onCanvas(id) || assigned.has(id)) continue
    clusterMembers.push([id])
  }

  const n = clusterMembers.length
  if (n < 2) return widgets

  const rects: ClusterRect[] = clusterMembers.map((members) => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of members) {
      const w = widgets[id]!
      minX = Math.min(minX, w.position.x)
      minY = Math.min(minY, w.position.y)
      maxX = Math.max(maxX, w.position.x + w.size.width)
      maxY = Math.max(maxY, w.position.y + w.size.height)
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  })
  const originX = rects.map((r) => r.x)
  const originY = rects.map((r) => r.y)

  const gap = UNTANGLE_GAP
  const overlaps = (a: ClusterRect, b: ClusterRect) =>
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y

  // Iterative symmetric relaxation: each pass shoves every overlapping pair
  // apart along its shallower axis, splitting the push in whole grid cells so
  // both clusters move roughly equally (keeps the board centered instead of
  // drifting one way) while the combined push remains exactly the required
  // separation — never approximated by rounding. Resolving one pair can nudge
  // another into overlap, so passes repeat until a full sweep finds nothing
  // left touching — or the cap trips on a pathological board.
  const maxPasses = 80
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      const a = rects[i]!
      for (let j = i + 1; j < n; j++) {
        const b = rects[j]!
        if (!overlaps(a, b)) continue
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + gap
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + gap
        if (overlapX <= overlapY) {
          // b to the right of a → b moves +, a moves − (deterministic on tie).
          const dir = b.x + b.width / 2 >= a.x + a.width / 2 ? 1 : -1
          const [pushA, pushB] = splitGridCells(overlapX)
          a.x -= dir * pushA
          b.x += dir * pushB
        } else {
          const dir = b.y + b.height / 2 >= a.y + a.height / 2 ? 1 : -1
          const [pushA, pushB] = splitGridCells(overlapY)
          a.y -= dir * pushA
          b.y += dir * pushB
        }
        moved = true
      }
    }
    if (!moved) break
  }

  let changed = false
  const next: Record<string, Widget> = { ...widgets }
  for (let ci = 0; ci < n; ci++) {
    // Every push above was already an exact multiple of GRID_SIZE, so this
    // total is too — snapToGrid here is a defensive no-op, not a rounding step.
    const dx = snapToGrid(rects[ci]!.x - originX[ci]!)
    const dy = snapToGrid(rects[ci]!.y - originY[ci]!)
    if (dx === 0 && dy === 0) continue
    for (const id of clusterMembers[ci]!) {
      const w = widgets[id]!
      next[id] = { ...w, position: { x: w.position.x + dx, y: w.position.y + dy } }
      changed = true
    }
  }
  return changed ? next : widgets
}

export function detachPosition(
  widgets: Record<string, Widget>,
  groupWidgetIds: string[],
  widgetId: string,
): Vector2D | null {
  const widget = widgets[widgetId]
  const bounds = groupBounds(
    widgets,
    groupWidgetIds.filter((id) => id !== widgetId),
  )
  if (!widget || !bounds) return null

  const widgetCenter = {
    x: widget.position.x + widget.size.width / 2,
    y: widget.position.y + widget.size.height / 2,
  }
  const horizontal = Math.abs(widgetCenter.x - bounds.center.x) >= Math.abs(widgetCenter.y - bounds.center.y)
  if (horizontal) {
    const toRight = widgetCenter.x >= bounds.center.x
    return {
      x: snapToGrid(toRight ? bounds.x + bounds.width + DETACH_GAP : bounds.x - widget.size.width - DETACH_GAP),
      y: snapToGrid(Math.min(Math.max(widget.position.y, bounds.y), bounds.y + bounds.height)),
    }
  }

  const below = widgetCenter.y >= bounds.center.y
  return {
    x: snapToGrid(Math.min(Math.max(widget.position.x, bounds.x), bounds.x + bounds.width)),
    y: snapToGrid(below ? bounds.y + bounds.height + DETACH_GAP : bounds.y - widget.size.height - DETACH_GAP),
  }
}
