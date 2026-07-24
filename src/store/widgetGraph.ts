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
// Soft parenting is the default: a relation alone never moves anyone. A node
// whose metadata carries `strictHold` moves its whole parent-linked subtree
// with it, and strictness is inherited downward — every node inside a held
// subtree carries its own branch, so a strict tree has no soft pockets.
// Free-form boards may hold parent cycles, so every traversal is
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

/** The nearest ancestor (through parent-type relations) holding this widget
 * strictly, or null when the widget is free. The widget's own flag does not
 * count — this answers "is the strict decision owned above me?", which is what
 * decides whether the widget may offer its own toggle. */
export function strictHolderOf(
  widgetId: string,
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
): string | null {
  const { parents } = parentEdges(relations)
  const seen = new Set<string>([widgetId])
  const queue = [...(parents.get(widgetId) ?? [])]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id) || !widgets[id]) continue
    seen.add(id)
    if (widgets[id]!.metadata.strictHold === true) return id
    queue.push(...(parents.get(id) ?? []))
  }
  return null
}

/** Every widget that carries its family when moved: each strict holder plus
 * all of its parent-linked descendants (inheritance — no soft pockets inside
 * a strict tree). Also the set of nodes whose parent edges paint strict. */
export function strictCarrierIds(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
): Set<string> {
  const { children } = parentEdges(relations)
  const carriers = new Set<string>()
  const queue: string[] = []
  for (const widget of Object.values(widgets)) {
    if (widget.metadata.strictHold === true) queue.push(widget.id)
  }
  while (queue.length > 0) {
    const id = queue.shift()!
    if (carriers.has(id) || !widgets[id]) continue
    carriers.add(id)
    queue.push(...(children.get(id) ?? []))
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
  const carriers = strictCarrierIds(widgets, relations)
  const { children } = parentEdges(relations)
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
    if (carriers.has(id)) {
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
