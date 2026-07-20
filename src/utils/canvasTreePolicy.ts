import type { CanvasMeta } from '../types/spatial'

/** Legal reparent targets for a canvas. Its own subtree is excluded so a
 * touch "Move" action can never create a cycle. */
export function canvasParentTargets(
  canvases: Record<string, CanvasMeta>,
  canvasId: string,
): CanvasMeta[] {
  const moving = canvases[canvasId]
  if (!moving) return []
  return Object.values(canvases)
    .filter((candidate) => {
      if (
        candidate.workspaceId !== moving.workspaceId ||
        candidate.id === canvasId ||
        candidate.id === moving.parentCanvasId
      ) return false
      let cursor: CanvasMeta | undefined = candidate
      while (cursor) {
        if (cursor.id === canvasId) return false
        cursor = cursor.parentCanvasId ? canvases[cursor.parentCanvasId] : undefined
      }
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
