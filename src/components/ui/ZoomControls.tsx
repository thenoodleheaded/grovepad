import { useEffect, useRef, useState } from 'react'
import { Maximize, Minus, Plus, Redo2, Undo2 } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { boundsForWidgets } from '../../utils/widgetBounds'
import { IconButton } from './IconButton'

const ZOOM_STEP = 1.25
const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200]

/**
 * Floating HUD zoom panel. Subscribes only to the rounded percentage, so it
 * re-renders at most once per visible 1% change — not per zoom frame.
 */
export function ZoomControls() {
  const zoomPercent = useCanvasStore((state) => Math.round(state.zoom * 100))
  const canUndo = useWidgetStore((state) => state.canUndo)
  const canRedo = useWidgetStore((state) => state.canRedo)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const presetsRef = useRef<HTMLDivElement>(null)

  useOverlayLifecycle(presetsOpen)

  useEffect(() => {
    if (!presetsOpen) return
    const handler = (e: MouseEvent) => {
      if (!presetsRef.current?.contains(e.target as Node)) setPresetsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [presetsOpen])

  const viewportCenter = () => {
    const { viewportSize } = useCanvasStore.getState()
    return { x: viewportSize.width / 2, y: viewportSize.height / 2 }
  }

  const zoomBy = (factor: number) => {
    const canvas = useCanvasStore.getState()
    canvas.zoomToAnimated(canvas.zoom * factor, viewportCenter())
  }

  const frameBoard = () => {
    const state = useWidgetStore.getState()
    const rect = boundsForWidgets(
      Object.values(state.widgets).filter((w) => w.canvasId === state.activeCanvasId),
    )
    if (rect) useCanvasStore.getState().fitRect(rect, 160)
    else useCanvasStore.getState().fitAll()
  }

  return (
    <div
      data-canvas-ui
      className="gp-toolbar gp-panel absolute bottom-3 right-3 z-10 flex select-none items-center gap-0.5 rounded-2xl p-1 shadow-xl sm:bottom-4 sm:right-4 sm:gap-1"
    >
      <span className="hidden sm:contents">
        <IconButton label="Undo (⌘Z)" disabled={!canUndo} onClick={() => useWidgetStore.getState().undo()}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => useWidgetStore.getState().redo()}>
          <Redo2 size={15} />
        </IconButton>
        <span className="mx-0.5 h-5 w-px bg-neutral-700/70" aria-hidden />
      </span>
      <IconButton label="Zoom out (-)" onClick={() => zoomBy(1 / ZOOM_STEP)}>
        <Minus size={16} />
      </IconButton>
      <div ref={presetsRef} className="relative">
        <button
          type="button"
          title="Zoom presets (click to pick)"
          aria-label="Zoom level — click for presets"
          onClick={() => setPresetsOpen((o) => !o)}
          onDoubleClick={() => {
            useCanvasStore.getState().zoomToAnimated(1, viewportCenter())
            setPresetsOpen(false)
          }}
          className="h-9 w-12 rounded-xl text-center font-mono text-xs tabular-nums text-neutral-300 transition-colors hover:bg-neutral-700/60 hover:text-white"
        >
          {zoomPercent}%
        </button>
        {presetsOpen && (
          <div className="gp-pop gp-panel absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 overflow-hidden rounded-lg shadow-2xl">
            <button type="button" onClick={() => { frameBoard(); setPresetsOpen(false) }} className="block w-full whitespace-nowrap border-b gp-hairline px-4 py-2 text-center text-xs font-medium text-emerald-300 hover:bg-neutral-700/50">Fit board (F)</button>
            {ZOOM_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  useCanvasStore.getState().zoomToAnimated(p / 100, viewportCenter())
                  setPresetsOpen(false)
                }}
                className={`block w-full px-4 py-1.5 text-center font-mono text-xs tabular-nums transition-colors hover:bg-neutral-700/50 ${
                  zoomPercent === p ? 'text-emerald-400' : 'text-neutral-300'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        )}
      </div>
      <IconButton label="Zoom in (+)" onClick={() => zoomBy(ZOOM_STEP)}>
        <Plus size={16} />
      </IconButton>
      <span className="hidden sm:contents">
        <span className="mx-0.5 h-5 w-px bg-neutral-700/70" aria-hidden />
        <IconButton label="Frame board (F)" onClick={frameBoard}>
          <Maximize size={16} />
        </IconButton>
      </span>
    </div>
  )
}
