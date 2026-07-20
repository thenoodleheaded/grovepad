import { useMemo, type FocusEvent, type PointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCircuitStore } from '../../store/useCircuitStore'
import { useFocusStore } from '../../store/useFocusStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useDragDisplacementStore } from '../../store/dragDisplacement'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { getOpaqueWidgetType } from '../../utils/persistedBoardSchema'
import { interactiveResidentWidgetIds } from '../../utils/widgetResidency'
import { useWindowedResidency } from '../../engine/window/useWindowedResidency'
import type { ResidencyEntry } from '../../engine/window/windowedResidency'
import { primitiveWidget } from '../../widgets/primitiveWidget'
import { WidgetCard } from './WidgetCard'
import { PrimitiveWidgetCard } from './PrimitiveWidgetCard'

/**
 * World-space layer for widgets. Mounted membership comes from the windowed
 * residency driver: camera-window driven, but recomputed only in coalesced
 * off-gesture slices — mid-motion the set can only grow (pre-mount ahead of
 * travel), teardown waits for idle, and the id-sorted order plus explicit
 * per-card zIndex keep reconciliation free of reorder churn. The parent world
 * transform does all per-frame camera work.
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

  const entries = useMemo(() => {
    const out: ResidencyEntry[] = []
    for (const id of canvasWidgetIds) {
      const widget = widgets[id]
      if (!widget) continue
      out.push({
        id,
        x: widget.position.x,
        y: widget.position.y,
        width: widget.size.width,
        height: widget.size.height,
      })
    }
    return out
  }, [canvasWidgetIds, widgets])

  const residencyPins = useMemo(() => {
    // Interaction subjects and settling drags must never dehydrate. Displaced
    // ghost neighbors are deliberately excluded: their offsets churn every
    // drag frame and they are by construction already near the viewport.
    const ids = new Set(pinnedIds)
    if (interaction.selectedIds.size === 1) {
      const selectedId = interaction.selectedIds.values().next().value
      if (selectedId) ids.add(selectedId)
    }
    for (const id of displacement.pendingSettleIds) ids.add(id)
    return ids
  }, [displacement.pendingSettleIds, interaction.selectedIds, pinnedIds])

  const { mountedIds, fullIds } = useWindowedResidency(entries, residencyPins)

  const interactiveIds = useMemo(() => {
    return interactiveResidentWidgetIds({
      renderedIds: mountedIds,
      pinnedIds,
      selectedIds: interaction.selectedIds,
      circuitMode,
      forceInteractive: (id) => Boolean(widgets[id] && getOpaqueWidgetType(widgets[id]!)),
    })
  }, [circuitMode, interaction.selectedIds, mountedIds, pinnedIds, widgets])

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

      {mountedIds.map((widgetId) => {
        const widget = widgets[widgetId]
        if (!widget) return null
        if (fullIds.has(widgetId) || interactiveIds.has(widgetId)) {
          return <WidgetCard key={widgetId} widgetId={widgetId} />
        }
        const groupId = widgetGroupIndex[widgetId]
        return (
          <PrimitiveWidgetCard
            key={widgetId}
            widget={primitiveWidget(widget)}
            selected={interaction.selectedIds.has(widgetId)}
            blocked={blockedWidgetIds.has(widgetId)}
            grouped={Boolean(groupId)}
            groupColor={groupId ? groups[groupId]?.color : undefined}
            ghostOffset={displacement.offsets[widgetId]}
            settlePending={displacement.pendingSettleIds.has(widgetId)}
            focusBackground={focusedWidgetId !== null && focusedWidgetId !== widgetId}
          />
        )
      })}
    </div>
  )
}
