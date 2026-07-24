import { createOwnedTimeout } from '../utils/ownedTimeout'

export interface TreeRevealNode {
  widgetIds: readonly string[]
  relationId?: string
}

export interface TreeRevealSchedule {
  widgetDelays: ReadonlyMap<string, number>
  relationDelays: ReadonlyMap<string, number>
  totalMs: number
}

const MAX_CHOREOGRAPHY_MS = 3_600

/**
 * Reveals a tree in reading order: a branch starts flowing, and its widgets
 * begin blooming while the flow is still travelling — each icon launches its
 * own entrance a beat after the one before, so a node reads as a quick
 * cascade instead of a queue that waits for every animation to finish.
 */
export function buildTreeRevealSchedule(nodes: readonly TreeRevealNode[]): TreeRevealSchedule {
  const widgetDelays = new Map<string, number>()
  const relationDelays = new Map<string, number>()
  let cursor = 40

  for (const node of nodes) {
    if (node.relationId) {
      relationDelays.set(node.relationId, cursor)
      cursor += 220
    }
    for (const widgetId of node.widgetIds) {
      widgetDelays.set(widgetId, cursor)
      cursor += 70
    }
    cursor += 40
  }

  const scale = cursor > MAX_CHOREOGRAPHY_MS ? MAX_CHOREOGRAPHY_MS / cursor : 1
  const scaleMap = (source: Map<string, number>) =>
    new Map([...source].map(([id, delay]) => [id, Math.round(delay * scale)]))
  return {
    widgetDelays: scaleMap(widgetDelays),
    relationDelays: scaleMap(relationDelays),
    totalMs: Math.round(cursor * scale),
  }
}

type RevealKind = 'widget' | 'relation'

const liveDelays: Record<RevealKind, Map<string, number>> = {
  widget: new Map(),
  relation: new Map(),
}
const cleanup = createOwnedTimeout()

export function registerTreeReveal(schedule: TreeRevealSchedule): void {
  for (const [id, delay] of schedule.widgetDelays) liveDelays.widget.set(id, delay)
  for (const [id, delay] of schedule.relationDelays) liveDelays.relation.set(id, delay)
  cleanup.schedule(() => {
    liveDelays.widget.clear()
    liveDelays.relation.clear()
  }, schedule.totalMs + 1_600)
}

export function treeRevealDelay(kind: RevealKind, id: string): number | null {
  return liveDelays[kind].get(id) ?? null
}
