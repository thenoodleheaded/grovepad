import { useEffect, useRef, useState } from 'react'
import { Maximize, Minus, Plus, Redo2, Undo2 } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCollaborationStore } from '../../store/useCollaborationStore'
import { frameCanvas } from '../../utils/cameraFraming'
import { IconButton } from './IconButton'

const ZOOM_STEP = 1.25
const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200]

/**
 * Floating HUD zoom panel. Its percentage text is updated imperatively so
 * camera movement never reconciles this React toolbar.
 */
export function ZoomControls() {
  const canUndo = useWidgetStore((state) => state.canUndo)
  const canRedo = useWidgetStore((state) => state.canRedo)
  const followingCollaborator = useCollaborationStore((state) => state.followingClientId !== null)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const presetsRef = useRef<HTMLDivElement>(null)
  const zoomLabelRef = useRef<HTMLButtonElement>(null)
  const zoomPercent = Math.round(useCanvasStore.getState().zoom * 100)

  useOverlayLifecycle(presetsOpen)

  useEffect(() => {
    if (!presetsOpen) return
    const handler = (e: MouseEvent) => {
      if (!presetsRef.current?.contains(e.target as Node)) setPresetsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [presetsOpen])

  useEffect(() => {
    let lastPercent = Number.NaN
    const apply = () => {
      const nextPercent = Math.round(useCanvasStore.getState().zoom * 100)
      if (nextPercent === lastPercent) return
      lastPercent = nextPercent
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${nextPercent}%`
    }
    apply()
    const unsubscribeCanvas = useCanvasStore.subscribe(() => apply())
    return () => {
      unsubscribeCanvas()
    }
  }, [])

  const viewportCenter = () => {
    const { viewportSize } = useCanvasStore.getState()
    return { x: viewportSize.width / 2, y: viewportSize.height / 2 }
  }

  const zoomBy = (factor: number) => {
    const canvas = useCanvasStore.getState()
    canvas.zoomToAnimated(canvas.zoom * factor, viewportCenter())
  }

  const frameBoard = () => {
    frameCanvas('board')
  }

  return (
    <div
      data-canvas-ui
      className="gp-canvas-ui-scale gp-safe-canvas-bottom-right gp-toolbar gp-panel absolute z-10 flex select-none items-center gap-0.5 rounded-2xl p-1 shadow-xl sm:gap-1"
    >
      <span className="gp-tablet-zoom-secondary hidden sm:contents">
        <IconButton label="Undo (⌘Z)" disabled={!canUndo} onClick={() => useWidgetStore.getState().undo()}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => useWidgetStore.getState().redo()}>
          <Redo2 size={15} />
        </IconButton>
        <span className="mx-0.5 h-5 w-px bg-neutral-700/70" aria-hidden />
      </span>
      <span className="gp-desktop-zoom-step contents">
        <IconButton label="Zoom out (-)" disabled={followingCollaborator} onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <Minus size={16} />
        </IconButton>
      </span>
      <div ref={presetsRef} className="relative">
        <button
          ref={zoomLabelRef}
          type="button"
          title="Zoom presets (click to pick)"
          aria-label="Zoom level — click for presets"
          disabled={followingCollaborator}
          onClick={() => setPresetsOpen((o) => !o)}
          onDoubleClick={() => {
            useCanvasStore.getState().zoomToAnimated(1, viewportCenter())
            setPresetsOpen(false)
          }}
          className="gp-touch-target h-9 w-12 rounded-xl text-center text-xs tabular-nums text-neutral-300 transition-colors hover:bg-neutral-700/60 hover:text-white"
        >
          {zoomPercent}%
        </button>
        {presetsOpen && (
          <div className="gp-pop gp-panel absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 overflow-hidden rounded-lg shadow-2xl">
            <button type="button" onClick={() => { frameBoard(); setPresetsOpen(false) }} className="gp-touch-target block w-full whitespace-nowrap border-b gp-hairline px-4 py-2 text-center text-xs font-medium text-emerald-300 hover:bg-neutral-700/50">Fit board (F)</button>
            {ZOOM_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  useCanvasStore.getState().zoomToAnimated(p / 100, viewportCenter())
                  setPresetsOpen(false)
                }}
                className={`gp-touch-target block w-full px-4 py-1.5 text-center text-xs tabular-nums transition-colors hover:bg-neutral-700/50 ${
                  zoomPercent === p ? 'text-emerald-400' : 'text-neutral-300'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="gp-desktop-zoom-step contents">
        <IconButton label="Zoom in (+)" disabled={followingCollaborator} onClick={() => zoomBy(ZOOM_STEP)}>
          <Plus size={16} />
        </IconButton>
      </span>
      <span className="hidden sm:contents">
        <span className="mx-0.5 h-5 w-px bg-neutral-700/70" aria-hidden />
        <IconButton label="Frame board (F)" disabled={followingCollaborator} onClick={frameBoard}>
          <Maximize size={16} />
        </IconButton>
      </span>
    </div>
  )
}
