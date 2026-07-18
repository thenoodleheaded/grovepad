import type { HydratedPersistedBoard } from '../types/persistence'
import type { Vector2D } from '../types/spatial'
import { screenToWorld } from '../types/spatial'
import { useCanvasStore } from '../store/useCanvasStore'
import { useToastStore } from '../store/useToastStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { writeMediaBlob } from './boardDatabase'

interface CanvasImportRequest {
  board: HydratedPersistedBoard
  media: Array<{ key: string; blob: Blob }>
  filename: string
  position?: Vector2D
}

export function canvasImportTitle(filename: string): string {
  return filename.replace(/\.(grovepad|json)$/i, '').trim() || 'Imported board'
}

function importPosition(): Vector2D {
  const canvas = useCanvasStore.getState()
  return screenToWorld(
    { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 },
    { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom },
  )
}

/** Write package media under fresh keys before its Canvas card can render. */
function remapMediaKeys(
  board: HydratedPersistedBoard,
): { board: HydratedPersistedBoard; keyMap: Map<string, string> } {
  const keyMap = new Map<string, string>()
  const widgets = Object.fromEntries(
    Object.entries(board.widgets).map(([id, widget]) => {
      if (widget.type !== 'media') return [id, widget]
      const key = (widget.data as { localBlobKey?: unknown }).localBlobKey
      if (typeof key !== 'string' || !key) return [id, widget]
      let next = keyMap.get(key)
      if (!next) {
        next = crypto.randomUUID()
        keyMap.set(key, next)
      }
      return [id, { ...widget, data: { ...widget.data, localBlobKey: next } }]
    }),
  )
  return { board: { ...board, widgets }, keyMap }
}

export async function importBoardFileOntoCanvas(request: CanvasImportRequest): Promise<string> {
  const prepared = remapMediaKeys(request.board)
  for (const item of request.media) {
    const key = prepared.keyMap.get(item.key)
    if (key) await writeMediaBlob(key, item.blob)
  }
  const title = canvasImportTitle(request.filename)
  const rootWidgetId = useWidgetStore.getState().importBoardAsCanvas(
    prepared.board,
    title,
    request.position ?? importPosition(),
  )
  if (!rootWidgetId) throw new Error('Board could not be placed on this canvas')
  useToastStore.getState().addToast(`Imported “${title}” as a Canvas`)
  return rootWidgetId
}
