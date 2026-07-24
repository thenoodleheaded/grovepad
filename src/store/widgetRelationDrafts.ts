import type { Relation, RelationType, Widget } from '../types/spatial'
import { snapToGrid } from '../types/spatial'
import { minimumHierarchyChildTop } from './widgetCollection'

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
  strictParent = true,
): string | null {
  if (fromId === toId || !widgets[fromId] || !widgets[toId]) return null
  const key = relationKey(fromId, toId, type)
  if (relationKeys.has(key)) return null
  relationKeys.add(key)

  const id = crypto.randomUUID()
  relations[id] = {
    id,
    fromId,
    toId,
    type,
    isResolved: type !== 'blocker' && type !== 'conflict',
  }

  if (type !== 'parent' || !strictParent) return id
  const child = widgets[toId]!
  const minChildY = minimumHierarchyChildTop(fromId, widgets, relations)
  if (minChildY === null || child.position.y >= minChildY) return id
  widgets[toId] = {
    ...child,
    position: { ...child.position, y: snapToGrid(minChildY) },
  }
  settleIds.add(toId)
  return id
}

/** De-overlap clearance between separate nodes when untangling — 2×2 grid cells. */
