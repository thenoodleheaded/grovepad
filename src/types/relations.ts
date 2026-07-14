export type RelationType = 'parent' | 'co-parent' | 'cousin' | 'blocker' | 'conflict'

export const RELATION_LABELS: Record<RelationType, string> = {
  parent: 'Parent',
  'co-parent': 'Co-parent',
  cousin: 'Cousin',
  blocker: 'Dependency',
  conflict: 'Conflict',
}

export interface Relation {
  id: string
  fromId: string
  toId: string
  type: RelationType
  isResolved: boolean
}
