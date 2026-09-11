import type { SearchResult } from '../types/spatial'
import { useCanvasStore } from '../store/useCanvasStore'
import { useWidgetStore } from '../store/useWidgetStore'

/**
 * Navigate to a search result: into a canvas, or to a widget — entering its
 * canvas first when needed — gliding the camera to it at a legible zoom and
 * pulsing the card. One owner shared by the command palette and the Quick Add
 * `go` verb, so "jump to this result" always behaves identically.
 */
export function leapToSearchResult(result: SearchResult): void {
  if (result.type === 'canvas') {
    useWidgetStore.getState().navigateToCanvas(result.id)
    return
  }
  // Cross-canvas result: enter its canvas first, then glide to it there.
  if (result.canvasId && result.canvasId !== useWidgetStore.getState().activeCanvasId) {
    useWidgetStore.getState().navigateToCanvas(result.canvasId)
  }
  const canvas = useCanvasStore.getState()
  // Glide to the widget at a zoom where detail is legible, then pulse it.
  const targetZoom = Math.max(canvas.zoom, 0.85)
  canvas.animateView(
    {
      x: canvas.viewportSize.width / 2 - result.position.x * targetZoom,
      y: canvas.viewportSize.height / 2 - result.position.y * targetZoom,
    },
    targetZoom,
    380,
  )
  const widgetState = useWidgetStore.getState()
  widgetState.selectWidget(result.id, false)
  widgetState.flashWidget(result.id)
}
