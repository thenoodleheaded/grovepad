import type { ModuleType, Relation, Widget } from '../types/spatial'
import { widgetDefinition } from '../widgets/registry'
import { layoutParentGraph, type PlanNodeSize } from './planLayout'

interface MinifiedWidget {
  id: string
  type: ModuleType
  title: string
  /** [REF-X] anchor tags pointing at the source-document chunks this widget
      draws from — the hydration pass sends only these excerpts, never the
      whole document. */
  sourceRefs: string[]
}

interface MinifiedRelation {
  from: string
  to: string
  type: 'parent' | 'co-parent' | 'cousin' | 'blocker' | 'conflict'
}

export interface MinifiedMindmap {
  widgets: MinifiedWidget[]
  relations: MinifiedRelation[]
}

const IMPORT_ORIGIN = { x: 120, y: 200 }

export function layoutMindmap(
  topology: MinifiedMindmap,
  canvasId: string,
): {
  widgets: Record<string, Widget>
  relations: Relation[]
  /** Logical topology id (w1, w2…) → spawned widget UUID, so callers can
      route per-widget follow-ups (hydration) without title matching. */
  idMap: Record<string, string>
} {
  const idMap: Record<string, string> = {}
  const sizes: Record<string, PlanNodeSize> = {}
  for (const widget of topology.widgets) {
    idMap[widget.id] = crypto.randomUUID()
    sizes[widget.id] = { ...widgetDefinition(widget.type).defaultSize }
  }

  const positions = layoutParentGraph({
    nodeIds: topology.widgets.map((widget) => widget.id),
    parentRelations: topology.relations
      .filter((relation) => relation.type === 'parent')
      .map(({ from, to }) => ({ from, to })),
  }, sizes)

  const widgets: Record<string, Widget> = {}
  for (const source of topology.widgets) {
    const id = idMap[source.id]
    if (!id) continue
    const definition = widgetDefinition(source.type)
    const position = positions[source.id] ?? { x: 0, y: 0 }
    widgets[id] = {
      id,
      type: source.type,
      title: source.title,
      canvasId,
      position: {
        x: position.x + IMPORT_ORIGIN.x,
        y: position.y + IMPORT_ORIGIN.y,
      },
      size: { ...definition.defaultSize },
      metadata: { badges: [] },
      data: definition.defaultData(),
    }
  }

  const relations: Relation[] = []
  for (const source of topology.relations) {
    const fromId = idMap[source.from]
    const toId = idMap[source.to]
    if (!fromId || !toId) continue
    relations.push({
      id: crypto.randomUUID(),
      fromId,
      toId,
      type: source.type,
      isResolved: false,
    })
  }

  return { widgets, relations, idMap }
}
