import { useEffect, type RefObject } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { useFocusStore } from '../store/useFocusStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { screenToWorld, type Vector2D } from '../types/spatial'

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
  if (target.closest('[data-ghost-tree]')) return false
  if (target.closest('[data-widget-id], [data-group-id], article, svg')) return false
  if (target.closest('[data-canvas-ui], button, input, textarea, select, [role="dialog"]')) {
    return false
  }
  const worldLayer = root.querySelector('[data-world-layer]')
  return target === root || (worldLayer !== null && worldLayer.contains(target))
}

function viewportPoint(root: HTMLElement, event: PointerEvent | MouseEvent): Vector2D {
  const rect = root.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
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

    const { panBy, zoomTo, setIsPanning } = useCanvasStore.getState()

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

    // RAF-batched pan accumulator — high-polling mice (1000Hz+) can fire far
    // above the display refresh rate; coalescing keeps the store write count
    // at one per rendered frame, matching the display's 120fps budget.
    let panRafId = 0
    let pendingPanX = 0
    let pendingPanY = 0

    const flushPan = () => {
      panRafId = 0
      if (pendingPanX !== 0 || pendingPanY !== 0) {
        panBy({ x: pendingPanX, y: pendingPanY })
        pendingPanX = 0
        pendingPanY = 0
      }
    }

    const updateCursor = () => {
      el.style.cursor =
        activeGesture === 'select' || activeGesture === 'zoom-region'
          ? 'crosshair'
          : activePointerId !== null
            ? 'grabbing'
            : isSpaceHeld
              ? 'grab'
              : ''
    }

    const onWheel = (event: WheelEvent) => {
      // Keep the browser from page-zooming, scrolling, or rubber-banding.
      event.preventDefault()
      // Focus mode pins the camera on its subject — no pan, no zoom.
      if (useFocusStore.getState().focusedWidgetId) return
      const delta = normalizeWheelDelta(event)

      if (event.ctrlKey || event.metaKey) {
        // Preserve event ordering if a plain-pan wheel batch is pending when
        // the gesture switches into pinch zoom.
        if (panRafId !== 0) {
          cancelAnimationFrame(panRafId)
          panRafId = 0
          flushPan()
        }
        // Trackpad pinch arrives as ctrlKey+wheel; mouse users hold Ctrl/Cmd.
        const rect = el.getBoundingClientRect()
        const { zoom } = useCanvasStore.getState()
        zoomTo(zoom * Math.exp(-delta.y * ZOOM_INTENSITY), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      } else {
        // Trackpads can emit wheel events far above the display refresh rate.
        // Share the drag accumulator so camera-store and DOM writes stay at
        // most once per painted frame.
        pendingPanX -= delta.x
        pendingPanY -= delta.y
        if (panRafId === 0) panRafId = requestAnimationFrame(flushPan)
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      // Focus mode: FocusModeLayer owns every pointer (outside taps exit).
      if (useFocusStore.getState().focusedWidgetId) return
      if (event.pointerType === 'touch') {
        const point = viewportPoint(el, event)
        touches.set(event.pointerId, point)
        el.setPointerCapture(event.pointerId)
        if (touches.size === 2) {
          cancelLongPress()
          const pair = touchPair()
          if (pair) {
            if (panRafId !== 0) cancelAnimationFrame(panRafId)
            flushPan()
            const canvas = useCanvasStore.getState()
            pinchStart = { ...pair, zoom: canvas.zoom, pan: canvas.pan }
            activeGesture = 'pinch'
            setIsPanning(true)
            updateCursor()
          }
          event.preventDefault()
          return
        }
        if (isEmptyCanvasTarget(el, event.target)) {
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
            setIsPanning(false)
            cancelLongPress()
          }, 500)
        }
      }
      if (activePointerId !== null) return
      const isEmptyCanvas = isEmptyCanvasTarget(el, event.target)
      if (event.button === 0 && isZHeld && isEmptyCanvas) {
        event.preventDefault()
        activePointerId = event.pointerId
        activeGesture = 'zoom-region'
        lastX = event.clientX
        lastY = event.clientY
        gestureStart = viewportPoint(el, event)
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
      if (event.button === 0 && event.shiftKey && isEmptyCanvas) {
        event.preventDefault()
        useWidgetStore.getState().closeContextMenu()
        activePointerId = event.pointerId
        activeGesture = 'select'
        lastX = event.clientX
        lastY = event.clientY
        gestureStart = viewportPoint(el, event)
        latestPoint = gestureStart
        hasPassedThreshold = false
        selectionBox = document.createElement('div')
        selectionBox.setAttribute('aria-hidden', 'true')
        selectionBox.className =
          'pointer-events-none absolute left-0 top-0 z-30 rounded-xl border border-emerald-300/70 bg-emerald-400/[0.08] shadow-[0_0_0_1px_rgba(163,230,53,0.14),0_10px_36px_rgba(0,0,0,0.12)] will-change-transform'
        applySelectionBox(selectionBox, gestureStart, gestureStart)
        selectionBadge = document.createElement('span')
        selectionBadge.className = 'absolute -right-2 -top-7 rounded-full bg-emerald-300 px-2 py-0.5 font-mono text-[10px] font-bold text-neutral-950 shadow-lg'
        selectionBadge.textContent = '0'
        selectionBox.appendChild(selectionBadge)
        el.appendChild(selectionBox)
        el.setPointerCapture(event.pointerId)
        updateCursor()
        return
      }

      const isPanGesture =
        event.button === 1 ||
        (event.button === 0 && (isSpaceHeld || isEmptyCanvas))
      if (!isPanGesture) return
      event.preventDefault()
      useWidgetStore.getState().closeContextMenu()
      activePointerId = event.pointerId
      activeGesture = 'pan'
      lastX = event.clientX
      lastY = event.clientY
      el.setPointerCapture(event.pointerId)
      setIsPanning(true)
      updateCursor()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
        touches.set(event.pointerId, viewportPoint(el, event))
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
          useCanvasStore.getState().setView(
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
        latestPoint = viewportPoint(el, event)
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

      pendingPanX += event.clientX - lastX
      pendingPanY += event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      if (panRafId === 0) panRafId = requestAnimationFrame(flushPan)
    }

    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        touches.delete(event.pointerId)
        cancelLongPress()
        if (activeGesture === 'pinch') {
          pinchStart = null
          const remaining = [...touches.entries()][0]
          if (remaining) {
            activeGesture = 'pan'
            activePointerId = remaining[0]
            const rect = el.getBoundingClientRect()
            lastX = remaining[1].x + rect.left
            lastY = remaining[1].y + rect.top
            updateCursor()
            return
          }
          activeGesture = null
          activePointerId = null
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

      // Flush any accumulated pan delta before tearing down the gesture.
      if (panRafId !== 0) {
        cancelAnimationFrame(panRafId)
        panRafId = 0
      }
      flushPan()

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
      isSpaceHeld = false
      activePointerId = null
      activeGesture = null
      gestureStart = null
      latestPoint = null
      hasPassedThreshold = false
      selectionBox?.remove()
      selectionBox = null
      selectionBadge = null
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

    return () => {
      if (panRafId !== 0) cancelAnimationFrame(panRafId)
      cancelLongPress()
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerEnd)
      el.removeEventListener('pointercancel', onPointerEnd)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [viewportRef])
}
