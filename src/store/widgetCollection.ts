import type { Relation, Vector2D, Widget } from '../types/spatial'
import { snapToGrid } from '../types/spatial'
import { GROUP_CLUSTER_GAP, LAYOUT_GAP, MIN_PARENT_CHILD_GAP } from './widgetLayoutConstants'

export interface LayoutRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export function withWidget(
  widgets: Record<string, Widget>,
  id: string,
  patch: (w: Widget) => Widget,
): Record<string, Widget> {
  const w = widgets[id]
  if (!w) return widgets
  return { ...widgets, [id]: patch(w) }
}

export function uniqueExistingIds(ids: Iterable<string>, widgets: Record<string, Widget>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (seen.has(id) || !widgets[id]) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export function rectsOverlap(a: LayoutRect, b: LayoutRect, gap = LAYOUT_GAP): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  )
}

export function rectCenter(rect: LayoutRect): Vector2D {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function groupBounds(widgets: Record<string, Widget>, ids: string[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of ids) {
    const w = widgets[id]
    if (!w) continue
    minX = Math.min(minX, w.position.x)
    minY = Math.min(minY, w.position.y)
    maxX = Math.max(maxX, w.position.x + w.size.width)
    maxY = Math.max(maxY, w.position.y + w.size.height)
  }
  if (!isFinite(minX)) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  }
}

export function movedIdsForWidget(
  id: string,
  selectedIds: ReadonlySet<string>,
  widgets: Record<string, Widget>,
): string[] {
  if (selectedIds.has(id) && selectedIds.size > 1) {
    return uniqueExistingIds(selectedIds, widgets)
  }
  return widgets[id] ? [id] : []
}

interface ParentIndex {
  parentsOf: Map<string, string[]>
  childrenOf: Map<string, string[]>
}

let parentIndexCache: { relations: Record<string, Relation>; index: ParentIndex } | null = null

/**
 * widgetId → parent/child ids for 'parent' relations, cached by relations
 * identity. Keeps drag-constraint clamping O(degree) per moved widget instead
 * of O(all relations) — relations only change on explicit link edits.
 */
function getParentIndex(relations: Record<string, Relation>): ParentIndex {
  if (parentIndexCache && parentIndexCache.relations === relations) {
    return parentIndexCache.index
  }
  const parentsOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  for (const rel of Object.values(relations)) {
    if (rel.type !== 'parent') continue
    const parents = parentsOf.get(rel.toId)
    if (parents) parents.push(rel.fromId)
    else parentsOf.set(rel.toId, [rel.fromId])
    const children = childrenOf.get(rel.fromId)
    if (children) children.push(rel.toId)
    else childrenOf.set(rel.fromId, [rel.toId])
  }
  const index = { parentsOf, childrenOf }
  parentIndexCache = { relations, index }
  return index
}

export function applyWidgetDelta(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  ids: string[],
  delta: Vector2D,
): Record<string, Widget> {
  if (delta.x === 0 && delta.y === 0) return widgets
  const movingIds = uniqueExistingIds(ids, widgets)
  if (movingIds.length === 0) return widgets

  const positions: Record<string, Vector2D> = {}
  for (const id of movingIds) {
    const widget = widgets[id]!
    positions[id] = {
      x: widget.position.x + delta.x,
      y: widget.position.y + delta.y,
    }
  }

  const { parentsOf, childrenOf } = getParentIndex(relations)
  for (const id of movingIds) {
    const pos = positions[id]!
    const ownHeight = widgets[id]!.size.height
    const parents = parentsOf.get(id)
    if (parents) {
      for (const parentId of parents) {
        const parentWidget = widgets[parentId]
        if (!parentWidget) continue
        const parentPosition = positions[parentId] ?? parentWidget.position
        // Keep at least MIN_PARENT_CHILD_GAP clear below the parent's
        // bottom edge, not just below its top-left corner.
        pos.y = Math.max(
          pos.y,
          parentPosition.y + parentWidget.size.height + MIN_PARENT_CHILD_GAP,
        )
      }
    }
    const children = childrenOf.get(id)
    if (children) {
      for (const childId of children) {
        const childPosition = positions[childId] ?? widgets[childId]?.position
        if (childPosition) {
          pos.y = Math.min(pos.y, childPosition.y - ownHeight - MIN_PARENT_CHILD_GAP)
        }
      }
    }
  }

  const next = { ...widgets }
  for (const id of movingIds) {
    next[id] = { ...widgets[id]!, position: positions[id]! }
  }
  return next
}

export function applyWidgetPositions(
  widgets: Record<string, Widget>,
  positions: Record<string, Vector2D>,
): Record<string, Widget> {
  const ids = uniqueExistingIds(Object.keys(positions), widgets)
  if (ids.length === 0) return widgets
  let next: Record<string, Widget> | null = null
  for (const id of ids) {
    const widget = widgets[id]!
    const position = positions[id]!
    if (widget.position.x === position.x && widget.position.y === position.y) continue
    next ??= { ...widgets }
    next[id] = { ...widget, position }
  }
  return next ?? widgets
}

export function compactGroupPositions(
  widgets: Record<string, Widget>,
  ids: string[],
): Record<string, Vector2D> {
  const groupIds = uniqueExistingIds(ids, widgets).sort((a, b) => {
    const aw = widgets[a]!
    const bw = widgets[b]!
    return aw.position.y - bw.position.y || aw.position.x - bw.position.x
  })
  if (groupIds.length < 2) return {}

  const bounds = groupBounds(widgets, groupIds)
  if (!bounds) return {}

  const columns = Math.ceil(Math.sqrt(groupIds.length))
  const rows: string[][] = []
  for (let i = 0; i < groupIds.length; i += columns) {
    rows.push(groupIds.slice(i, i + columns))
  }

  const rowMetrics = rows.map((row) => {
    const width =
      row.reduce((total, id) => total + widgets[id]!.size.width, 0) +
      Math.max(0, row.length - 1) * GROUP_CLUSTER_GAP
    const height = Math.max(...row.map((id) => widgets[id]!.size.height))
    return { width, height }
  })

  const clusterWidth = Math.max(...rowMetrics.map((row) => row.width))
  const clusterHeight =
    rowMetrics.reduce((total, row) => total + row.height, 0) +
    Math.max(0, rowMetrics.length - 1) * GROUP_CLUSTER_GAP

  let y = bounds.center.y - clusterHeight / 2
  const positions: Record<string, Vector2D> = {}
  rows.forEach((row, rowIndex) => {
    const metrics = rowMetrics[rowIndex]!
    let x = bounds.center.x - clusterWidth / 2 + (clusterWidth - metrics.width) / 2
    for (const id of row) {
      const widget = widgets[id]!
      positions[id] = {
        x: snapToGrid(x),
        y: snapToGrid(y + (metrics.height - widget.size.height) / 2),
      }
      x += widget.size.width + GROUP_CLUSTER_GAP
    }
    y += metrics.height + GROUP_CLUSTER_GAP
  })

  return positions
}
