import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { WidgetCard } from './WidgetCard'
import { HierarchyConstraintGuide } from '../canvas/HierarchyConstraintGuide'

/**
 * World-space layer for widgets. Every widget on the active canvas mounts a
 * full card; the parent world transform does all per-frame camera work.
 */
export function WidgetLayer() {
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)

  return (
    <div className="absolute left-0 top-0">
      <div
        aria-hidden
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/70 bg-emerald-400/15"
      />
      <div aria-hidden className="absolute h-px w-6 -translate-x-1/2 bg-emerald-400/40" />
      <div aria-hidden className="absolute h-6 w-px -translate-y-1/2 bg-emerald-400/40" />
      <span className="absolute left-3 top-2  text-[10px] text-neutral-500">0, 0</span>

      <HierarchyConstraintGuide />
      {canvasWidgetIds.map((widgetId) => (
        <WidgetCard key={widgetId} widgetId={widgetId} />
      ))}
    </div>
  )
}
