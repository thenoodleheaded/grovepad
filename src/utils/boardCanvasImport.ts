import type { HydratedPersistedBoard } from '../types/persistence'
import type { Vector2D } from '../types/spatial'
import { screenToWorld } from '../types/spatial'
import { useCanvasStore } from '../store/useCanvasStore'
import { useToastStore } from '../store/useToastStore'
import type { ExcalidrawData, SketchpadData } from '../types/spatial'
import { useWidgetStore } from '../store/useWidgetStore'
import { writeMediaBlob } from './boardDatabase'
import { excalidrawBlobKey } from './excalidrawFiles'

interface CanvasImportRequest {
  board: HydratedPersistedBoard
  media: Array<{ key: string; blob: Blob }>
  filename: string
  position?: Vector2D
}

function canvasImportTitle(filename: string): string {
  return filename.replace(/\.(grovepad|json)$/i, '').trim() || 'Imported board'
}

function importPosition(): Vector2D {
  const canvas = useCanvasStore.getState()
  return screenToWorld(
    { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 },
    { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom },
  )
}

/**
 * Write package media under fresh keys before its Canvas card can render.
 * Only keys the package actually carries are reminted (`availableKeys`): a key
 * missing from the archive keeps its original value, so a same-device import
 * of an older package still finds the source widget's local blob instead of
 * pointing a fresh key at nothing.
 */
function remapMediaKeys(
  board: HydratedPersistedBoard,
  availableKeys: ReadonlySet<string>,
): { board: HydratedPersistedBoard; keyMap: Map<string, string> } {
  const keyMap = new Map<string, string>()
  const remap = (key: unknown, mint: () => string): string | null => {
    if (typeof key !== 'string' || !key || !availableKeys.has(key)) return null
    let next = keyMap.get(key)
    if (!next) {
      next = mint()
      keyMap.set(key, next)
    }
    return next
  }
  const widgets = Object.fromEntries(
    Object.entries(board.widgets).map(([id, widget]) => {
      if (widget.type === 'media') {
        const next = remap((widget.data as { localBlobKey?: unknown }).localBlobKey, () => crypto.randomUUID())
        return next ? [id, { ...widget, data: { ...widget.data, localBlobKey: next } }] : [id, widget]
      }
      if (widget.type === 'sketchpad') {
        // The annotation skin reads its STORED key, so reminting just needs the
        // skin state rewritten alongside. (Excalidraw keys are DERIVED from the
        // widget id at read time and are handled after import, once the minted
        // widget ids exist.)
        const data = widget.data as SketchpadData
        const annotation = data.skinStates?.annotation
        const next = remap(annotation?.localBlobKey, () => `annotation:${crypto.randomUUID()}`)
        if (!next) return [id, widget]
        return [id, {
          ...widget,
          data: {
            ...data,
            skinStates: { ...data.skinStates, annotation: { ...annotation, localBlobKey: next } },
          },
        }]
      }
      return [id, widget]
    }),
  )
  return { board: { ...board, widgets }, keyMap }
}

/** The Excalidraw scene a widget carries, wherever its family stores it: the
 * legacy standalone type keeps it at the top of data, sketchpad under diagram. */
function excalidrawScene(widget: { type: string; data: unknown }): ExcalidrawData | undefined {
  if (widget.type === 'excalidraw') return widget.data as ExcalidrawData
  if (widget.type === 'sketchpad') return (widget.data as SketchpadData).diagram
  return undefined
}

export async function importBoardFileOntoCanvas(request: CanvasImportRequest): Promise<string> {
  const availableKeys = new Set(request.media.map((item) => item.key))
  const prepared = remapMediaKeys(request.board, availableKeys)
  for (const item of request.media) {
    const key = prepared.keyMap.get(item.key)
    if (key) await writeMediaBlob(key, item.blob)
  }
  const title = canvasImportTitle(request.filename)
  const result = useWidgetStore.getState().importBoardAsCanvas(
    prepared.board,
    title,
    request.position ?? importPosition(),
  )
  if (!result) throw new Error('Board could not be placed on this canvas')

  // Excalidraw blobs are read back under keys derived from the CURRENT widget
  // id, so they can only be written once the minted ids exist — after the
  // store commit. A failure here must degrade to the old blank-image outcome,
  // never reject: the board is already imported with history pushed, and the
  // callers map a rejection to "not a valid package".
  try {
    const mediaByKey = new Map(request.media.map((item) => [item.key, item.blob]))
    for (const widget of Object.values(request.board.widgets)) {
      const scene = excalidrawScene(widget)
      if (!scene?.files?.length) continue
      const mintedId = result.widgetIdMap.get(widget.id)
      if (!mintedId) continue
      for (const ref of scene.files) {
        const blob = mediaByKey.get(excalidrawBlobKey(widget.id, ref.id))
        if (blob) await writeMediaBlob(excalidrawBlobKey(mintedId, ref.id), blob)
      }
    }
  } catch { /* imported without embedded drawings, matching the pre-fix outcome */ }

  useToastStore.getState().addToast(`Imported “${title}” as a Canvas`)
  return result.rootWidgetId
}
