import type { Relation, RelationType, Widget } from '../types/spatial'
import { snapToGrid } from '../types/spatial'
import { MIN_PARENT_CHILD_GAP } from './widgetLayoutConstants'

export function relationKey(fromId: string, toId: string, type: RelationType): string {
  return `${fromId}\u0000${toId}\u0000${type}`
}

export function appendDraftRelation(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  relationKeys: Set<string>,
  settleIds: Set<string>,
  fromId: string,
  toId: string,
  type: RelationType,
): void {
  if (fromId === toId || !widgets[fromId] || !widgets[toId]) return
  const key = relationKey(fromId, toId, type)
  if (relationKeys.has(key)) return
  relationKeys.add(key)

  const id = crypto.randomUUID()
  relations[id] = {
    id,
    fromId,
    toId,
    type,
    isResolved: type !== 'blocker' && type !== 'conflict',
  }

  if (type !== 'parent') return
  const parent = widgets[fromId]!
  const child = widgets[toId]!
  const minChildY = parent.position.y + parent.size.height + MIN_PARENT_CHILD_GAP
  if (child.position.y >= minChildY) return
  widgets[toId] = {
    ...child,
    position: { ...child.position, y: snapToGrid(minChildY) },
  }
  settleIds.add(toId)
}

/** De-overlap clearance between separate nodes when untangling — 2×2 grid cells. */

