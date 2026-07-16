import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../store/useWidgetStore'
import { widgetIntersectsRect } from '../../utils/canvasView'
import {
  widgetRenderBudget,
  widgetRenderMode,
  type WidgetRenderMode,
} from '../../utils/canvasDensity'
import { useQuantizedView } from '../../hooks/useQuantizedView'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { WidgetCard } from './WidgetCard'
import { WidgetProxy } from './WidgetProxy'
import './WidgetProxy.css'

const VIEW_OVERSCAN_SCREEN = 420

/**
 * World-space layer for widgets.
 * Visibility culling runs against a chunk-quantized camera rect, so panning
 * inside a chunk re-renders nothing here — the world transform does all the work.
 */
export function WidgetLayer() {
  const {
    widgets,
    activeCanvasId,
    blockedWidgetIds,
  } = useWidgetStore(
    useShallow((state) => ({
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
      blockedWidgetIds: state.blockedWidgetIds,
    })),
  )
  const interaction = useWidgetStore(
    useShallow((state) => ({
      selectedIds: state.selectedIds,
      linkSourceId: state.linkDrag?.sourceId ?? null,
      childLinkSourceId: state.childLinkSource,
      contextWidgetId: state.contextMenu?.widgetId ?? null,
      renamingWidgetId: state.renamingWidgetId,
      flashWidgetId: state.flashWidgetId,
    })),
  )
  const overscanView = useQuantizedView(VIEW_OVERSCAN_SCREEN)
  const viewportView = useQuantizedView(0)
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)

  const candidates = useMemo(() => {
    const next: Array<{
      widget: (typeof widgets)[string]
      inViewport: boolean
    }> = []
    for (const widgetId of canvasWidgetIds) {
      const widget = widgets[widgetId]
      if (!widget) continue
      if (
        widget.canvasId !== activeCanvasId ||
        !widgetIntersectsRect(widget, overscanView.rect)
      ) {
        continue
      }
      const inViewport = widgetIntersectsRect(widget, viewportView.rect)
      next.push({ widget, inViewport })
    }
    return next
  }, [activeCanvasId, canvasWidgetIds, overscanView.rect, viewportView.rect, widgets])

  const baseMode = widgetRenderMode(viewportView.zoom)

  const pinnedIds = useMemo(() => {
    const ids = new Set(interaction.selectedIds)
    const pinned = [
      interaction.linkSourceId,
      interaction.childLinkSourceId,
      interaction.contextWidgetId,
      interaction.renamingWidgetId,
      interaction.flashWidgetId,
    ]
    for (const id of pinned) {
      if (id) ids.add(id)
    }
    return ids
  }, [interaction])

  const rendered = useMemo(() => {
    const budget = widgetRenderBudget(baseMode)
    const items: Array<{ widget: (typeof candidates)[number]['widget']; mode: WidgetRenderMode }> = []
    const included = new Set<string>()
    let regularCount = 0

    // Pinned cards never lose their working controls, even in map mode.
    for (const candidate of candidates) {
      if (!pinnedIds.has(candidate.widget.id)) continue
      items.push({ widget: candidate.widget, mode: 'detail' })
      included.add(candidate.widget.id)
    }

    const append = (inViewport: boolean) => {
      for (const candidate of candidates) {
        if (candidate.inViewport !== inViewport || included.has(candidate.widget.id)) continue
        if (regularCount >= budget) return
        const candidateMode = candidate.inViewport || baseMode !== 'detail' ? baseMode : 'map'
        items.push({ widget: candidate.widget, mode: candidateMode })
        included.add(candidate.widget.id)
        regularCount++
      }
    }

    // A linear two-pass budget keeps the true viewport populated before the
    // overscan fringe without paying an n log n distance sort.
    append(true)
    append(false)
    return items
  }, [baseMode, candidates, pinnedIds])

  return (
    <div className="absolute left-0 top-0">
      <div
        aria-hidden
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/70 bg-emerald-400/15"
      />
      <div aria-hidden className="absolute h-px w-6 -translate-x-1/2 bg-emerald-400/40" />
      <div aria-hidden className="absolute h-6 w-px -translate-y-1/2 bg-emerald-400/40" />
      <span className="absolute left-3 top-2 font-mono text-[10px] text-neutral-500">0, 0</span>

      {rendered.map(({ widget, mode }) =>
        mode === 'detail' ? (
          <WidgetCard key={widget.id} widgetId={widget.id} />
        ) : (
          <WidgetProxy
            key={widget.id}
            widget={widget}
            selected={interaction.selectedIds.has(widget.id)}
            blocked={blockedWidgetIds.has(widget.id)}
          />
        ),
      )}
    </div>
  )
}
