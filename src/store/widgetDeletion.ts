import type { CanvasNodeData, Widget } from '../types/spatial'

export interface WidgetDeletionSource {
  widgets: Record<string, Widget>
  canvases: Record<string, { id: string; parentCanvasId: string | null }>
}

export interface WidgetDeletionImpact {
  directWidgetIds: string[]
  removedCanvasIds: Set<string>
  removedWidgetIds: Set<string>
  descendantWidgetCount: number
}

/** One canonical blast-radius calculation shared by confirmation and mutation. */
export function analyzeWidgetDeletion(source: WidgetDeletionSource, ids: Iterable<string>): WidgetDeletionImpact {
  const directWidgetIds = [...new Set(ids)].filter((id) => source.widgets[id] && !source.widgets[id]!.metadata.locked)
  const removedCanvasIds = new Set<string>()
  const queue: string[] = []
  for (const id of directWidgetIds) {
    const widget = source.widgets[id]
    if (widget?.type !== 'canvas_node') continue
    const canvasId = (widget.data as CanvasNodeData).canvasId
    if (source.canvases[canvasId] && !removedCanvasIds.has(canvasId)) {
      removedCanvasIds.add(canvasId)
      queue.push(canvasId)
    }
  }
  while (queue.length > 0) {
    const parentId = queue.pop()!
    for (const canvas of Object.values(source.canvases)) {
      if (canvas.parentCanvasId === parentId && !removedCanvasIds.has(canvas.id)) {
        removedCanvasIds.add(canvas.id)
        queue.push(canvas.id)
      }
    }
  }
  const removedWidgetIds = new Set(directWidgetIds)
  for (const widget of Object.values(source.widgets)) {
    if (removedCanvasIds.has(widget.canvasId)) removedWidgetIds.add(widget.id)
  }
  return {
    directWidgetIds,
    removedCanvasIds,
    removedWidgetIds,
    descendantWidgetCount: removedWidgetIds.size - directWidgetIds.length,
  }
}
