import type { ExcalidrawData, SketchpadData, Widget } from '../types/spatial'
import { excalidrawBlobKey } from './excalidrawFiles'

// ---------------------------------------------------------------------------
// Every blob-store key a widget's content references. Three families write
// media blobs (proven by enumerating writeMediaBlob callers):
//   - media widgets store the key at data.localBlobKey;
//   - Excalidraw scenes DERIVE keys from the host widget id + file ref id at
//     read time (excalidrawFiles.ts) — the legacy standalone 'excalidraw'
//     type keeps ExcalidrawData at the top level of data, while the sketchpad
//     drawing widget nests it under data.diagram;
//   - the drawing widget's annotation skin stores its key at
//     skinStates.annotation.localBlobKey (shape: AnnotationState in
//     drawingSkinModel.ts — read directly here so a pure util does not import
//     a component module).
// Export packaging asks this helper instead of guessing, so a backup can never
// silently omit a family again. Enumeration deliberately ignores data.mode:
// specialist state survives mode switches, so a sketchpad currently showing
// ink still owns its diagram files and annotation background.
// ---------------------------------------------------------------------------

function excalidrawKeys(widgetId: string, scene: ExcalidrawData | undefined): string[] {
  if (!scene?.files?.length) return []
  return scene.files
    .filter((ref) => typeof ref?.id === 'string' && ref.id)
    .map((ref) => excalidrawBlobKey(widgetId, ref.id))
}

/** Blob keys `widget` references, in the shapes their read paths expect. */
export function mediaBlobKeysForWidget(widget: Widget): string[] {
  if (widget.type === 'media') {
    const key = (widget.data as { localBlobKey?: unknown }).localBlobKey
    return typeof key === 'string' && key ? [key] : []
  }
  if (widget.type === 'excalidraw') {
    return excalidrawKeys(widget.id, widget.data as ExcalidrawData)
  }
  if (widget.type === 'sketchpad') {
    const data = widget.data as SketchpadData
    const keys = excalidrawKeys(widget.id, data.diagram)
    const annotationKey = (data.skinStates?.annotation as { localBlobKey?: unknown } | undefined)?.localBlobKey
    if (typeof annotationKey === 'string' && annotationKey) keys.push(annotationKey)
    return keys
  }
  return []
}
