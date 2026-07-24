import type { Relation, Vector2D, Widget } from '../types/spatial'
import { LAYOUT_GAP, MIN_PARENT_CHILD_GAP } from './widgetLayoutConstants'

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

/** The generation row that guards a child: its direct parent plus every
 * sibling of that parent (widgets sharing one of the parent's own parents). */
export function hierarchyGuardiansForChild(
  childId: string,
  relations: Record<string, Relation>,
): string[] {
  const { parentsOf, childrenOf } = getParentIndex(relations)
  const guardians = new Set<string>()
  for (const parentId of parentsOf.get(childId) ?? []) {
    guardians.add(parentId)
    for (const grandparentId of parentsOf.get(parentId) ?? []) {
      for (const siblingId of childrenOf.get(grandparentId) ?? []) guardians.add(siblingId)
    }
  }
  guardians.delete(childId)
  return [...guardians]
}

/** Every child whose hierarchy boundary includes `guardianId`. A node guards
 * its own children and the children of every sibling in its generation row. */
export function hierarchyChildrenGuardedBy(
  guardianId: string,
  relations: Record<string, Relation>,
): string[] {
  const { parentsOf, childrenOf } = getParentIndex(relations)
  const row = new Set<string>([guardianId])
  for (const parentId of parentsOf.get(guardianId) ?? []) {
    for (const siblingId of childrenOf.get(parentId) ?? []) row.add(siblingId)
  }
  const children = new Set<string>()
  for (const rowId of row) {
    for (const childId of childrenOf.get(rowId) ?? []) {
      if (!row.has(childId)) children.add(childId)
    }
  }
  return [...children]
}

export function minimumHierarchyChildTop(
  parentId: string,
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
): number | null {
  const { parentsOf, childrenOf } = getParentIndex(relations)
  const row = new Set<string>([parentId])
  for (const grandparentId of parentsOf.get(parentId) ?? []) {
    for (const siblingId of childrenOf.get(grandparentId) ?? []) row.add(siblingId)
  }
  let bottom = -Infinity
  for (const id of row) {
    const widget = widgets[id]
    if (widget) bottom = Math.max(bottom, widget.position.y + widget.size.height)
  }
  return Number.isFinite(bottom) ? bottom + MIN_PARENT_CHILD_GAP : null
}

export function applyWidgetDelta(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  ids: string[],
  delta: Vector2D,
  enforceParentConstraints = true,
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

  if (enforceParentConstraints) {
    for (const id of movingIds) {
      const pos = positions[id]!
      const ownHeight = widgets[id]!.size.height
      for (const guardianId of hierarchyGuardiansForChild(id, relations)) {
        const guardian = widgets[guardianId]
        if (!guardian) continue
        const guardianPosition = positions[guardianId] ?? guardian.position
        pos.y = Math.max(
          pos.y,
          guardianPosition.y + guardian.size.height + MIN_PARENT_CHILD_GAP,
        )
      }
      for (const childId of hierarchyChildrenGuardedBy(id, relations)) {
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
