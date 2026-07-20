import { useMemo, type FocusEvent, type PointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCircuitStore } from '../../store/useCircuitStore'
import { useFocusStore } from '../../store/useFocusStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useDragDisplacementStore } from '../../store/dragDisplacement'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { getOpaqueWidgetType } from '../../utils/persistedBoardSchema'
import { primitiveWidget } from '../../widgets/primitiveWidget'
import { WidgetCard } from './WidgetCard'
import { PrimitiveWidgetCard } from './PrimitiveWidgetCard'

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
    blockedWidgetIds,
    groups,
    widgetGroupIndex,
  } = useWidgetStore(
    useShallow((state) => ({
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
      blockedWidgetIds: state.blockedWidgetIds,
      groups: state.groups,
      widgetGroupIndex: state.widgetGroupIndex,
    })),
  )
  const interaction = useWidgetStore(
    useShallow((state) => ({
      selectedIds: state.selectedIds,
      hoveredWidgetId: state.hoveredWidgetId,
      linkSourceId: state.linkDrag?.sourceId ?? null,
      childLinkSourceId: state.childLinkSource,
      dependencyLinkSourceId: state.dependencyLinkSource,
      contextWidgetId: state.contextMenu?.widgetId ?? null,
      renamingWidgetId: state.renamingWidgetId,
      flashWidgetId: state.flashWidgetId,
    })),
  )
  const focusedWidgetId = useFocusStore((state) => state.focusedWidgetId)
  const circuitMode = useCircuitStore((state) => state.circuitMode)
  const displacement = useDragDisplacementStore(
    useShallow((state) => ({
      offsets: state.offsets,
      pendingSettleIds: state.pendingSettleIds,
    })),
  )
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)

  const pinnedIds = useMemo(() => {
    const ids = new Set<string>()
    const pinned = [
      focusedWidgetId,
      interaction.hoveredWidgetId,
      interaction.linkSourceId,
      interaction.childLinkSourceId,
      interaction.dependencyLinkSourceId,
      interaction.contextWidgetId,
      interaction.renamingWidgetId,
      interaction.flashWidgetId,
    ]
    for (const id of pinned) {
      if (id) ids.add(id)
    }
    return ids
  }, [focusedWidgetId, interaction])

  const renderedIds = useMemo(() => {
    // The base order never changes with selection or hover. Reordering 300
    // keyed cards solely to pin one interaction target caused whole-layer
    // layout work and triple-digit frame stalls.
    const ids: string[] = []
    const included = new Set<string>()
    for (const widgetId of canvasWidgetIds) {
      if (ids.length >= STABLE_WIDGET_RENDER_BUDGET) break
      if (!widgets[widgetId]) continue
      ids.push(widgetId)
      included.add(widgetId)
    }
    // A pinned widget outside the stable budget remains operable, but is
    // appended instead of changing the order of existing cards.
    for (const widgetId of pinnedIds) {
      const widget = widgets[widgetId]
      if (!widget || widget.canvasId !== activeCanvasId || included.has(widgetId)) continue
      ids.push(widgetId)
      included.add(widgetId)
    }
    return ids
  }, [activeCanvasId, canvasWidgetIds, pinnedIds, widgets])

  const interactiveIds = useMemo(() => {
    if (circuitMode) return new Set(renderedIds)
    const ids = new Set(pinnedIds)
    // A single explicit selection represents an editing subject. A marquee
    // selection remains entirely passive and uses the shared action bar.
    if (interaction.selectedIds.size === 1) {
      const selectedId = interaction.selectedIds.values().next().value
      if (selectedId) ids.add(selectedId)
    }
    for (const id of renderedIds) {
      const widget = widgets[id]
      if (widget && getOpaqueWidgetType(widget)) ids.add(id)
    }
    return ids
  }, [circuitMode, interaction.selectedIds, pinnedIds, renderedIds, widgets])

  const primitiveWidgets = useMemo(
    () => renderedIds.map((id) => primitiveWidget(widgets[id]!)),
    [renderedIds, widgets],
  )

  const primitiveId = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null
    return target.closest<HTMLElement>('[data-primitive-widget-id]')?.dataset.primitiveWidgetId ?? null
  }

  const onPrimitivePointerOver = (event: PointerEvent<HTMLDivElement>) => {
    const widgetId = primitiveId(event.target)
    if (!widgetId) return
    const fromId = primitiveId(event.relatedTarget)
    if (fromId === widgetId) return
    if (widgets[widgetId]?.metadata.locked) return
    useWidgetStore.getState().setHoveredWidgetId(widgetId)
  }

  const onPrimitivePointerOut = (event: PointerEvent<HTMLDivElement>) => {
    const widgetId = primitiveId(event.target)
    if (!widgetId || primitiveId(event.relatedTarget) === widgetId) return
    if (useWidgetStore.getState().hoveredWidgetId === widgetId) {
      useWidgetStore.getState().setHoveredWidgetId(null)
    }
  }

  const onPrimitivePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const widgetId = primitiveId(event.target)
    if (!widgetId) return
    useWidgetStore.getState().selectWidget(
      widgetId,
      event.shiftKey || event.metaKey || event.ctrlKey,
    )
  }

  const onPrimitiveFocus = (event: FocusEvent<HTMLDivElement>) => {
    const widgetId = primitiveId(event.target)
    if (!widgetId) return
    useWidgetStore.getState().selectWidget(widgetId, false)
  }

  return (
    <div
      className="absolute left-0 top-0"
      onPointerOver={onPrimitivePointerOver}
      onPointerOut={onPrimitivePointerOut}
      onPointerDown={onPrimitivePointerDown}
      onFocusCapture={onPrimitiveFocus}
    >
      <div
        aria-hidden
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/70 bg-emerald-400/15"
      />
      <div aria-hidden className="absolute h-px w-6 -translate-x-1/2 bg-emerald-400/40" />
      <div aria-hidden className="absolute h-6 w-px -translate-y-1/2 bg-emerald-400/40" />
      <span className="absolute left-3 top-2  text-[10px] text-neutral-500">0, 0</span>

      {primitiveWidgets.map((widget) => {
        if (interactiveIds.has(widget.id)) {
          return <WidgetCard key={widget.id} widgetId={widget.id} />
        }
        const groupId = widgetGroupIndex[widget.id]
        return (
          <PrimitiveWidgetCard
            key={widget.id}
            widget={widget}
            selected={interaction.selectedIds.has(widget.id)}
            blocked={blockedWidgetIds.has(widget.id)}
            grouped={Boolean(groupId)}
            groupColor={groupId ? groups[groupId]?.color : undefined}
            ghostOffset={displacement.offsets[widget.id]}
            settlePending={displacement.pendingSettleIds.has(widget.id)}
            focusBackground={focusedWidgetId !== null && focusedWidgetId !== widget.id}
          />
        )
      })}
    </div>
  )
}
