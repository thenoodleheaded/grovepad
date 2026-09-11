import type { Relation, Widget, WidgetGlue } from '../types/spatial'

export function buildGlueIndex(glues: Record<string, WidgetGlue>): Record<string, string> {
  const index: Record<string, string> = {}
  for (const [glueId, glue] of Object.entries(glues)) {
    for (const wid of glue.widgetIds) index[wid] = glueId
  }
  return index
}

// ---------------------------------------------------------------------------
// Strict hold — family derivation over parent-type relations.
// Hard parenting is the DEFAULT: drawing a parent line makes that node carry
// its child, and the hold is inherited downward, so a whole tree moves as one
// structure without anyone switching anything on. `metadata.strictHold` is
// therefore an OPT-OUT: the nearest explicit flag at-or-above a node decides
// for it (its own beats an ancestor's), and with no flag anywhere the answer is
// hard. Releasing a node relaxes its whole branch; a descendant can re-hold its
// own. Free-form boards may hold parent cycles, so every traversal is
// visited-set guarded.
// ---------------------------------------------------------------------------

function parentEdges(relations: Record<string, Relation>) {
  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  for (const rel of Object.values(relations)) {
    if (rel.type !== 'parent') continue
    const down = children.get(rel.fromId)
    if (down) down.push(rel.toId)
    else children.set(rel.fromId, [rel.toId])
    const up = parents.get(rel.toId)
    if (up) up.push(rel.fromId)
    else parents.set(rel.toId, [rel.fromId])
  }
  return { children, parents }
}

export interface StrictHoldState {
  /** Does this node carry its parent-linked children when it moves? */
  strict: boolean
  /** The ancestor whose explicit flag decided it, when the node has none of
   * its own — what the menu names so a person can see where the decision was
   * made. Null when the node decided for itself or nobody has decided at all. */
  inheritedFrom: string | null
}

/** How hard this node holds its family, resolved the way the law reads it:
 * hard unless somebody said otherwise. The node's own flag wins; failing that
 * the nearest ancestor with an explicit flag decides (so releasing a node
 * relaxes its whole branch, and a descendant can re-hold its own); failing
 * that, hard. */
export function resolveStrictHold(
  widgetId: string,
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
): StrictHoldState {
  return resolveStrictHoldWith(widgetId, widgets, parentEdges(relations).parents)
}

/** The resolution above, over parent edges the caller already built — the
 * whole-board sweep runs once per drag frame, so it must not rebuild the
 * edge index once per widget. */
function resolveStrictHoldWith(
  widgetId: string,
  widgets: Record<string, Widget>,
  parents: Map<string, string[]>,
): StrictHoldState {
  const own = widgets[widgetId]?.metadata.strictHold
  if (typeof own === 'boolean') return { strict: own, inheritedFrom: null }
  const seen = new Set<string>([widgetId])
  const queue = [...(parents.get(widgetId) ?? [])]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id) || !widgets[id]) continue
    seen.add(id)
    const flag = widgets[id]!.metadata.strictHold
    if (typeof flag === 'boolean') return { strict: flag, inheritedFrom: id }
    queue.push(...(parents.get(id) ?? []))
  }
  return { strict: true, inheritedFrom: null }
}

/** Every widget that carries its family when moved — under hard-by-default,
 * that is every widget nobody released. Also the set of nodes whose parent
 * edges paint strict. */
export function strictCarrierIds(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
): Set<string> {
  const { parents } = parentEdges(relations)
  const carriers = new Set<string>()
  for (const id of Object.keys(widgets)) {
    if (resolveStrictHoldWith(id, widgets, parents).strict) carriers.add(id)
  }
  return carriers
}

/** Everything a move of `baseIds` actually moves: the closure through glue
 * clusters (a cluster is one rigid object) and strict families (a carrier
 * brings its parent-linked descendants), interleaved to a fixpoint — a strict
 * child welded into a cluster pulls that cluster, whose members may carry
 * families of their own. Family expansion never crosses canvases; glue never
 * does by construction. Locked-widget filtering stays with the callers. */
export function expandMovedWidgetIds(
  baseIds: readonly string[],
  state: {
    widgets: Record<string, Widget>
    relations: Record<string, Relation>
    glues: Record<string, WidgetGlue>
    widgetGlueIndex: Record<string, string>
  },
): string[] {
  const { widgets, relations, glues, widgetGlueIndex } = state
  // Resolved per visited node rather than swept whole-board: this runs twice
  // per drag frame and once per id inside align/distribute, while only the
  // handful of ids the traversal reaches is ever asked.
  const { children, parents } = parentEdges(relations)
  const moved: string[] = []
  const seen = new Set<string>()
  const queue = [...baseIds]
  while (queue.length > 0) {
    const id = queue.shift()!
    const widget = widgets[id]
    if (seen.has(id) || !widget) continue
    seen.add(id)
    moved.push(id)
    const glueId = widgetGlueIndex[id]
    if (glueId) queue.push(...(glues[glueId]?.widgetIds ?? []))
    if (resolveStrictHoldWith(id, widgets, parents).strict) {
      for (const childId of children.get(id) ?? []) {
        if (widgets[childId]?.canvasId === widget.canvasId) queue.push(childId)
      }
    }
  }
  return moved
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
