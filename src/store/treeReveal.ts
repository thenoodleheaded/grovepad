import { createOwnedTimeout } from '../utils/ownedTimeout'

export interface TreeRevealNode {
  widgetIds: readonly string[]
  groupId?: string
  relationId?: string
}

export interface TreeRevealSchedule {
  widgetDelays: ReadonlyMap<string, number>
  groupDelays: ReadonlyMap<string, number>
  relationDelays: ReadonlyMap<string, number>
  totalMs: number
}

const MAX_CHOREOGRAPHY_MS = 5_200

/**
 * Reveals a tree in reading order: branch flows first, its widgets bloom one
 * by one, then the shared group plate folds around that node's bundle.
 */
export function buildTreeRevealSchedule(nodes: readonly TreeRevealNode[]): TreeRevealSchedule {
  const widgetDelays = new Map<string, number>()
  const groupDelays = new Map<string, number>()
  const relationDelays = new Map<string, number>()
  let cursor = 80

  for (const node of nodes) {
    if (node.relationId) {
      relationDelays.set(node.relationId, cursor)
      cursor += 620
    }
    for (const widgetId of node.widgetIds) {
      widgetDelays.set(widgetId, cursor)
      cursor += 220
    }
    if (node.groupId) {
      groupDelays.set(node.groupId, cursor + 40)
      cursor += 320
    }
    cursor += 80
  }

  const scale = cursor > MAX_CHOREOGRAPHY_MS ? MAX_CHOREOGRAPHY_MS / cursor : 1
  const scaleMap = (source: Map<string, number>) =>
    new Map([...source].map(([id, delay]) => [id, Math.round(delay * scale)]))
  return {
    widgetDelays: scaleMap(widgetDelays),
    groupDelays: scaleMap(groupDelays),
    relationDelays: scaleMap(relationDelays),
    totalMs: Math.round(cursor * scale),
  }
}

type RevealKind = 'widget' | 'group' | 'relation'

const liveDelays: Record<RevealKind, Map<string, number>> = {
  widget: new Map(),
  group: new Map(),
  relation: new Map(),
}
const cleanup = createOwnedTimeout()

export function registerTreeReveal(schedule: TreeRevealSchedule): void {
  for (const [id, delay] of schedule.widgetDelays) liveDelays.widget.set(id, delay)
  for (const [id, delay] of schedule.groupDelays) liveDelays.group.set(id, delay)
  for (const [id, delay] of schedule.relationDelays) liveDelays.relation.set(id, delay)
  cleanup.schedule(() => {
    liveDelays.widget.clear()
    liveDelays.group.clear()
    liveDelays.relation.clear()
  }, schedule.totalMs + 1_600)
}

export function treeRevealDelay(kind: RevealKind, id: string): number | null {
  return liveDelays[kind].get(id) ?? null
}
