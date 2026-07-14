import { useMemo } from 'react'
import { useWidgetStore } from '../store/useWidgetStore'

const EMPTY_WIDGET_IDS: readonly string[] = []

let indexedVersion = -1
let idsByCanvas = new Map<string, readonly string[]>()

function rebuildIndex(version: number): void {
  if (indexedVersion === version) return

  const next = new Map<string, string[]>()
  for (const widget of Object.values(useWidgetStore.getState().widgets)) {
    const ids = next.get(widget.canvasId)
    if (ids) ids.push(widget.id)
    else next.set(widget.canvasId, [widget.id])
  }

  idsByCanvas = next
  indexedVersion = version
}

/**
 * Stable widget IDs for one canvas. Moving, resizing, or editing a widget does
 * not rebuild this index; only add/remove/load/undo topology changes do.
 */
export function useCanvasWidgetIds(canvasId?: string): readonly string[] {
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const structureVersion = useWidgetStore((state) => state.widgetStructureVersion)
  const targetCanvasId = canvasId ?? activeCanvasId

  return useMemo(() => {
    rebuildIndex(structureVersion)
    return idsByCanvas.get(targetCanvasId) ?? EMPTY_WIDGET_IDS
  }, [structureVersion, targetCanvasId])
}

export function useCanvasWidgetCount(canvasId?: string): number {
  return useCanvasWidgetIds(canvasId).length
}
