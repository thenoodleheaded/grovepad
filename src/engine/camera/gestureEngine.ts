import { screenToWorld, type Vector2D } from '../../types/spatial'
import { resolveCanvasPointerIntent } from '../../utils/canvasGesturePolicy'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useCollaborationStore } from '../../store/useCollaborationStore'
import { useFocusStore } from '../../store/useFocusStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { cameraEngine } from './cameraEngine'
import { flingVelocity, trimSamples, type TimedPoint } from './glidePhysics'

// ---------------------------------------------------------------------------
// Gesture engine (canvas engine contract §1): every input that moves the
// camera, plus the empty-canvas marquee gestures that share the surface.
//
// - pinch / Ctrl(Cmd)+wheel → zoom centered on the cursor/midpoint
// - plain wheel / trackpad  → two-axis pan
// - middle-click drag       → pan
// - Space + left drag       → pan
// - left drag on empty canvas → pan (Navigate) or marquee select (Select/Shift)
// - Z + left drag           → zoom-to-region
// - touch: one finger pans per mode, two fingers pinch, release flings
//
// Camera writes go straight to cameraEngine — one transform write per event,
// nothing else on the hot path. Marquee boxes are imperative DOM, never React.
// ---------------------------------------------------------------------------

const WHEEL_ZOOM_FACTOR = 0.0022
const WHEEL_LINE_PX = 16
const DRAG_THRESHOLD = 4

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

function isEmptyCanvasTarget(root: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target === root) return true
  return !target.closest(
    'article, [data-widget-id], [data-group-id], [data-canvas-ui], button, input, textarea, select, [contenteditable="true"], [role="dialog"], svg [data-edge]',
  )
}

function normalizeWheelDelta(event: WheelEvent): Vector2D {
  const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_PX : 1
  return { x: event.deltaX * scale, y: event.deltaY * scale }
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function applySelectionBox(box: HTMLDivElement, start: Vector2D, current: Vector2D): void {
  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  box.style.transform = `translate3d(${x}px, ${y}px, 0)`
  box.style.width = `${Math.abs(start.x - current.x)}px`
  box.style.height = `${Math.abs(start.y - current.y)}px`
}

export function attachCanvasGestures(el: HTMLElement): () => void {
  let viewportOrigin = { x: 0, y: 0 }
  const refreshOrigin = () => {
    const rect = el.getBoundingClientRect()
    viewportOrigin = { x: rect.left, y: rect.top }
  }
  refreshOrigin()

  const viewportPoint = (event: PointerEvent | MouseEvent): Vector2D => ({
    x: event.clientX - viewportOrigin.x,
    y: event.clientY - viewportOrigin.y,
  })

  let activeGesture: ActiveGesture = null
  let activePointerId: number | null = null
  let lastX = 0
  let lastY = 0
  let gestureStart: Vector2D | null = null
  let latestPoint: Vector2D | null = null
  let hasPassedThreshold = false
  let selectionBox: HTMLDivElement | null = null
  let selectionBadge: HTMLSpanElement | null = null
  let isSpaceHeld = false
  let isZHeld = false

  const touches = new Map<number, Vector2D>()
  let pinchStart: { distance: number; midpoint: Vector2D; zoom: number; pan: Vector2D } | null = null
  let panSamples: TimedPoint[] = []
  let longPressTimer: number | null = null
  let longPressStart: Vector2D | null = null

  const setIsPanning = (value: boolean) => useCanvasStore.getState().setIsPanning(value)

  const updateCursor = () => {
    if (activeGesture === 'pan') el.style.cursor = 'grabbing'
    else if (activeGesture === 'zoom-region') el.style.cursor = 'zoom-in'
    else if (isSpaceHeld) el.style.cursor = 'grab'
    else if (isZHeld) el.style.cursor = 'zoom-in'
    else el.style.cursor = ''
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
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    }
  }

  const onWheel = (event: WheelEvent) => {
    // The wheel always drives the camera — over widget content, inputs,
    // textareas, everywhere — the same convention as Figma/Miro/design
    // tools generally: a canvas full of cards is not a scrollable page, and
    // an unfocused text field is not a scroll target. Only an ACTIVELY
    // FOCUSED editable region (focus mode) or a followed collaborator's
    // locked camera opt out.
    if (useFocusStore.getState().focusedWidgetId) return
    if (useCollaborationStore.getState().followingClientId !== null) return
    event.preventDefault()
    const delta = normalizeWheelDelta(event)
    if (event.ctrlKey || event.metaKey) {
      // Trackpad pinch arrives as ctrlKey+wheel; mouse users hold Ctrl/Cmd.
      const factor = Math.exp(-delta.y * WHEEL_ZOOM_FACTOR)
      cameraEngine.zoomAtPoint(cameraEngine.getFrame().zoom * factor, viewportPoint(event))
    } else {
      cameraEngine.panBy({ x: -delta.x, y: -delta.y })
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    cameraEngine.interrupt()
    if (useFocusStore.getState().focusedWidgetId) return
    const followingCollaborator = useCollaborationStore.getState().followingClientId !== null
    if (followingCollaborator && event.pointerType === 'touch') return
    refreshOrigin()

    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, viewportPoint(event))
      el.setPointerCapture(event.pointerId)
      if (touches.size === 2) {
        cancelLongPress()
        panSamples = []
        const pair = touchPair()
        if (pair) {
          const { pan, zoom } = cameraEngine.getFrame()
          pinchStart = { ...pair, zoom, pan }
          activeGesture = 'pinch'
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
          setIsPanning(false)
          cancelLongPress()
        }, 500)
      }
    }

    if (activePointerId !== null) return
    const intent = resolveCanvasPointerIntent({
      button: event.button,
      pointerType: event.pointerType,
      interactionMode: useAdaptiveInputStore.getState().interactionMode,
      isEmptyCanvas: isEmptyCanvasTarget(el, event.target),
      isSpaceHeld,
      isZHeld,
      isShiftHeld: event.shiftKey,
    })
    if (followingCollaborator && (intent === 'pan' || intent === 'zoom-region')) return

    if (intent === 'select' || intent === 'zoom-region') {
      event.preventDefault()
      useWidgetStore.getState().closeContextMenu()
      activePointerId = event.pointerId
      activeGesture = intent
      lastX = event.clientX
      lastY = event.clientY
      gestureStart = viewportPoint(event)
      latestPoint = gestureStart
      hasPassedThreshold = false
      selectionBox = document.createElement('div')
      selectionBox.setAttribute('aria-hidden', 'true')
      selectionBox.className =
        intent === 'select'
          ? 'pointer-events-none absolute left-0 top-0 z-30 rounded-xl border border-emerald-300/70 bg-emerald-400/[0.08] shadow-[0_0_0_1px_rgba(163,230,53,0.14),0_10px_36px_rgba(0,0,0,0.12)] will-change-transform'
          : 'pointer-events-none absolute left-0 top-0 z-30 rounded-lg border border-violet-300/80 bg-violet-400/10 shadow-[0_0_24px_rgba(167,139,250,.18)] will-change-transform'
      applySelectionBox(selectionBox, gestureStart, gestureStart)
      if (intent === 'select') {
        selectionBadge = document.createElement('span')
        selectionBadge.className =
          'absolute -right-2 -top-7 rounded-full bg-emerald-300 px-2 py-0.5 text-[10px] font-bold text-neutral-950 shadow-lg'
        selectionBadge.textContent = '0'
        selectionBox.appendChild(selectionBadge)
      }
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
    lastX = event.clientX
    lastY = event.clientY
    el.setPointerCapture(event.pointerId)
    setIsPanning(true)
    panSamples = [{ x: event.clientX, y: event.clientY, time: event.timeStamp }]
    updateCursor()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
      touches.set(event.pointerId, viewportPoint(event))
      if (longPressStart && Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y) > 8) {
        cancelLongPress()
      }
      if (activeGesture === 'pinch' && pinchStart) {
        event.preventDefault()
        const pair = touchPair()
        if (!pair) return
        const nextZoom = pinchStart.zoom * (pair.distance / pinchStart.distance)
        const worldAtStart = {
          x: (pinchStart.midpoint.x - pinchStart.pan.x) / pinchStart.zoom,
          y: (pinchStart.midpoint.y - pinchStart.pan.y) / pinchStart.zoom,
        }
        cameraEngine.setView(
          {
            x: pair.midpoint.x - worldAtStart.x * nextZoom,
            y: pair.midpoint.y - worldAtStart.y * nextZoom,
          },
          nextZoom,
        )
        return
      }
    }
    if (event.pointerId !== activePointerId) return

    if (activeGesture === 'select' || activeGesture === 'zoom-region') {
      latestPoint = viewportPoint(event)
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
        const { pan, zoom } = cameraEngine.getFrame()
        const a = screenToWorld(gestureStart, { x: pan.x, y: pan.y, zoom })
        const b = screenToWorld(latestPoint, { x: pan.x, y: pan.y, zoom })
        const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
        const state = useWidgetStore.getState()
        selectionBadge.textContent = String(
          Object.values(state.widgets).filter(
            (widget) =>
              widget.canvasId === state.activeCanvasId &&
              intersects(rect, { x: widget.position.x, y: widget.position.y, width: widget.size.width, height: widget.size.height }),
          ).length,
        )
      }
      return
    }

    if (activeGesture !== 'pan') return
    cameraEngine.panBy({ x: event.clientX - lastX, y: event.clientY - lastY })
    lastX = event.clientX
    lastY = event.clientY
    panSamples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp })
    trimSamples(panSamples, event.timeStamp)
  }

  const onPointerEnd = (event: PointerEvent) => {
    const flingCandidate =
      event.type === 'pointerup' && activeGesture === 'pan' && touches.size <= 1
    if (flingCandidate) {
      // A finger can stop before it lifts without another move event —
      // record the release so a pause reads as zero recent velocity.
      panSamples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp })
    }

    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId)
      cancelLongPress()
      if (activeGesture === 'pinch') {
        pinchStart = null
        const remaining = [...touches.entries()][0]
        if (remaining) {
          activeGesture = 'pan'
          activePointerId = remaining[0]
          lastX = remaining[1].x + viewportOrigin.x
          lastY = remaining[1].y + viewportOrigin.y
          panSamples = [{ x: lastX, y: lastY, time: event.timeStamp }]
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
      const { pan, zoom } = cameraEngine.getFrame()
      const worldA = screenToWorld(gestureStart, { x: pan.x, y: pan.y, zoom })
      const worldB = screenToWorld(latestPoint, { x: pan.x, y: pan.y, zoom })
      const selectionRect = {
        x: Math.min(worldA.x, worldB.x),
        y: Math.min(worldA.y, worldB.y),
        width: Math.abs(worldA.x - worldB.x),
        height: Math.abs(worldA.y - worldB.y),
      }
      const state = useWidgetStore.getState()
      const selected = new Set(state.selectedIds)
      for (const widget of Object.values(state.widgets)) {
        if (
          widget.canvasId === state.activeCanvasId &&
          intersects(selectionRect, { x: widget.position.x, y: widget.position.y, width: widget.size.width, height: widget.size.height })
        ) {
          selected.add(widget.id)
        }
      }
      state.selectWidgets([...selected])
    } else if (activeGesture === 'zoom-region' && gestureStart && latestPoint && hasPassedThreshold) {
      const { pan, zoom } = cameraEngine.getFrame()
      const worldA = screenToWorld(gestureStart, { x: pan.x, y: pan.y, zoom })
      const worldB = screenToWorld(latestPoint, { x: pan.x, y: pan.y, zoom })
      useCanvasStore.getState().fitRect(
        {
          x: Math.min(worldA.x, worldB.x),
          y: Math.min(worldA.y, worldB.y),
          width: Math.abs(worldA.x - worldB.x),
          height: Math.abs(worldA.y - worldB.y),
        },
        24,
      )
    }

    const shouldFling = flingCandidate && event.pointerType === 'touch'
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
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
    setIsPanning(false)
    if (shouldFling) cameraEngine.glide(flingVelocity(panSamples))
    panSamples = []
    updateCursor()
  }

  const onMouseDown = (event: MouseEvent) => {
    // pointerdown's preventDefault does not stop middle-click autoscroll.
    if (event.button === 1) event.preventDefault()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return
    if (event.code === 'Space' && !event.repeat) {
      isSpaceHeld = true
      updateCursor()
    }
    if (event.key.toLowerCase() === 'z' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      isZHeld = true
      updateCursor()
    }
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      isSpaceHeld = false
      updateCursor()
    }
    if (event.key.toLowerCase() === 'z') {
      isZHeld = false
      updateCursor()
    }
  }
  const onWindowBlur = () => {
    isSpaceHeld = false
    isZHeld = false
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
  window.addEventListener('resize', refreshOrigin)

  return () => {
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerEnd)
    el.removeEventListener('pointercancel', onPointerEnd)
    el.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onWindowBlur)
    window.removeEventListener('resize', refreshOrigin)
    selectionBox?.remove()
    cancelLongPress()
  }
}
