import { useSyncExternalStore } from 'react'
import { Activity, MousePointer2 } from 'lucide-react'
import { useCanvasWidgetCount } from '../../hooks/useCanvasWidgets'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import {
  getWidgetDensitySnapshot,
  subscribeWidgetDensity,
} from '../../utils/canvasDensity'

export function CanvasLoadIndicator() {
  const widgetCount = useCanvasWidgetCount()
  const selectedCount = useWidgetStore((state) => state.selectedIds.size)
  const zoomPercent = useCanvasStore((state) => Math.round(state.zoom * 100))
  const density = useSyncExternalStore(
    subscribeWidgetDensity,
    getWidgetDensitySnapshot,
    getWidgetDensitySnapshot,
  )
  const modeTone = density.mode === 'detail' ? 'text-emerald-300' : 'text-amber-300'

  return (
    <div
      data-canvas-ui
      className="gp-toolbar gp-panel absolute bottom-3 left-3 z-10 flex min-h-11 select-none items-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-[11px] text-neutral-400 shadow-xl sm:bottom-4 sm:left-4 sm:gap-2 sm:py-2"
    >
      <Activity size={13} className={modeTone} aria-hidden />
      <span className="font-mono tabular-nums text-neutral-200">
        {widgetCount.toLocaleString()}
      </span>
      <span className="hidden text-neutral-500 sm:inline">widgets</span>
      <span className="hidden h-4 w-px bg-neutral-600 sm:inline" aria-hidden />
      <span className="hidden font-mono tabular-nums text-neutral-500 sm:inline">{zoomPercent}%</span>
      <span className="hidden h-4 w-px bg-neutral-600 md:inline" aria-hidden />
      <span
        className={`hidden font-mono text-[10px] uppercase tracking-wide md:inline ${modeTone}`}
        title={`${density.detailCount} full widgets; ${density.renderedCount} of ${density.visibleCount} nearby widgets rendered`}
      >
        {density.mode}
      </span>
      {density.renderedCount < density.visibleCount && (
        <span
          className="hidden font-mono tabular-nums text-neutral-600 lg:inline"
          title="A render budget is hiding the far overscan fringe"
        >
          {density.renderedCount.toLocaleString()}/{density.visibleCount.toLocaleString()}
        </span>
      )}
      {selectedCount > 0 && (
        <>
          <span className="hidden h-4 w-px bg-neutral-600 sm:inline" aria-hidden />
          <MousePointer2 size={13} className="text-amber-300" aria-hidden />
          <span className="font-mono tabular-nums text-neutral-300">{selectedCount}</span>
        </>
      )}
    </div>
  )
}
