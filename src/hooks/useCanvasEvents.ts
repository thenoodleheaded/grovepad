import { useEffect, type RefObject } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { useFocusStore } from '../store/useFocusStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { useAdaptiveInputStore } from '../store/useAdaptiveInputStore'
import { useCollaborationStore } from '../store/useCollaborationStore'
import { screenToWorld, type Vector2D } from '../types/spatial'
import { resolveCanvasPointerIntent } from '../utils/canvasGesturePolicy'
import {
  kineticPanFrame,
  kineticVelocity,
  shouldStartKineticPan,
  type TimedPointerPoint,
} from '../utils/kineticPan'
import { createViewportFrameBatcher } from '../utils/viewportFrameBatcher'
import { beginCameraMotion, endCameraMotion } from '../runtime/cameraMotionRuntime'

/** Multiplier converting wheel delta pixels into an exponential zoom factor. */
const ZOOM_INTENSITY = 0.0022
/** Pixels per line for DOM_DELTA_LINE wheel events (legacy mice / Firefox). */
const LINE_HEIGHT = 16
const DRAG_THRESHOLD = 3

type ActiveGesture = 'pan' | 'pinch' | 'select' | 'zoom-region' | null

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function normalizeWheelDelta(event: WheelEvent): Vector2D {
  const factor =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? LINE_HEIGHT
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1
  return { x: event.deltaX * factor, y: event.deltaY * factor }
}

function isEmptyCanvasTarget(root: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('[data-camera-motion-layer]')) return true
  if (target.closest('[data-ghost-tree]')) return false
  if (target.closest('[data-widget-id], [data-group-id], article, svg')) return false
  if (target.closest('[data-canvas-ui], button, input, textarea, select, [role="dialog"]')) {
    return false
  }
  const worldLayer = root.querySelector('[data-world-layer]')
  return target === root || (worldLayer !== null && worldLayer.contains(target))
}

function viewportPoint(origin: Vector2D, event: PointerEvent | MouseEvent): Vector2D {
  return { x: event.clientX - origin.x, y: event.clientY - origin.y }
}

function applySelectionBox(box: HTMLDivElement, start: Vector2D, current: Vector2D): void {
  const left = Math.min(start.x, current.x)
  const top = Math.min(start.y, current.y)
  const width = Math.abs(current.x - start.x)
  const height = Math.abs(current.y - start.y)
  box.style.transform = `translate3d(${left}px, ${top}px, 0)`
  box.style.width = `${width}px`
  box.style.height = `${height}px`
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/**
 * Binds all viewport interaction to `viewportRef` without routing any
 * per-frame data through React state:
 *
 * - pinch / Ctrl(Cmd)+wheel  → zoom centered on the cursor
 * - plain wheel / trackpad   → two-axis pan
 * - middle-click drag        → pan
 * - Space + left drag        → pan
 *
 * All high-frequency updates go straight through the Zustand store's
 * imperative actions (`getState()`), so no component re-renders during a
 * gesture unless it explicitly subscribes.
 */
export function useCanvasEvents(viewportRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const { setIsPanning } = useCanvasStore.getState()

    let isSpaceHeld = false
    let isZHeld = false
    let activePointerId: number | null = null
    let activeGesture: ActiveGesture = null
    let lastX = 0
    let lastY = 0
    let gestureStart: Vector2D | null = null
    let latestPoint: Vector2D | null = null
    let hasPassedThreshold = false
    let selectionBox: HTMLDivElement | null = null
    let selectionBadge: HTMLSpanElement | null = null
    const touches = new Map<number, Vector2D>()
    let pinchStart: {
      distance: number
      midpoint: Vector2D
      zoom: number
      pan: Vector2D
    } | null = null
    let longPressTimer: number | null = null
    let longPressStart: Vector2D | null = null
    let touchPanSamples: TimedPointerPoint[] = []
    let kineticRafId = 0
    let kineticLastTime = 0
    let kineticPanVelocity: Vector2D = { x: 0, y: 0 }
    let wheelMotionTimer: number | null = null
    let wheelMotionDeadline = 0
    let viewportOrigin: Vector2D = { x: 0, y: 0 }
    const updateViewportOrigin = () => {
      const rect = el.getBoundingClientRect()
      viewportOrigin = { x: rect.left, y: rect.top }
    }
    updateViewportOrigin()
    const viewportObserver = new ResizeObserver(updateViewportOrigin)
    viewportObserver.observe(el)
    const viewportBatcher = createViewportFrameBatcher({
      getView: () => {
        const { pan, zoom } = useCanvasStore.getState()
        return { pan, zoom }
      },
      commitView: (pan, zoom) => useCanvasStore.getState().setView(pan, zoom),
    })

    const cancelKineticPan = () => {
      if (kineticRafId !== 0) cancelAnimationFrame(kineticRafId)
      kineticRafId = 0
      kineticLastTime = 0
      kineticPanVelocity = { x: 0, y: 0 }
      endCameraMotion('kinetic')
    }

    const runKineticPan = (time: number) => {
      if (kineticLastTime === 0) kineticLastTime = time
      const frame = kineticPanFrame(kineticPanVelocity, time - kineticLastTime)
      kineticLastTime = time
      kineticPanVelocity = frame.velocity
      viewportBatcher.panBy(frame.delta)
      if (frame.done) {
        cancelKineticPan()
        return
      }
      kineticRafId = requestAnimationFrame(runKineticPan)
    }

    const startKineticPan = () => {
      if (useAdaptiveInputStore.getState().capabilities.reducedMotion) return
      kineticPanVelocity = kineticVelocity(touchPanSamples)
      touchPanSamples = []
      if (Math.hypot(kineticPanVelocity.x, kineticPanVelocity.y) < 0.12) return
      kineticLastTime = 0
      beginCameraMotion('kinetic')
      kineticRafId = requestAnimationFrame(runKineticPan)
    }

    const cancelLongPress = () => {
      if (longPressTimer !== null) window.clearTimeout(longPressTimer)
      longPressTimer = null
      longPressStart = null
    }

    const touchPair = () => {
      const points = [...touches.values()]
      if (points.length < 2) return null
      const [a, b] = points as [Vector2D, Vector2D]
      return {
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    }

    const updateCursor = () => {
      const interactionMode = useAdaptiveInputStore.getState().interactionMode
      el.style.cursor =
        activeGesture === 'select' || activeGesture === 'zoom-region'
          ? 'crosshair'
          : activePointerId !== null
            ? 'grabbing'
            : isSpaceHeld
              ? 'grab'
              : interactionMode === 'select'
                ? 'crosshair'
                : ''
    }

    const finishWheelMotionWhenIdle = () => {
      const remaining = wheelMotionDeadline - performance.now()
      if (remaining > 0) {
        wheelMotionTimer = window.setTimeout(finishWheelMotionWhenIdle, remaining)
        return
      }
      wheelMotionTimer = null
      endCameraMotion('wheel')
    }

    const onWheel = (event: WheelEvent) => {
      cancelKineticPan()
      // Keep the browser from page-zooming, scrolling, or rubber-banding.
      event.preventDefault()
      if (useCollaborationStore.getState().followingClientId !== null) return
      // Focus mode pins the camera on its subject — no pan, no zoom.
      if (useFocusStore.getState().focusedWidgetId) return
      const delta = normalizeWheelDelta(event)
      beginCameraMotion('wheel')
      wheelMotionDeadline = performance.now() + 90
      if (wheelMotionTimer === null) {
        wheelMotionTimer = window.setTimeout(finishWheelMotionWhenIdle, 90)
      }

      if (event.ctrlKey || event.metaKey) {
        // Trackpad pinch arrives as ctrlKey+wheel; mouse users hold Ctrl/Cmd.
        viewportBatcher.zoomBy(Math.exp(-delta.y * ZOOM_INTENSITY), {
          x: event.clientX - viewportOrigin.x,
          y: event.clientY - viewportOrigin.y,
        })
      } else {
        viewportBatcher.panBy({ x: -delta.x, y: -delta.y })
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      cancelKineticPan()
      // Focus mode: FocusModeLayer owns every pointer (outside taps exit).
      if (useFocusStore.getState().focusedWidgetId) return
      const followingCollaborator = useCollaborationStore.getState().followingClientId !== null
      if (followingCollaborator && event.pointerType === 'touch') return
      if (event.pointerType === 'touch') {
        const point = viewportPoint(viewportOrigin, event)
        touches.set(event.pointerId, point)
        el.setPointerCapture(event.pointerId)
        if (touches.size === 2) {
          cancelLongPress()
          touchPanSamples = []
          const pair = touchPair()
          if (pair) {
            viewportBatcher.flush()
            const canvas = useCanvasStore.getState()
            pinchStart = { ...pair, zoom: canvas.zoom, pan: canvas.pan }
            activeGesture = 'pinch'
            beginCameraMotion('pointer')
            setIsPanning(true)
            updateCursor()
          }
          event.preventDefault()
          return
        }
        if (
          isEmptyCanvasTarget(el, event.target) &&
          useAdaptiveInputStore.getState().interactionMode === 'navigate'
        ) {
          longPressStart = { x: event.clientX, y: event.clientY }
          longPressTimer = window.setTimeout(() => {
            if (!longPressStart || touches.size !== 1) return
            el.dispatchEvent(new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: longPressStart.x,
              clientY: longPressStart.y,
              button: 2,
            }))
            activeGesture = null
            activePointerId = null
            endCameraMotion('pointer')
            setIsPanning(false)
            cancelLongPress()
          }, 500)
        }
      }
      if (activePointerId !== null) return
      const isEmptyCanvas = isEmptyCanvasTarget(el, event.target)
      const intent = resolveCanvasPointerIntent({
        button: event.button,
        pointerType: event.pointerType,
        interactionMode: useAdaptiveInputStore.getState().interactionMode,
        isEmptyCanvas,
        isSpaceHeld,
        isZHeld,
        isShiftHeld: event.shiftKey,
      })
      if (followingCollaborator && (intent === 'pan' || intent === 'zoom-region')) return
      if (intent === 'zoom-region') {
        event.preventDefault()
        activePointerId = event.pointerId
        activeGesture = 'zoom-region'
        lastX = event.clientX
        lastY = event.clientY
        gestureStart = viewportPoint(viewportOrigin, event)
        latestPoint = gestureStart
        hasPassedThreshold = false
        selectionBox = document.createElement('div')
        selectionBox.className = 'pointer-events-none absolute left-0 top-0 z-30 rounded-lg border border-violet-300/80 bg-violet-400/10 shadow-[0_0_24px_rgba(167,139,250,.18)] will-change-transform'
        applySelectionBox(selectionBox, gestureStart, gestureStart)
        el.appendChild(selectionBox)
        el.setPointerCapture(event.pointerId)
        updateCursor()
        return
      }
      if (intent === 'select') {
        event.preventDefault()
        useWidgetStore.getState().closeContextMenu()
        activePointerId = event.pointerId
        activeGesture = 'select'
        lastX = event.clientX
        lastY = event.clientY
        gestureStart = viewportPoint(viewportOrigin, event)
        latestPoint = gestureStart
        hasPassedThreshold = false
        selectionBox = document.createElement('div')
        selectionBox.setAttribute('aria-hidden', 'true')
        selectionBox.className =
          'pointer-events-none absolute left-0 top-0 z-30 rounded-xl border border-emerald-300/70 bg-emerald-400/[0.08] shadow-[0_0_0_1px_rgba(163,230,53,0.14),0_10px_36px_rgba(0,0,0,0.12)] will-change-transform'
        applySelectionBox(selectionBox, gestureStart, gestureStart)
        selectionBadge = document.createElement('span')
        selectionBadge.className = 'absolute -right-2 -top-7 rounded-full bg-emerald-300 px-2 py-0.5  text-[10px] font-bold text-neutral-950 shadow-lg'
        selectionBadge.textContent = '0'
        selectionBox.appendChild(selectionBadge)
        el.appendChild(selectionBox)
        el.setPointerCapture(event.pointerId)
        updateCursor()
        return
      }

      if (intent !== 'pan') return
      event.preventDefault()
      useWidgetStore.getState().closeContextMenu()
      activePointerId = event.pointerId
      activeGesture = 'pan'
      beginCameraMotion('pointer')
      lastX = event.clientX
      lastY = event.clientY
      el.setPointerCapture(event.pointerId)
      setIsPanning(true)
      if (event.pointerType === 'touch') {
        touchPanSamples = [{ x: event.clientX, y: event.clientY, time: event.timeStamp }]
      }
      updateCursor()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
        touches.set(event.pointerId, viewportPoint(viewportOrigin, event))
        if (longPressStart && Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y) > 8) {
          cancelLongPress()
        }
        if (activeGesture === 'pinch' && pinchStart) {
          event.preventDefault()
          const pair = touchPair()
          if (!pair) return
          const nextZoom = pinchStart.zoom * (pair.distance / pinchStart.distance)
          const clampedZoom = Math.max(0.1, Math.min(4, nextZoom))
          const worldAtStart = {
            x: (pinchStart.midpoint.x - pinchStart.pan.x) / pinchStart.zoom,
            y: (pinchStart.midpoint.y - pinchStart.pan.y) / pinchStart.zoom,
          }
          viewportBatcher.setView(
            {
              x: pair.midpoint.x - worldAtStart.x * clampedZoom,
              y: pair.midpoint.y - worldAtStart.y * clampedZoom,
            },
            clampedZoom,
          )
          return
        }
      }
      if (event.pointerId !== activePointerId) return
      if (activeGesture === 'select' || activeGesture === 'zoom-region') {
        latestPoint = viewportPoint(viewportOrigin, event)
        if (
          !hasPassedThreshold &&
          Math.abs(event.clientX - lastX) < DRAG_THRESHOLD &&
          Math.abs(event.clientY - lastY) < DRAG_THRESHOLD
        ) {
          return
        }
        hasPassedThreshold = true
        if (selectionBox && gestureStart) applySelectionBox(selectionBox, gestureStart, latestPoint)
        if (activeGesture === 'select' && selectionBadge && gestureStart) {
          const { pan, zoom } = useCanvasStore.getState()
          const a = screenToWorld(gestureStart, { x: pan.x, y: pan.y, zoom })
          const b = screenToWorld(latestPoint, { x: pan.x, y: pan.y, zoom })
          const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
          selectionBadge.textContent = String(Object.values(useWidgetStore.getState().widgets).filter((widget) => intersects(rect, { x: widget.position.x, y: widget.position.y, width: widget.size.width, height: widget.size.height })).length)
        }
        return
      }

      viewportBatcher.panBy({
        x: event.clientX - lastX,
        y: event.clientY - lastY,
      })
      lastX = event.clientX
      lastY = event.clientY
      if (event.pointerType === 'touch' && activeGesture === 'pan') {
        touchPanSamples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp })
        const cutoff = event.timeStamp - 140
        while (touchPanSamples.length > 2 && touchPanSamples[0]!.time < cutoff) {
          touchPanSamples.shift()
        }
      }
    }

    const onPointerEnd = (event: PointerEvent) => {
      const shouldFling = shouldStartKineticPan({
        eventType: event.type,
        pointerType: event.pointerType,
        activeGesture,
        touchCountBeforeRelease: touches.size,
      })
      if (shouldFling) {
        // A finger can stop before it lifts without producing another move.
        // Recording the release time turns that pause into zero recent
        // velocity instead of flinging from an old fast sample.
        touchPanSamples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp })
      }
      if (event.pointerType === 'touch') {
        touches.delete(event.pointerId)
        cancelLongPress()
        if (activeGesture === 'pinch') {
          viewportBatcher.flush()
          pinchStart = null
          const remaining = [...touches.entries()][0]
          if (remaining) {
            activeGesture = 'pan'
            activePointerId = remaining[0]
            lastX = remaining[1].x + viewportOrigin.x
            lastY = remaining[1].y + viewportOrigin.y
            touchPanSamples = [{ x: lastX, y: lastY, time: event.timeStamp }]
            updateCursor()
            return
          }
          activeGesture = null
          activePointerId = null
          endCameraMotion('pointer')
          setIsPanning(false)
          updateCursor()
          return
        }
      }
      if (event.pointerId !== activePointerId) return
      if (activeGesture === 'select' && gestureStart && latestPoint && hasPassedThreshold) {
        const { pan, zoom } = useCanvasStore.getState()
        const worldA = screenToWorld(gestureStart, { x: pan.x, y: pan.y, zoom })
        const worldB = screenToWorld(latestPoint, { x: pan.x, y: pan.y, zoom })
        const selectionRect = {
          x: Math.min(worldA.x, worldB.x),
          y: Math.min(worldA.y, worldB.y),
          width: Math.abs(worldA.x - worldB.x),
          height: Math.abs(worldA.y - worldB.y),
        }
        const widgetState = useWidgetStore.getState()
        const selected = new Set(widgetState.selectedIds)
        for (const widget of Object.values(widgetState.widgets)) {
          if (
            intersects(selectionRect, {
              x: widget.position.x,
              y: widget.position.y,
              width: widget.size.width,
              height: widget.size.height,
            })
          ) {
            selected.add(widget.id)
          }
        }
        widgetState.selectWidgets([...selected])
      } else if (activeGesture === 'zoom-region' && gestureStart && latestPoint && hasPassedThreshold) {
        const { pan, zoom } = useCanvasStore.getState()
        const worldA = screenToWorld(gestureStart, { x: pan.x, y: pan.y, zoom })
        const worldB = screenToWorld(latestPoint, { x: pan.x, y: pan.y, zoom })
        useCanvasStore.getState().fitRect({ x: Math.min(worldA.x, worldB.x), y: Math.min(worldA.y, worldB.y), width: Math.abs(worldA.x - worldB.x), height: Math.abs(worldA.y - worldB.y) }, 24)
      }

      // Selection and pinch handoff need the exact latest view, even if the
      // final pointer event arrived between display frames.
      viewportBatcher.flush()

      const endedCameraGesture = activeGesture === 'pan' || activeGesture === 'pinch'
      activePointerId = null
      activeGesture = null
      gestureStart = null
      latestPoint = null
      hasPassedThreshold = false
      selectionBox?.remove()
      selectionBox = null
      selectionBadge = null
      touches.clear()
      pinchStart = null
      cancelLongPress()
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId)
      }
      setIsPanning(false)
      if (shouldFling) startKineticPan()
      else touchPanSamples = []
      if (endedCameraGesture) endCameraMotion('pointer')
      updateCursor()
    }

    const onMouseDown = (event: MouseEvent) => {
      // pointerdown's preventDefault does not stop middle-click autoscroll.
      if (event.button === 1) event.preventDefault()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyZ' && !isEditableTarget(event.target) && !event.metaKey && !event.ctrlKey) {
        isZHeld = true
        updateCursor()
        return
      }
      if (event.code !== 'Space' || event.repeat) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      isSpaceHeld = true
      updateCursor()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyZ') {
        isZHeld = false
        updateCursor()
        return
      }
      if (event.code !== 'Space') return
      isSpaceHeld = false
      isZHeld = false
      updateCursor()
    }

    const onWindowBlur = () => {
      cancelKineticPan()
      viewportBatcher.flush()
      isSpaceHeld = false
      activePointerId = null
      activeGesture = null
      gestureStart = null
      latestPoint = null
      hasPassedThreshold = false
      selectionBox?.remove()
      selectionBox = null
      selectionBadge = null
      if (wheelMotionTimer !== null) window.clearTimeout(wheelMotionTimer)
      wheelMotionTimer = null
      endCameraMotion('wheel')
      endCameraMotion('pointer')
      setIsPanning(false)
      updateCursor()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerEnd)
    el.addEventListener('pointercancel', onPointerEnd)
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    const unsubscribeAdaptiveInput = useAdaptiveInputStore.subscribe((state, previous) => {
      if (state.interactionMode !== previous.interactionMode) updateCursor()
    })

    return () => {
      viewportBatcher.cancel()
      viewportObserver.disconnect()
      cancelKineticPan()
      cancelLongPress()
      if (wheelMotionTimer !== null) window.clearTimeout(wheelMotionTimer)
      endCameraMotion('wheel')
      endCameraMotion('pointer')
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerEnd)
      el.removeEventListener('pointercancel', onPointerEnd)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      unsubscribeAdaptiveInput()
    }
  }, [viewportRef])
}
