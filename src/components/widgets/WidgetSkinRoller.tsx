import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { haptic } from '../../utils/haptics'
import type { WidgetSkinOption } from '../../widgets/contracts/registry'
import {
  DRUM_RADIUS,
  ROW_HEIGHT,
  indexForOffset,
  isPastEnd,
  placeRow,
  resistOffset,
  settledOffset,
  stepSettle,
  wheelSteps,
} from './skinRollerGeometry'

interface WidgetSkinRollerProps {
  /** The skin the card is wearing; the drum opens on it. */
  currentValue: string
  skins: readonly WidgetSkinOption[]
  /** Called once, when a skin is committed. Nothing is applied while rolling. */
  onCommit: (value: string) => void
  onClose: () => void
  /** The card's title row — the drum opens over it, at its exact position. */
  anchorRef: { current: HTMLElement | null }
  /**
   * The icon slot on the title capsule. When a skin is committed, the chosen
   * row's icon glides back into this element, so the drum hands its one
   * surviving piece to the card rather than vanishing around it.
   */
  iconHomeRef?: { current: HTMLElement | null }
}

/**
 * Pointer travel, in pixels, below which a press is a click rather than a
 * drag. A mouse always jitters a pixel or two between press and release, so
 * this is the only thing separating "I clicked this skin" from "I nudged the
 * drum" — and once a press has passed it, that press can never become a click,
 * however far the drum is dragged back.
 */
const TAP_SLOP = 4

/** How long the drum takes to unfurl from the title, and to close again. */
const OPEN_MS = 260
const CLOSE_MS = 300

/** The chosen label bows out faster than the icon flies, so the icon lands alone. */
const LABEL_FADE_MS = 170

/** The blur worn by rows dissolving away while the drum closes. */
const CLOSING_BLUR = 5

/** The longest a row's fade-in waits behind the lane's, during the unfurl. */
const ROW_STAGGER_MS = 120

/** How long to wait for animation frames before opening without the unfurl. */
const UNFURL_RESCUE_MS = 200

/** The icon tile's own CSS size (h-9 w-9); its on-screen rect divided by this
 * is exactly how much the drum's 3D projection is magnifying it. */
const ICON_TILE = 36

/** The class that softens everything behind the drum. */
const BLUR_CLASS = 'gp-skin-roller-behind'

interface Anchor {
  left: number
  centreY: number
  /** The title row's own height — what the chosen row shrinks back into. */
  height: number
}

/**
 * The skin chooser. It does not open a panel anywhere: the card's own title
 * grows in place into a rolling drum of skins, and everything else on screen
 * is blurred — not darkened — so the board stays visible but out of the way.
 *
 * Drag it and it follows the pointer, then snaps to the nearest skin. Scroll
 * it and it steps one skin at a time. A single click puts the skin in the lane
 * on the widget and closes: the chosen label fades, its icon glides back into
 * the title capsule's icon slot, every other row dissolves out of focus, and
 * the board sharpens. Escape leaves without changing anything.
 */
export function WidgetSkinRoller({
  currentValue,
  skins,
  onCommit,
  onClose,
  anchorRef,
  iconHomeRef,
}: WidgetSkinRollerProps) {
  const reducedMotion = useAdaptiveInputStore((state) => state.capabilities.reducedMotion)
  const count = skins.length
  const startIndex = Math.max(0, skins.findIndex((skin) => skin.value === currentValue))

  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [offset, setOffset] = useState(startIndex * ROW_HEIGHT)
  // 'folded' is the one painted frame where the drum is still title-sized;
  // 'opening' is the unfurl in flight. Once 'open', every transition comes
  // off the rows so fast rolling paints instantly instead of trailing a
  // fade that was only ever meant for the unfurl.
  const [phase, setPhase] = useState<'folded' | 'opening' | 'open' | 'closing'>('folded')
  const closing = phase === 'closing'
  // Where the chosen icon must fly to land on the title capsule's icon slot,
  // measured at commit time in the drum's own (projected) coordinate space.
  const [flight, setFlight] = useState<{ dx: number; dy: number; scale: number } | null>(null)
  const listId = useId()

  // Live values the animation frame and pointer handlers read without
  // re-subscribing: keeping them in refs is what lets the drum follow the
  // pointer continuously instead of one React commit behind it.
  const offsetRef = useRef(offset)
  const targetRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const detentRef = useRef(startIndex)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startOffset: number
    moved: number
    /** Latches once the press passes the slop; a drag never becomes a click. */
    dragging: boolean
    /** The row pressed, captured at press time rather than at release. */
    pressedIndex: number | null
  } | null>(null)
  const wheelBankRef = useRef(0)
  const closeTimerRef = useRef<number | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  useOverlayLifecycle(true)

  const activeIndex = indexForOffset(offset, count)

  // Measure the title row so the drum's lane opens exactly where the title
  // already is, rather than somewhere the eye has to find again.
  useEffect(() => {
    const element = anchorRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    setAnchor({ left: rect.left, centreY: rect.top + rect.height / 2, height: rect.height })
    surfaceRef.current?.focus({ preventScroll: true })
  }, [anchorRef])

  // Start the unfurl — but only once the browser has actually painted the
  // folded, title-sized frame. A CSS transition animates from the last
  // *painted* state, so a timeout is not enough here: it can fire before that
  // first frame reaches the screen, and then the drum simply appears at full
  // size with no animation at all. Two nested animation frames guarantee the
  // folded frame has been shown, which is what gives the unfurl something to
  // grow from.
  useEffect(() => {
    if (!anchor || phase !== 'folded') return
    if (reducedMotion) {
      setPhase('open')
      return
    }
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPhase('opening'))
    })
    // If frames are not being served at all — a throttled or hidden tab —
    // open anyway rather than leaving the drum stranded at title size. The
    // cost is a missing animation; the cost of waiting would be a dead drum.
    const rescue = window.setTimeout(() => setPhase('opening'), UNFURL_RESCUE_MS)
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      window.clearTimeout(rescue)
    }
  }, [anchor, phase, reducedMotion])

  // Once the unfurl and its longest row stagger have played out, drop into
  // 'open' so the rows shed their transitions and roll frame-for-frame.
  useEffect(() => {
    if (phase !== 'opening') return
    const settle = window.setTimeout(() => setPhase('open'), OPEN_MS + ROW_STAGGER_MS)
    return () => window.clearTimeout(settle)
  }, [phase])

  // Blur the app behind the drum, and — just as important — stop it receiving
  // any mouse input while the drum is up. The class goes on the app root, so
  // this overlay, portalled outside it, stays sharp and live. It comes off the
  // moment closing starts, so the board sharpens as the drum folds away.
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    if (closing) {
      root.classList.remove(BLUR_CLASS)
      return
    }
    root.classList.add(BLUR_CLASS)
    return () => root.classList.remove(BLUR_CLASS)
  }, [closing])

  /** Writes a new drum position and reports any detent crossed on the way. */
  const applyOffset = useCallback((next: number) => {
    offsetRef.current = next
    setOffset(next)
    const landed = indexForOffset(next, count)
    if (landed !== detentRef.current) {
      detentRef.current = landed
      haptic('detent')
    }
  }, [count])

  /** Runs the settle spring until the drum reaches its resting row. */
  const startSettle = useCallback((target: number) => {
    targetRef.current = target
    if (reducedMotion) {
      applyOffset(target)
      targetRef.current = null
      return
    }
    if (frameRef.current !== null) return
    lastFrameRef.current = performance.now()
    const tick = (now: number) => {
      const elapsed = Math.min(64, now - lastFrameRef.current)
      lastFrameRef.current = now
      const goal = targetRef.current
      if (goal === null) {
        frameRef.current = null
        return
      }
      const next = stepSettle(offsetRef.current, goal, elapsed)
      applyOffset(next)
      if (next === goal) {
        targetRef.current = null
        frameRef.current = null
        return
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [applyOffset, reducedMotion])

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  const rollTo = useCallback((index: number) => {
    const clamped = Math.min(count - 1, Math.max(0, index))
    if (index !== clamped && clamped === indexForOffset(offsetRef.current, count)) haptic('limit')
    startSettle(clamped * ROW_HEIGHT)
  }, [count, startSettle])

  /** Wear the skin in the lane, hand its icon back to the title, and leave. */
  const commit = useCallback(() => {
    if (closing) return
    const laneIndex = indexForOffset(offsetRef.current, count)
    const chosen = skins[laneIndex]
    if (chosen) onCommit(chosen.value)
    haptic('commit')
    if (reducedMotion) {
      onClose()
      return
    }
    // Measure the icon's flight home before the closing render. The deltas are
    // divided by the 3D projection's magnification (its on-screen size over
    // its CSS size), because the flight transform plays out inside the drum's
    // magnified plane while both rects were measured in screen pixels.
    const icon = document.getElementById(`${listId}-${laneIndex}`)?.querySelector('.gp-skin-roller-icon')
    const home = iconHomeRef?.current
    if (icon && home) {
      const from = icon.getBoundingClientRect()
      const to = home.getBoundingClientRect()
      if (from.width > 0 && to.width > 0) {
        const projection = from.width / ICON_TILE
        setFlight({
          dx: (to.left + to.width / 2 - (from.left + from.width / 2)) / projection,
          dy: (to.top + to.height / 2 - (from.top + from.height / 2)) / projection,
          scale: to.width / from.width,
        })
      }
    }
    setPhase('closing')
    closeTimerRef.current = window.setTimeout(onClose, CLOSE_MS)
  }, [closing, skins, count, onCommit, onClose, reducedMotion, listId, iconHomeRef])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          onClose()
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          commit()
          break
        case 'ArrowDown':
          event.preventDefault()
          rollTo(indexForOffset(offsetRef.current, count) + 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          rollTo(indexForOffset(offsetRef.current, count) - 1)
          break
        case 'Home':
          event.preventDefault()
          rollTo(0)
          break
        case 'End':
          event.preventDefault()
          rollTo(count - 1)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commit, onClose, rollTo, count])

  const onPointerDown = (event: React.PointerEvent) => {
    // The drum is portalled to <body>, but in the React tree it is still a
    // child of the widget card — and React bubbles synthetic events through
    // the component tree, not the DOM. Without this, every press on the drum
    // reaches the card's own onPointerDown, which starts a card drag and
    // steals pointer capture mid-press, so the drum never sees the release:
    // clicks die and dragging the drum drags the widget behind the blur.
    event.stopPropagation()
    if (closing) return
    if (event.button !== 0 && event.pointerType === 'mouse') return
    targetRef.current = null
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    // The row under the press is remembered now, at press time: after a drag
    // the pointer may be released over a completely different row, and a
    // click must mean the thing that was pressed.
    const row = (event.target as Element | null)?.closest?.('[data-row-index]')
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: offsetRef.current,
      moved: 0,
      dragging: false,
      pressedIndex: row ? Number(row.getAttribute('data-row-index')) : null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    event.stopPropagation()
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const travel = event.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.abs(travel))
    // Below the slop the press is still a candidate click and the drum must
    // not move at all — otherwise a mouse's one-pixel jitter drags it. Past
    // the slop it is a drag for good, and the drum starts from where the
    // finger crossed that line so it does not jump by the slop distance.
    if (!drag.dragging) {
      if (drag.moved <= TAP_SLOP) return
      drag.dragging = true
      drag.startY = event.clientY
      drag.startOffset = offsetRef.current
      return
    }
    // Pulling down brings earlier skins into the lane, like a real barrel.
    const raw = drag.startOffset - (event.clientY - drag.startY)
    const next = resistOffset(raw, count)
    if (isPastEnd(next, count) && !isPastEnd(offsetRef.current, count)) haptic('limit')
    applyOffset(next)
  }

  const endDrag = (event: React.PointerEvent) => {
    event.stopPropagation()
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.dragging) {
      startSettle(settledOffset(offsetRef.current, count))
      return
    }
    // A press that never became a drag is a click. On the lane — or anywhere
    // off the drum — it takes the skin in the lane; on a row merely visible
    // above or below it rolls that one in, which is plainly what was meant.
    const clicked = drag.pressedIndex ?? activeIndex
    if (clicked !== activeIndex) rollTo(clicked)
    else commit()
  }

  const onWheel = (event: React.WheelEvent) => {
    event.stopPropagation()
    if (closing) return
    wheelBankRef.current += event.deltaY
    const { steps, remainder } = wheelSteps(wheelBankRef.current)
    wheelBankRef.current = remainder
    if (steps !== 0) rollTo(indexForOffset(offsetRef.current, count) + steps)
  }

  if (!anchor) {
    // One measuring pass with nothing painted: the drum must never appear
    // anywhere except on top of the title it belongs to.
    return null
  }

  // Folded, the drum is exactly the title row it grew out of; the unfurl
  // grows it to size. Closing never refolds it — the card's own icon and
  // title are already sitting underneath, so scaling a copy down over them
  // just doubles the image. Instead the drum dissolves in place and the one
  // travelling piece is the chosen icon, gliding back to its slot.
  const foldScale = anchor.height / ROW_HEIGHT
  const folded = phase === 'folded'
  const phaseMs = closing ? CLOSE_MS : OPEN_MS
  // Transitions exist for the unfurl and the close only. While the drum is
  // simply open, rows must paint their placement the frame it is computed —
  // a lingering fade is what made fast scrolling feel like the drum was
  // waiting to catch up.
  const animatingPhase = phase !== 'open'

  return createPortal(
    // The dialog covers the screen and owns every pointer and wheel event on
    // it, so while the drum is up the board underneath cannot be panned,
    // zoomed, selected, or dragged — there is nothing to aim at but the drum.
    <div
      ref={surfaceRef}
      role="listbox"
      aria-activedescendant={`${listId}-${activeIndex}`}
      aria-label="Choose a skin"
      aria-modal="true"
      tabIndex={-1}
      data-phase={phase}
      className="gp-skin-roller-surface fixed inset-0 z-[250] touch-none select-none outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    >
      <div
        className="gp-skin-roller-drum absolute"
        style={{
          left: anchor.left,
          top: anchor.centreY,
          width: 'min(340px, 70vw)',
          height: 0,
          transform: folded ? `scale(${foldScale})` : 'scale(1)',
          transformOrigin: 'left center',
          transition: reducedMotion || !animatingPhase || closing
            ? undefined
            : `transform ${OPEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          ...(reducedMotion
            ? null
            : { perspective: 620, perspectiveOrigin: '50% 50%', transformStyle: 'preserve-3d' as const }),
        }}
      >
        {skins.map((skin, index) => {
          const place = placeRow(index, offset)
          if (place.hidden) return null
          const inLane = index === activeIndex
          const SkinIcon = skin.icon
          // Folded and closing, only the lane row is present. The rest fade
          // in as the drum unfurls and dissolve back out of it when it goes,
          // so a single title becomes a list and then a title again.
          const opacity = folded || closing ? (inLane ? 1 : 0) : place.opacity
          // Softening at the drum's ends, and a deeper softening on the rows
          // dissolving away as it closes. Inline, because it has to beat
          // the row's resting drop-shadow rather than stack with it.
          const blur = closing && !inLane ? CLOSING_BLUR : place.blur
          return (
            <div
              key={skin.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={inLane}
              data-in-lane={inLane || undefined}
              data-row-index={index}
              className="gp-skin-roller-row absolute left-0 top-0 flex w-full items-center gap-3"
              style={{
                height: ROW_HEIGHT,
                marginTop: -ROW_HEIGHT / 2,
                opacity,
                zIndex: place.zIndex,
                color: skin.accent,
                transform: reducedMotion
                  ? `translateY(${place.translateY}px)`
                  : `rotateX(${place.rotateX}deg) translateZ(${DRUM_RADIUS}px)`,
                // Rows nearest the lane lead the way in; the close plays as
                // one chord, with the deeper blur easing in alongside the
                // fade. No transition at all while open — see animatingPhase.
                transition: reducedMotion || !animatingPhase
                  ? undefined
                  : `opacity ${phaseMs}ms ease-out ${closing ? 0 : Math.min(ROW_STAGGER_MS, Math.abs(index - activeIndex) * 28)}ms, filter ${phaseMs}ms ease-out`,
                filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
              }}
            >
              <span
                className="gp-skin-roller-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{
                  background: `${skin.accent}1c`,
                  boxShadow: `inset 0 0 0 1px ${skin.accent}30`,
                  // On commit, the chosen icon is the one piece that survives:
                  // it glides back to the title capsule's icon slot and lands
                  // exactly on the identical icon the card is now wearing.
                  // Without a measured home it simply fades with the rest.
                  ...(closing && inLane
                    ? flight
                      ? {
                          transform: `translate(${flight.dx}px, ${flight.dy}px) scale(${flight.scale})`,
                          transition: `transform ${CLOSE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                        }
                      : { opacity: 0, transition: `opacity ${CLOSE_MS}ms ease-out` }
                    : null),
                }}
              >
                <SkinIcon size={19} strokeWidth={1.9} aria-hidden />
              </span>
              <span
                className="gp-skin-roller-label min-w-0 truncate text-[19px] font-bold tracking-[-0.02em]"
                // The chosen label does not travel with its icon: it bows out
                // quickly so the icon lands alone on the waiting title.
                style={
                  closing && inLane
                    ? { opacity: 0, transition: `opacity ${LABEL_FADE_MS}ms ease-out` }
                    : undefined
                }
              >
                {skin.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
