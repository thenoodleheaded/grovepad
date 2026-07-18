import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { getLiveWidgetSizing, mergeWidgetSizing } from '../../store/liveWidgetSizing'
import type { Size, Widget } from '../../types/spatial'
import { crossedBothScaleAxes, fullWidgetResizeBounds, type WidgetScaleState } from '../../utils/widgetScale'
import { resizeAnomalies } from '../../utils/scaleDebugAnomalies'
import { useScaleDebugStore } from '../../store/useScaleDebugStore'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'

interface ResizeState {
  pointerId: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  state: WidgetScaleState
  committed: boolean
  historyCaptured: boolean
  moved: boolean
  rafId: number
  pending: Size | null
  disposeWindowListeners: () => void
}

interface ResizePointerSample {
  pointerId: number
  clientX: number
  clientY: number
}

/** Owns the corner-handle resize gesture (including pill/icon scale-state
 * commits) for one widget card. Extracted verbatim from WidgetCard.tsx; the
 * only additions are the `if (!widget) return` guards, which are unreachable
 * while the card is unmounted. */
export function useWidgetResize(widgetId: string, widget: Widget | undefined, isFocused: boolean) {
  const resizeRef = useRef<ResizeState | null>(null)

  useEffect(() => () => {
    const resize = resizeRef.current
    if (!resize) return
    if (resize.rafId !== 0) cancelAnimationFrame(resize.rafId)
    resize.disposeWindowListeners()
    document.body.removeAttribute('data-widget-dragging')
    document.body.removeAttribute('data-widget-resizing')
  }, [])

  const commitScaleState = (resize: ResizeState, target: WidgetScaleState) => {
    if (resize.rafId !== 0) {
      cancelAnimationFrame(resize.rafId)
      resize.rafId = 0
    }
    resize.pending = null
    resize.committed = true
    if (!resize.historyCaptured) {
      useWidgetStore.getState().snapshotHistory()
      resize.historyCaptured = true
    }
    // A state change is a single terminal decision for this drag. Releasing
    // and starting a new gesture is required before another state can change.
    document.body.removeAttribute('data-widget-dragging')
    useWidgetStore.getState().setWidgetScaleState(widgetId, target, true)
  }

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!widget) return
    if (e.button !== 0) return
    if (isFocused) return
    e.preventDefault()
    e.stopPropagation()
    useCanvasStore.getState().cancelViewAnimation()
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.setAttribute(
      'data-widget-resizing',
      widgetDefinition(widget.type).sizing?.autoHeight ? 'width' : 'both',
    )
    const move = (event: PointerEvent) => onResizePointerMove(event)
    const end = (event: PointerEvent) => onResizePointerEnd(event)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: widget.size.width,
      startHeight: widget.size.height,
      state: widget.collapsed ? 'pill' : widget.iconified ? 'icon' : 'full',
      committed: false,
      historyCaptured: false,
      moved: false,
      rafId: 0,
      pending: null,
      disposeWindowListeners: () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
      },
    }
  }

  const onResizePointerMove = (e: ResizePointerSample) => {
    if (!widget) return
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== e.pointerId || resize.committed) return
    if (!resize.moved) {
      resize.moved = true
      if (resize.state === 'full') {
        useWidgetStore.getState().snapshotHistory()
        resize.historyCaptured = true
      }
      // Suppress the size transition while the handle is held so per-frame
      // resize updates track the pointer exactly (same trick as drags).
      document.body.setAttribute('data-widget-dragging', 'true')
    }
    const zoom = useCanvasStore.getState().zoom
    const dx = (e.clientX - resize.startX) / zoom
    const dy = (e.clientY - resize.startY) / zoom

    if (resize.state === 'pill' || resize.state === 'icon') {
      if (crossedBothScaleAxes(dx, dy)) {
        commitScaleState(resize, resize.state === 'pill' ? 'full' : 'pill')
        return
      }
      if (resize.state === 'pill' && crossedBothScaleAxes(-dx, -dy)) {
        commitScaleState(resize, 'icon')
        return
      }
      return
    }

    const sizing = mergeWidgetSizing(widgetDefinition(widget.type).sizing, getLiveWidgetSizing(widgetId))
    const { minWidth, minHeight, maxWidth, maxHeight } = fullWidgetResizeBounds(sizing, DEFAULT_SIZING)
    // Content-fit widgets: height always follows the content reporter, so the
    // handle only drives width.
    const lockHeight = sizing?.autoHeight === true
    const rawWidth = resize.startWidth + dx
    const rawHeightIntent = resize.startHeight + dy
    const rawHeight = lockHeight ? resize.startHeight : rawHeightIntent

    // Collapsing requires deliberate diagonal shrink intent beyond both live
    // minima. A single-axis shrink or any maximum-bound overscale only clamps.
    if (crossedBothScaleAxes(minWidth - rawWidth, minHeight - rawHeightIntent)) {
      commitScaleState(resize, 'pill')
      return
    }

    resize.pending = {
      width: Math.min(maxWidth, Math.max(minWidth, rawWidth)),
      height: Math.min(maxHeight, Math.max(minHeight, rawHeight)),
    }

    if (resize.rafId === 0) {
      resize.rafId = requestAnimationFrame(() => {
        resize.rafId = 0
        // Free-form while dragging — no grid stepping.
        if (resize.pending) {
          if (useScaleDebugStore.getState().isOpen) {
            useScaleDebugStore.getState().record({
              widgetId,
              widgetType: widget.type,
              kind: 'pointer-resize',
              before: { width: widget.size.width, height: widget.size.height },
              after: resize.pending,
              zoom,
              detail: {
                dx: Math.round(dx),
                dy: Math.round(dy),
                rawWidth: Math.round(rawWidth),
                rawHeightIntent: Math.round(rawHeightIntent),
                lockHeight,
                minWidth,
                minHeight,
                maxWidth,
                maxHeight,
                clampedWidth: rawWidth < minWidth || rawWidth > maxWidth,
                clampedHeight: rawHeight < minHeight || rawHeight > maxHeight,
              },
              anomalies: resizeAnomalies(resize.pending, { minWidth, minHeight, maxWidth, maxHeight }, {
                snapped: false,
                locked: widget.metadata.locked === true,
                changed: true,
              }),
            })
          }
          useWidgetStore.getState().resizeWidget(widgetId, resize.pending, false)
        }
      })
    }
  }

  const onResizePointerEnd = (e: Pick<ResizePointerSample, 'pointerId'>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== e.pointerId) return
    resizeRef.current = null
    if (resize.rafId !== 0) cancelAnimationFrame(resize.rafId)
    resize.disposeWindowListeners()
    document.body.removeAttribute('data-widget-dragging')
    document.body.removeAttribute('data-widget-resizing')
    if (resize.moved && !resize.committed && resize.state === 'full') {
      if (resize.pending) useWidgetStore.getState().resizeWidget(widgetId, resize.pending)
      useWidgetStore.getState().settleWidgets([widgetId])
    }
  }

  return { onResizePointerDown }
}
