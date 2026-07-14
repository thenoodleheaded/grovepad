import { FolderOpen } from 'lucide-react'
import { useWidgetStore } from '../../../store/useWidgetStore'
import type { CanvasNodeData } from '../../../types/spatial'

interface CanvasNodeWidgetProps {
  data: CanvasNodeData
}

/**
 * A "canvas file" card — the widget IS a navigable sub-canvas. Fixed at two
 * cells tall: one row with the canvas glyph and its name, both plain links
 * into the canvas. No counters, no enter button — the name is the way in.
 */
export function CanvasNodeWidget({ data }: CanvasNodeWidgetProps) {
  const canvasName = useWidgetStore((state) => state.canvases[data.canvasId]?.name ?? 'Canvas')

  const enter = () => {
    if (useWidgetStore.getState().canvases[data.canvasId]) {
      useWidgetStore.getState().navigateToCanvas(data.canvasId)
    }
  }

  return (
    <div className="flex h-full min-w-0 items-center gap-2.5">
      <button
        type="button"
        aria-label={`Open ${canvasName}`}
        onClick={(e) => {
          e.stopPropagation()
          enter()
        }}
        className="gp-canvas-link gp-canvas-node-glyph flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:border-emerald-400/55 hover:bg-emerald-400/20"
      >
        <FolderOpen size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Open ${canvasName}`}
        onClick={(e) => {
          e.stopPropagation()
          enter()
        }}
        className="gp-canvas-link gp-canvas-link-name min-w-0 truncate bg-transparent text-left text-sm font-semibold text-neutral-200"
      >
        {canvasName}
      </button>
    </div>
  )
}
