import type { Connection } from '../types/circuit'
import type { HydratedPersistedBoard, PersistedBoardState } from '../types/persistence'
import type { CanvasMeta, CanvasNodeData, Relation, Vector2D, Widget, WidgetGlue } from '../types/spatial'
import { snapToGrid } from '../types/spatial'
import { buildWidget } from '../store/widgetSizing'

export interface BoardCanvasEmbedding {
  rootWidgetId: string
  canvases: Record<string, CanvasMeta>
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  connections: Record<string, Connection>
  glues: Record<string, WidgetGlue>
}

interface EmbedOptions {
  title: string
  position: Vector2D
  idFactory?: () => string
}

/** Turn a complete board into one navigable Canvas card in the current canvas. */
export function planBoardCanvasEmbedding(
  current: PersistedBoardState,
  imported: HydratedPersistedBoard,
  options: EmbedOptions,
): BoardCanvasEmbedding {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const occupied = new Set([
    ...Object.keys(current.workspaces),
    ...Object.keys(current.canvases),
    ...Object.keys(current.widgets),
    ...Object.keys(current.relations),
    ...Object.keys(current.connections),
    ...Object.keys(current.glues),
  ])
  const nextId = () => {
    let id = idFactory()
    while (occupied.has(id)) id = idFactory()
    occupied.add(id)
    return id
  }

  const rootWidgetId = nextId()
  const wrapperCanvasId = nextId()
  const rootWidget = buildWidget(
    rootWidgetId,
    'canvas_node',
    options.title,
    current.activeCanvasId,
    { x: snapToGrid(options.position.x), y: snapToGrid(options.position.y) },
  )
  rootWidget.data = { canvasId: wrapperCanvasId }

  const importedWorkspaces = Object.values(imported.workspaces).sort(
    (left, right) => (left.sortIndex ?? left.createdAt) - (right.sortIndex ?? right.createdAt),
  )
  const canvasMap = new Map<string, string>()
  if (importedWorkspaces.length === 1) {
    canvasMap.set(importedWorkspaces[0]!.rootCanvasId, wrapperCanvasId)
  }
  for (const canvas of Object.values(imported.canvases)) {
    if (!canvasMap.has(canvas.id)) canvasMap.set(canvas.id, nextId())
  }

  const canvases: Record<string, CanvasMeta> = {
    [wrapperCanvasId]: {
      id: wrapperCanvasId,
      name: options.title,
      workspaceId: current.activeWorkspaceId,
      parentCanvasId: current.activeCanvasId,
    },
  }
  for (const canvas of Object.values(imported.canvases)) {
    const id = canvasMap.get(canvas.id)!
    if (id === wrapperCanvasId) continue
    const sourceWorkspace = imported.workspaces[canvas.workspaceId]
    const isWorkspaceRoot = sourceWorkspace?.rootCanvasId === canvas.id
    canvases[id] = {
      id,
      name: isWorkspaceRoot && importedWorkspaces.length > 1
        ? sourceWorkspace.name
        : canvas.name,
      workspaceId: current.activeWorkspaceId,
      parentCanvasId: isWorkspaceRoot
        ? wrapperCanvasId
        : canvas.parentCanvasId
          ? canvasMap.get(canvas.parentCanvasId) ?? wrapperCanvasId
          : wrapperCanvasId,
    }
  }

  const widgets: Record<string, Widget> = { [rootWidgetId]: rootWidget }
  if (importedWorkspaces.length > 1) {
    importedWorkspaces.forEach((workspace, index) => {
      const id = nextId()
      const node = buildWidget(
        id,
        'canvas_node',
        workspace.name,
        wrapperCanvasId,
        { x: index * 320, y: 0 },
      )
      node.data = { canvasId: canvasMap.get(workspace.rootCanvasId)! }
      widgets[id] = node
    })
  }

  const widgetMap = new Map<string, string>()
  for (const widget of Object.values(imported.widgets)) widgetMap.set(widget.id, nextId())
  for (const widget of Object.values(imported.widgets)) {
    const id = widgetMap.get(widget.id)!
    const canvasId = canvasMap.get(widget.canvasId)
    if (!canvasId) continue
    const canvasNodeData = widget.data as CanvasNodeData
    const data = widget.type === 'canvas_node'
      ? { ...canvasNodeData, canvasId: canvasMap.get(canvasNodeData.canvasId) ?? canvasNodeData.canvasId }
      : widget.data
    widgets[id] = { ...widget, id, canvasId, data }
  }

  const relations: Record<string, Relation> = {}
  for (const relation of Object.values(imported.relations)) {
    const fromId = widgetMap.get(relation.fromId)
    const toId = widgetMap.get(relation.toId)
    if (!fromId || !toId) continue
    const id = nextId()
    relations[id] = { ...relation, id, fromId, toId }
  }

  const connections: Record<string, Connection> = {}
  for (const connection of Object.values(imported.connections)) {
    const fromId = widgetMap.get(connection.fromId)
    const toId = widgetMap.get(connection.toId)
    if (!fromId || !toId) continue
    const id = nextId()
    connections[id] = { ...connection, id, fromId, toId }
  }

  const glues: Record<string, WidgetGlue> = {}
  for (const glue of Object.values(imported.glues)) {
    const widgetIds = glue.widgetIds.flatMap((widgetId) => {
      const mapped = widgetMap.get(widgetId)
      return mapped ? [mapped] : []
    })
    if (widgetIds.length < 2) continue
    const id = nextId()
    glues[id] = { ...glue, id, widgetIds }
  }

  return { rootWidgetId, canvases, widgets, relations, connections, glues }
}
