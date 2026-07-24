import type { Relation, RelationType, Widget } from '../types/spatial'

export function relationKey(fromId: string, toId: string, type: RelationType): string {
  return `${fromId}\u0000${toId}\u0000${type}`
}

export function appendDraftRelation(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  relationKeys: Set<string>,
  fromId: string,
  toId: string,
  type: RelationType,
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
  return id
}
