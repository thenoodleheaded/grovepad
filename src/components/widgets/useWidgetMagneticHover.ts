import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { magneticWidgetOffset } from '../../utils/widgetMagnetism'

interface PointerSample {
  clientX: number
  clientY: number
  pointerType: string
  buttons: number
  pressure: number
}

interface MotionState {
  currentX: number
  currentY: number
  targetX: number
  targetY: number
  hovered: boolean
  dragging: boolean
  rafId: number
  lastFrame: number
}

const SETTLE_EPSILON = 0.025

function supportsMagneticHover(sample: PointerSample): boolean {
  return (
    (sample.pointerType === 'mouse' || sample.pointerType === 'pen') &&
    sample.buttons === 0 &&
    sample.pressure <= 0.01 &&
    window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    document.documentElement.dataset.motion !== 'reduced' &&
    document.documentElement.dataset.magneticHover !== 'off' &&
    !document.body.hasAttribute('data-widget-dragging') &&
    !document.body.hasAttribute('data-widget-resizing')
  )
}

/**
 * iPad-style magnetic lift without React/store updates. At most one hovered
 * card gets a short rAF loop, and the loop stops as soon as it reaches target.
 */
export function useWidgetMagneticHover(
  cardRef: RefObject<HTMLElement | null>,
  layoutRef: RefObject<HTMLDivElement | null>,
  disabled: boolean,
) {
  const motion = useRef<MotionState>({
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0,
    hovered: false,
    dragging: false,
    rafId: 0,
    lastFrame: 0,
  })

  const finishAtRest = useCallback(() => {
    const card = cardRef.current
    const layout = layoutRef.current
    if (card) {
      card.style.removeProperty('translate')
      card.removeAttribute('data-magnetic-active')
    }
    layout?.removeAttribute('data-magnetic-hover')
    layout?.removeAttribute('data-magnetic-drag')
  }, [cardRef, layoutRef])

  const cancelFrame = useCallback(() => {
    if (motion.current.rafId !== 0) cancelAnimationFrame(motion.current.rafId)
    motion.current.rafId = 0
    motion.current.lastFrame = 0
  }, [])

  const resetImmediately = useCallback(() => {
    cancelFrame()
    motion.current.currentX = 0
    motion.current.currentY = 0
    motion.current.targetX = 0
    motion.current.targetY = 0
    motion.current.hovered = false
    motion.current.dragging = false
    finishAtRest()
  }, [cancelFrame, finishAtRest])

  const schedule = () => {
    if (motion.current.rafId !== 0) return
    cardRef.current?.setAttribute('data-magnetic-active', 'true')
    motion.current.rafId = requestAnimationFrame(step)
  }

  const step = (now: number) => {
    const state = motion.current
    state.rafId = 0
    const card = cardRef.current
    if (!card) return

    const elapsed = state.lastFrame === 0 ? 1 / 60 : Math.min((now - state.lastFrame) / 1000, 0.05)
    state.lastFrame = now
    const response = state.hovered ? 24 : 18
    const blend = 1 - Math.exp(-response * elapsed)
    state.currentX += (state.targetX - state.currentX) * blend
    state.currentY += (state.targetY - state.currentY) * blend

    const remaining = Math.hypot(state.targetX - state.currentX, state.targetY - state.currentY)
    if (remaining <= SETTLE_EPSILON) {
      state.currentX = state.targetX
      state.currentY = state.targetY
    }
    card.style.translate = `${state.currentX.toFixed(2)}px ${state.currentY.toFixed(2)}px`

    if (remaining > SETTLE_EPSILON) {
      state.rafId = requestAnimationFrame(step)
      return
    }

    state.lastFrame = 0
    card.removeAttribute('data-magnetic-active')
    if (!state.hovered) finishAtRest()
  }

  const updateTarget = (sample: PointerSample) => {
    // Pointer capture can emit enter while the button is still held. Keep the
    // existing visual offset frozen; the wrapper's canonical drag transform
    // is already following the pointer.
    if (motion.current.dragging) {
      motion.current.hovered = true
      return
    }
    if (disabled || !supportsMagneticHover(sample)) {
      resetImmediately()
      return
    }
    const card = cardRef.current
    const layout = layoutRef.current
    if (!card || !layout) return
    // Measure the unmoved wrapper, not the translated card, so the visual
    // response can never feed back into its own pointer geometry.
    const rect = layout.getBoundingClientRect()
    const target = magneticWidgetOffset(rect, { x: sample.clientX, y: sample.clientY })
    motion.current.hovered = true
    motion.current.targetX = target.x
    motion.current.targetY = target.y
    layout.setAttribute('data-magnetic-hover', 'true')
    schedule()
  }

  const leave = () => {
    const state = motion.current
    if (!state.hovered) return
    state.hovered = false
    // A captured pointer may leave the card while dragging. Remember that it
    // is outside, but do not pull the visual card away from the grab point.
    if (state.dragging) return
    state.targetX = 0
    state.targetY = 0
    layoutRef.current?.removeAttribute('data-magnetic-hover')
    schedule()
  }



  /**
   * Pin the card where it currently sits. A press must never be invalidated
   * by decorative motion: while the magnetic offset is still easing toward
   * its target, a control under the cursor slides away between pointerdown
   * and pointerup, the two land on different elements, and the browser fires
   * `click` on their common ancestor — so the button silently does nothing.
   * Freezing on press keeps whatever is under the finger under the finger.
   */
  const freeze = useCallback(() => {
    const state = motion.current
    if (!state.hovered && state.rafId === 0) return
    cancelFrame()
    state.targetX = state.currentX
    state.targetY = state.currentY
    cardRef.current?.removeAttribute('data-magnetic-active')
  }, [cancelFrame, cardRef])

  const beginDrag = () => {
    const state = motion.current
    // Touch, coarse pointers, reduced motion, and a direct press that did not
    // originate from magnetic hover use the ordinary drag path unchanged.
    if (disabled || !state.hovered) {
      resetImmediately()
      return
    }
    cancelFrame()
    state.dragging = true
    // Preserve currentX/currentY exactly. The outer layout wrapper will move
    // by pointer deltas, so this local offset stays locked beneath the grab.
    const card = cardRef.current
    const layout = layoutRef.current
    if (!card || !layout) return
    card.style.translate = `${state.currentX.toFixed(2)}px ${state.currentY.toFixed(2)}px`
    card.setAttribute('data-magnetic-active', 'true')
    layout.setAttribute('data-magnetic-hover', 'true')
    layout.setAttribute('data-magnetic-drag', 'true')
  }

  /**
   * Hold the lift exactly where it sits for the length of a gesture that is
   * not a move — resizing, above all. Resetting instead snapped the card back
   * to its unlifted position the moment a scale began, so the thing being
   * scaled jumped out from under the pointer before it grew.
   *
   * Shares `dragging` with the move path deliberately: both mean "a gesture
   * owns this card now, so stop steering the offset from pointer position".
   */
  const hold = () => {
    const state = motion.current
    if (disabled || !state.hovered) return
    cancelFrame()
    state.dragging = true
    const card = cardRef.current
    if (!card) return
    card.style.translate = `${state.currentX.toFixed(2)}px ${state.currentY.toFixed(2)}px`
    card.setAttribute('data-magnetic-active', 'true')
  }

  const endDrag = (sample?: PointerSample) => {
    const state = motion.current
    if (!state.dragging) return
    state.dragging = false
    layoutRef.current?.removeAttribute('data-magnetic-drag')
    if (state.hovered && sample) {
      updateTarget(sample)
      return
    }
    state.hovered = false
    state.targetX = 0
    state.targetY = 0
    layoutRef.current?.removeAttribute('data-magnetic-hover')
    schedule()
  }

  useEffect(() => {
    if (disabled) resetImmediately()
    const onPreferences = () => {
      if (
        document.documentElement.dataset.motion === 'reduced' ||
        document.documentElement.dataset.magneticHover === 'off'
      ) {
        resetImmediately()
      }
    }
    window.addEventListener('gp-settings-preferences', onPreferences)
    return () => {
      window.removeEventListener('gp-settings-preferences', onPreferences)
      resetImmediately()
    }
  }, [disabled, resetImmediately])

  return {
    enter: updateTarget,
    move: updateTarget,
    leave,
    beginDrag,
    endDrag,
    freeze,
    hold,
    release: endDrag,
    suspend: resetImmediately,
  }
}
