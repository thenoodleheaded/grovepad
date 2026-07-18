import type { PersistedBoard } from '../types/persistence'
import type { CanvasNodeData } from '../types/spatial'

interface MergeOptions {
  incomingLabel?: string
  idFactory?: () => string
}

function uniqueId(occupied: Set<string>, preferred: string, idFactory: () => string): string {
  if (!occupied.has(preferred)) {
    occupied.add(preferred)
    return preferred
  }
  let candidate = idFactory()
  while (occupied.has(candidate)) candidate = idFactory()
  occupied.add(candidate)
  return candidate
}

/**
 * Keep the base board intact and append every incoming workspace. Colliding
 * ids are remapped as one graph so canvases, cards, groups, and wires remain
 * connected. A colliding workspace is deliberately kept as a second entry:
 * sync conflicts must never silently discard either version.
 */
export function mergePersistedBoardWorkspaces(
  base: PersistedBoard,
  incoming: PersistedBoard,
  options: MergeOptions = {},
): PersistedBoard {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const incomingLabel = options.incomingLabel ?? 'Imported'
  const workspaceIds = new Set(Object.keys(base.workspaces))
  const canvasIds = new Set(Object.keys(base.canvases))
  const widgetIds = new Set(Object.keys(base.widgets))
  const relationIds = new Set(Object.keys(base.relations))
  const connectionIds = new Set(Object.keys(base.connections))
  const groupIds = new Set(Object.keys(base.groups))
  const workspaceMap = new Map<string, string>()
  const canvasMap = new Map<string, string>()
  const widgetMap = new Map<string, string>()
  const workspaceCollisions = new Set<string>()

  for (const workspace of Object.values(incoming.workspaces)) {
    const collided = workspaceIds.has(workspace.id)
    if (collided) workspaceCollisions.add(workspace.id)
    workspaceMap.set(workspace.id, uniqueId(workspaceIds, workspace.id, idFactory))
  }
  for (const canvas of Object.values(incoming.canvases)) {
    const forceFresh = workspaceMap.get(canvas.workspaceId) !== canvas.workspaceId
    canvasMap.set(
      canvas.id,
      uniqueId(canvasIds, forceFresh ? idFactory() : canvas.id, idFactory),
    )
  }
  for (const widget of Object.values(incoming.widgets)) {
    const forceFresh = canvasMap.get(widget.canvasId) !== widget.canvasId
    widgetMap.set(
      widget.id,
      uniqueId(widgetIds, forceFresh ? idFactory() : widget.id, idFactory),
    )
  }

  const workspaces = { ...base.workspaces }
  const sortOffset = Object.keys(workspaces).length
  Object.values(incoming.workspaces).forEach((workspace, index) => {
    const id = workspaceMap.get(workspace.id)!
    const rootCanvasId = canvasMap.get(workspace.rootCanvasId)
    if (!rootCanvasId) return
    workspaces[id] = {
      ...workspace,
      id,
      rootCanvasId,
      name: workspaceCollisions.has(workspace.id)
        ? `${workspace.name} (${incomingLabel} copy)`
        : workspace.name,
      sortIndex: sortOffset + index,
    }
  })

  const canvases = { ...base.canvases }
  for (const canvas of Object.values(incoming.canvases)) {
    const id = canvasMap.get(canvas.id)
    const workspaceId = workspaceMap.get(canvas.workspaceId)
    if (!id || !workspaceId) continue
    canvases[id] = {
      ...canvas,
      id,
      workspaceId,
      parentCanvasId: canvas.parentCanvasId
        ? canvasMap.get(canvas.parentCanvasId) ?? null
        : null,
    }
  }

  const widgets = { ...base.widgets }
  for (const widget of Object.values(incoming.widgets)) {
    const id = widgetMap.get(widget.id)
    const canvasId = canvasMap.get(widget.canvasId)
    if (!id || !canvasId) continue
    const canvasNodeData = widget.data as CanvasNodeData
    const data = widget.type === 'canvas_node'
      ? { ...canvasNodeData, canvasId: canvasMap.get(canvasNodeData.canvasId) ?? canvasNodeData.canvasId }
      : widget.data
    widgets[id] = { ...widget, id, canvasId, data }
  }

  const relations = { ...base.relations }
  for (const relation of Object.values(incoming.relations)) {
    const fromId = widgetMap.get(relation.fromId)
    const toId = widgetMap.get(relation.toId)
    if (!fromId || !toId) continue
    const id = uniqueId(relationIds, relation.id, idFactory)
    relations[id] = { ...relation, id, fromId, toId }
  }

  const connections = { ...base.connections }
  for (const connection of Object.values(incoming.connections)) {
    const fromId = widgetMap.get(connection.fromId)
    const toId = widgetMap.get(connection.toId)
    if (!fromId || !toId) continue
    const id = uniqueId(connectionIds, connection.id, idFactory)
    connections[id] = { ...connection, id, fromId, toId }
  }

  const groups = { ...base.groups }
  for (const group of Object.values(incoming.groups)) {
    const mappedWidgetIds = group.widgetIds.flatMap((id) => {
      const mapped = widgetMap.get(id)
      return mapped ? [mapped] : []
    })
    if (mappedWidgetIds.length < 2) continue
    const id = uniqueId(groupIds, group.id, idFactory)
    groups[id] = { ...group, id, widgetIds: mappedWidgetIds }
  }

  return {
    ...base,
    workspaces,
    canvases,
    widgets,
    relations,
    connections,
    groups,
    activePacks: [...new Set([...base.activePacks, ...incoming.activePacks])],
  }
}
