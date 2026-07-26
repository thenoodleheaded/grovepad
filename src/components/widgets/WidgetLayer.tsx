import { useCallback, useMemo } from 'react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { useVirtualCanvasWindow } from '../../hooks/useVirtualCanvasWindow'
import { useProgressiveWidgetMounts } from '../../hooks/useProgressiveWidgetMounts'
import {
  RESTING_FACE_INTERACTION_ZOOM,
  WIDGET_PREVIEW_BATCH,
  WIDGET_PREVIEW_RELEASE_BATCH,
  usesLightweightWidgetImage,
  virtualWidgetCandidates,
  withEagerPreviewBatch,
} from '../../utils/widgetVirtualization'
import {
  expansionOffsetFor,
  isWidgetResting,
  restingTileSize,
} from '../../utils/widgetRest'
import { WidgetCard } from './WidgetCard'
import { LightweightWidgetPreview } from './LightweightWidgetPreview'

/**
 * World-space widget virtualization. Cheap image previews appear immediately;
 * only cards near the retained viewport hydrate, in small idle-time batches.
 * The parent world transform still owns every per-frame camera movement.
 */
export function WidgetLayer() {
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)
  const selectedIds = useWidgetStore((state) => state.selectedIds)
  const renamingWidgetId = useWidgetStore((state) => state.renamingWidgetId)
  const linkSourceId = useWidgetStore((state) => state.linkDrag?.sourceId ?? null)
  const expandedWidgetId = useWidgetRestStore((state) => state.expandedWidgetId)
  const expandedOffset = useWidgetRestStore((state) => state.expandedOffset)
  const virtualWindow = useVirtualCanvasWindow()

  const urgentIds = useMemo(() => {
    const widgets = useWidgetStore.getState().widgets
    const ids = new Set<string>()
    for (const id of selectedIds) {
      if (widgets[id]?.canvasId === activeCanvasId) ids.add(id)
    }
    for (const id of [expandedWidgetId, renamingWidgetId, linkSourceId]) {
      if (id && widgets[id]?.canvasId === activeCanvasId) ids.add(id)
    }
    for (const id of canvasWidgetIds) {
      if (widgets[id]?.isHydrating) ids.add(id)
    }
    return [...ids]
  }, [
    activeCanvasId,
    canvasWidgetIds,
    expandedWidgetId,
    linkSourceId,
    renamingWidgetId,
    selectedIds,
  ])

  const candidates = useMemo(() => virtualWidgetCandidates(
    canvasWidgetIds,
    useWidgetStore.getState().widgets,
    virtualWindow.retainedRect,
    { expandedWidgetId, expandedOffset },
  ), [canvasWidgetIds, expandedOffset, expandedWidgetId, virtualWindow.retainedRect])

  const targetLiveIds = useMemo(() => {
    const ordered = !usesLightweightWidgetImage(virtualWindow.camera.zoom, false)
      ? candidates.map((candidate) => candidate.id)
      : []
    const seen = new Set(ordered)
    for (const id of urgentIds) {
      if (!seen.has(id)) ordered.unshift(id)
    }
    return ordered
  }, [candidates, urgentIds, virtualWindow.camera.zoom])

  const candidateIds = useMemo(
    () => {
      const ids = candidates.map((candidate) => candidate.id)
      const seen = new Set(ids)
      for (const id of urgentIds) {
        if (!seen.has(id)) ids.unshift(id)
      }
      return ids
    },
    [candidates, urgentIds],
  )
  const { liveIds: residentIds, mountNow: showNow } = useProgressiveWidgetMounts(
    candidateIds,
    urgentIds,
    {
      hydrateBatch: WIDGET_PREVIEW_BATCH,
      releaseBatch: WIDGET_PREVIEW_RELEASE_BATCH,
    },
  )
  const { liveIds, mountNow } = useProgressiveWidgetMounts(targetLiveIds, urgentIds)
  const candidatesById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  )
  const renderIds = useMemo(() => {
    // The cheap first batch is synchronous. Waiting for requestIdleCallback
    // here left a newly opened canvas visually empty until another browser
    // event (commonly the first wheel gesture) gave residency a chance to run.
    const ids = withEagerPreviewBatch(residentIds, candidateIds)
    const seen = new Set(ids)
    const widgets = useWidgetStore.getState().widgets
    // A full card can hydrate before the cheap resident-image pass reaches it,
    // so the live set is always allowed to lead. A canvas switch is still
    // atomic: never carry the prior canvas into the new one.
    for (const id of liveIds) {
      if (!seen.has(id) && widgets[id]?.canvasId === activeCanvasId) ids.push(id)
    }
    return ids.filter((id) => widgets[id]?.canvasId === activeCanvasId)
  }, [activeCanvasId, candidateIds, liveIds, residentIds])
  const previewCount = useMemo(
    () => renderIds.reduce((count, id) => count + Number(!liveIds.has(id)), 0),
    [liveIds, renderIds],
  )
  const renderedLiveCount = renderIds.length - previewCount

  const activatePreview = useCallback((widgetId: string) => {
    const widget = useWidgetStore.getState().widgets[widgetId]
    if (!widget) return
    showNow(widgetId)
    mountNow(widgetId)
    useWidgetStore.getState().selectWidget(widgetId, false)

    const restState = useWidgetRestStore.getState()
    const cameraZoom = useCanvasStore.getState().zoom
    if (
      cameraZoom >= RESTING_FACE_INTERACTION_ZOOM &&
      isWidgetResting(widget, restState)
    ) {
      restState.expandWidget(
        widgetId,
        expansionOffsetFor(restingTileSize(widget), widget.size),
        { kind: 'rest' },
      )
    }
  }, [mountNow, showNow])

  return (
    <div
      data-widget-layer
      data-widget-live-count={renderedLiveCount}
      data-widget-preview-count={previewCount}
      className="absolute left-0 top-0"
    >
      <div
        aria-hidden
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/70 bg-emerald-400/15"
      />
      <div aria-hidden className="absolute h-px w-6 -translate-x-1/2 bg-emerald-400/40" />
      <div aria-hidden className="absolute h-6 w-px -translate-y-1/2 bg-emerald-400/40" />
      <span className="absolute left-3 top-2  text-[10px] text-neutral-500">0, 0</span>

      {renderIds.map((widgetId) => {
        if (liveIds.has(widgetId)) {
          return <WidgetCard key={widgetId} widgetId={widgetId} />
        }
        const candidate = candidatesById.get(widgetId)
        const widget = useWidgetStore.getState().widgets[widgetId]
        if (!widget) return null
        const resting = candidate?.resting ?? isWidgetResting(widget, {
          expandedWidgetId,
          expandedOffset,
        })
        return (
          <LightweightWidgetPreview
            key={widgetId}
            widgetId={widgetId}
            resting={resting}
            interactive={
              virtualWindow.camera.zoom >= RESTING_FACE_INTERACTION_ZOOM || !resting
            }
            onActivate={activatePreview}
          />
        )
      })}
    </div>
  )
}
