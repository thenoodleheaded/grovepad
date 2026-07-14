import type { GroupColor, Relation, Widget, WidgetGroup } from '../types/spatial'
import { GROUP_COLORS } from '../types/spatial'

export function buildGroupIndex(groups: Record<string, WidgetGroup>): Record<string, string> {
  const index: Record<string, string> = {}
  for (const [groupId, g] of Object.entries(groups)) {
    for (const wid of g.widgetIds) index[wid] = groupId
  }
  return index
}

let groupColorIndex = 0
export function nextGroupColor(): GroupColor {
  const color = GROUP_COLORS[groupColorIndex % GROUP_COLORS.length] ?? GROUP_COLORS[0]
  groupColorIndex++
  return color
}

export function computeBlockedWidgetIds(relations: Record<string, Relation>): Set<string> {
  const blocked = new Set<string>()
  for (const rel of Object.values(relations)) {
    if (rel.type === 'blocker' && !rel.isResolved) blocked.add(rel.toId)
  }
  return blocked
}

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

export interface CriticalPath {
  widgetIds: string[]
  relationIds: string[]
}

interface CriticalPathCache {
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  result: CriticalPath
}

let criticalPathCache: CriticalPathCache | null = null

export function getCriticalPath(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
): CriticalPath {
  if (
    criticalPathCache &&
    criticalPathCache.widgets === widgets &&
    criticalPathCache.relations === relations
  ) {
    return criticalPathCache.result
  }

  const outgoing = new Map<string, Relation[]>()
  for (const rel of Object.values(relations)) {
    if (rel.type !== 'blocker' || rel.isResolved) continue
    if (!widgets[rel.fromId] || !widgets[rel.toId]) continue
    const list = outgoing.get(rel.fromId)
    if (list) list.push(rel)
    else outgoing.set(rel.fromId, [rel])
  }

  const memo = new Map<string, CriticalPath>()
  const inStack = new Set<string>()

  const longestFrom = (widgetId: string): CriticalPath => {
    const cached = memo.get(widgetId)
    if (cached) return cached
    if (inStack.has(widgetId)) return { widgetIds: [widgetId], relationIds: [] }
    inStack.add(widgetId)
    let best: CriticalPath = { widgetIds: [widgetId], relationIds: [] }
    for (const rel of outgoing.get(widgetId) ?? []) {
      const tail = longestFrom(rel.toId)
      if (tail.relationIds.length + 1 > best.relationIds.length) {
        best = {
          widgetIds: [widgetId, ...tail.widgetIds],
          relationIds: [rel.id, ...tail.relationIds],
        }
      }
    }
    inStack.delete(widgetId)
    memo.set(widgetId, best)
    return best
  }

  let best: CriticalPath = { widgetIds: [], relationIds: [] }
  for (const startId of outgoing.keys()) {
    const chain = longestFrom(startId)
    if (chain.relationIds.length > best.relationIds.length) best = chain
  }

  criticalPathCache = { widgets, relations, result: best }
  return best
}

// ---------------------------------------------------------------------------
// Undo history — reference snapshots of the four structural records.
// Snapshots share unchanged objects with live state, so each entry costs a
// handful of pointers, not a deep copy.
// ---------------------------------------------------------------------------
