import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { WidgetCard } from './WidgetCard'

const STABLE_WIDGET_RENDER_BUDGET = 320

/**
 * World-space layer for widgets. Its mounted membership depends only on board
 * state, never camera state. Keeping the same cards alive through zoom avoids
 * React reconciliation, layout effects, and forced textarea measurements in
 * the middle of a gesture; the parent world transform does all camera work.
 */
export function WidgetLayer() {
  const {
    widgets,
    activeCanvasId,
  } = useWidgetStore(
    useShallow((state) => ({
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
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
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)

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

  const renderedIds = useMemo(() => {
    const ids: string[] = []
    const included = new Set<string>()

    for (const widgetId of pinnedIds) {
      const widget = widgets[widgetId]
      if (!widget || widget.canvasId !== activeCanvasId) continue
      ids.push(widgetId)
      included.add(widgetId)
    }

    for (const widgetId of canvasWidgetIds) {
      if (included.has(widgetId) || !widgets[widgetId]) continue
      if (ids.length >= STABLE_WIDGET_RENDER_BUDGET) break
      ids.push(widgetId)
    }
    return ids
  }, [activeCanvasId, canvasWidgetIds, pinnedIds, widgets])

  return (
    <div className="absolute left-0 top-0">
      <div
        aria-hidden
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/70 bg-emerald-400/15"
      />
      <div aria-hidden className="absolute h-px w-6 -translate-x-1/2 bg-emerald-400/40" />
      <div aria-hidden className="absolute h-6 w-px -translate-y-1/2 bg-emerald-400/40" />
      <span className="absolute left-3 top-2  text-[10px] text-neutral-500">0, 0</span>

      {renderedIds.map((widgetId) => <WidgetCard key={widgetId} widgetId={widgetId} />)}
    </div>
  )
}
