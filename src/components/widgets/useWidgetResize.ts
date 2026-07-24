import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { getLiveWidgetSizing, mergeWidgetSizing } from '../../store/liveWidgetSizing'
import { beginWidgetSizingGesture, endWidgetSizingGesture } from '../../store/widgetSizingGesture'
import type { Size, Widget } from '../../types/spatial'
import {
  outwardGrowth,
  RESIZE_BAND_PX,
  RESIZE_CORNER_PX,
  resizeEdgeAt,
  resizeEdgeCursor,
  resizeEdgeKey,
  sameResizeEdge,
  type ResizeEdge,
} from '../../utils/widgetResizeEdge'
import {
  clampIconEdge,
  crushesToIcon,
  elasticOvershoot,
  fullWidgetResizeBounds,
  iconEscapesToFull,
} from '../../utils/widgetScale'
import { resizeAnomalies } from '../../utils/scaleDebugAnomalies'
import { useScaleDebugStore } from '../../store/useScaleDebugStore'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'
import { isFixedSizeWidget } from '../../widgets/contracts/registry'

// ---------------------------------------------------------------------------
// The widget's outline is its resize affordance. There is no corner grip:
// approaching any side thickens that stretch of border, approaching where two
// sides meet thickens both, and pressing there drags exactly those sides while
// the opposite ones stay pinned.
//
// What the drag *means* depends on what is on screen, and the three charters
// are deliberately different:
//
//   full card   free resizing inside the type's sizing window. Never changes
//               state — a card you are working in cannot be lost to a pull.
//   resting face  size is the content's business, so the gesture is state-only:
//               a deliberate diagonal crush turns the tile into an icon, and
//               anything else stretches a rubber band that snaps back.
//   icon        one continuously scalable square from 2×2 through 3×3 while
//               held, settling to the nearest of those whole-cell sizes only
//               on release. Past either end the band stretches; far past the
//               top it hands the widget back to its resting face.
// ---------------------------------------------------------------------------

/** Pointer travel before a press on an armed edge counts as a drag rather than
 * a click. Below this a resting tile still expands as if the outline had never
 * been touched. */
const ENGAGE_SLOP_PX = 3

/** Resting images scale as photographs: both edges stay inside these bounds. */
const REST_IMAGE_MIN_EDGE = 80
const REST_IMAGE_MAX_EDGE = 560

/** How far a resting tile's rubber band can travel, in world px. Small tiles
 * make a generous px budget read as an enormous proportional stretch, so the
 * painted scale is clamped as well. */
const REST_ELASTIC_PX = 18

/** Hard rails on the painted band. Whatever any charter computes, the card
 * never visibly leaves this range — the band is feedback, not a second size. */
const ELASTIC_SCALE_MIN = 0.78
const ELASTIC_SCALE_MAX = 1.22

type ResizeMode = 'full' | 'icon' | 'rest' | 'image'

interface ResizeState {
  pointerId: number
  edge: ResizeEdge
  mode: ResizeMode
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  engaged: boolean
  committed: boolean
  historyCaptured: boolean
  pending: Size | null
  disposeWindowListeners: () => void
}

interface ResizePointerSample {
  pointerId: number
  clientX: number
  clientY: number
}

export interface WidgetEdgeResizeOptions {
  /** Whether the widget is currently showing its resting face. */
  resting: boolean
  /** A resting image is a photograph: ratio-locked, and resizable at rest. */
  restingImage: boolean
  /** The box actually on screen right now — the resting tile when one shows. */
  effectiveSize: Size
  /** The card element. Hit-tested for outline proximity, and the surface the
   *  rubber band's transient scale is painted on. */
  elementRef: RefObject<HTMLElement | null>
  /** Called when a press on an armed edge ends without ever becoming a drag,
   *  so the outline never swallows a plain click. */
  onEdgeClick: () => void
  /** Whether this card is the one ephemerally expanded out of its resting
   *  face. An expanded card's asymmetry is absorbed by the view offset, never
   *  by its stored position, so folding it back lands on the original spot. */
  restExpanded: boolean
  /** Fires when the outline claims a press, and again when it lets go. Used to
   *  hold the magnetic lift still for the length of the gesture. */
  onGestureStart: () => void
  onGestureEnd: () => void
}

/** Owns the outline-proximity resize affordance and gesture for one card. */
export function useWidgetResize(
  widgetId: string,
  widget: Widget | undefined,
  options: WidgetEdgeResizeOptions,
) {
  const {
    resting,
    restingImage,
    effectiveSize,
    elementRef,
    onEdgeClick,
    restExpanded,
    onGestureStart,
    onGestureEnd,
  } = options
  const resizeRef = useRef<ResizeState | null>(null)
  const armedRef = useRef<ResizeEdge | null>(null)
  const [armedEdge, setArmedEdge] = useState<ResizeEdge | null>(null)

  const clearElastic = () => {
    const element = elementRef.current
    if (!element) return
    element.removeAttribute('data-elastic')
    element.removeAttribute('data-elastic-release')
    element.style.removeProperty('--gp-elastic-x')
    element.style.removeProperty('--gp-elastic-y')
    element.style.removeProperty('--gp-elastic-from-x')
    element.style.removeProperty('--gp-elastic-from-y')
    element.style.removeProperty('--gp-elastic-origin')
  }

  /** Let go of the band. A stretched card doesn't snap flat — it springs back
   * through a small counter-overshoot (the gp-elastic-release keyframes),
   * which is most of what makes the band read as rubber rather than as a
   * clamped scale. Runs on release AND on a mid-drag state commit, so the
   * card visibly recoils out of the stretch into its new state. */
  const releaseElastic = () => {
    const element = elementRef.current
    if (!element) return
    const fromX = element.style.getPropertyValue('--gp-elastic-x')
    const fromY = element.style.getPropertyValue('--gp-elastic-y')
    element.removeAttribute('data-elastic')
    element.style.removeProperty('--gp-elastic-x')
    element.style.removeProperty('--gp-elastic-y')
    const stretched =
      (fromX !== '' && Number.parseFloat(fromX) !== 1) ||
      (fromY !== '' && Number.parseFloat(fromY) !== 1)
    if (!stretched) return
    element.style.setProperty('--gp-elastic-from-x', fromX || '1')
    element.style.setProperty('--gp-elastic-from-y', fromY || '1')
    element.setAttribute('data-elastic-release', 'true')
    const done = (event: AnimationEvent) => {
      if (event.animationName !== 'gp-elastic-release') return
      element.removeEventListener('animationend', done)
      element.removeEventListener('animationcancel', done)
      element.removeAttribute('data-elastic-release')
      element.style.removeProperty('--gp-elastic-from-x')
      element.style.removeProperty('--gp-elastic-from-y')
    }
    element.addEventListener('animationend', done)
    element.addEventListener('animationcancel', done)
  }

  useEffect(() => () => {
    const resize = resizeRef.current
    clearElastic()
    // Unmounting mid-gesture must not leave the content floor suspended: the
    // card would never auto-fit its content again for the rest of the session.
    endWidgetSizingGesture(widgetId)
    if (!resize) return
    resize.disposeWindowListeners()
    document.body.removeAttribute('data-widget-dragging')
    document.body.removeAttribute('data-widget-resizing')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Whether this widget answers to the outline gesture at all. */
  const gestureAllowed = Boolean(
    widget &&
    !widget.metadata.locked &&
    // A content-driven card has nothing to resize, but its OTHER scale states
    // still answer to the outline: the resting tile can be crushed into an
    // icon, and the icon scales continuously and escapes back out. Those are
    // state changes, not sizes — blocking them left every fixed-size type's
    // icon completely deaf to the gesture.
    (
      !isFixedSizeWidget(widgetDefinition(widget.type).sizing, widget.data) ||
      resting ||
      widget.iconified === true
    ),
  )

  const arm = (next: ResizeEdge | null) => {
    if (sameResizeEdge(armedRef.current, next)) return
    armedRef.current = next
    setArmedEdge(next)
  }

  /** Hover tracking: the armed edge follows the pointer around the outline. */
  const onEdgeHoverMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!gestureAllowed || resizeRef.current) return
    const element = elementRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const zoom = useCanvasStore.getState().zoom || 1
    // Hit-test in the card's own unscaled coordinates so the band is the same
    // reachable thickness whatever the camera is doing.
    const local = { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom }
    const size = { width: rect.width / zoom, height: rect.height / zoom }
    // The band is specified in screen px, so convert it into the card's own
    // coordinates: the same physical reach whatever the camera is doing.
    arm(resizeEdgeAt(local, size, RESIZE_BAND_PX / zoom, RESIZE_CORNER_PX / zoom))
  }

  const onEdgeHoverLeave = () => {
    if (resizeRef.current) return
    arm(null)
  }

  const paintElastic = (scaleX: number, scaleY: number, edge: ResizeEdge) => {
    // The band rides the CARD, never the positioning wrapper. The wrapper's
    // world position lives in a `transform`, and a browser composes `transform`
    // *before* the independent `scale` property — so a scale set there resolves
    // about a point near the world origin instead of the card, and a card far
    // from (0,0) shoots off diagonally, further the further out it sits. The
    // card element carries no transform of its own, so its origin is local.
    //
    // Per-axis on purpose: a one-sided pull stretches only the axis being
    // pulled. Scaling both made every side drag balloon the whole card, which
    // is why the band never read as elastic.
    const element = elementRef.current
    if (!element) return
    // A fresh stretch supersedes any spring-back still animating.
    element.removeAttribute('data-elastic-release')
    element.style.removeProperty('--gp-elastic-from-x')
    element.style.removeProperty('--gp-elastic-from-y')
    const clampedX = Math.min(ELASTIC_SCALE_MAX, Math.max(ELASTIC_SCALE_MIN, scaleX))
    const clampedY = Math.min(ELASTIC_SCALE_MAX, Math.max(ELASTIC_SCALE_MIN, scaleY))
    // The band stretches away from the pinned sides, never out of the centre,
    // so the corner under the pointer is the one that visibly travels.
    const originX = edge.x === -1 ? '100%' : edge.x === 1 ? '0%' : '50%'
    const originY = edge.y === -1 ? '100%' : edge.y === 1 ? '0%' : '50%'
    // The attribute stays set for the whole gesture, even at scale 1 —
    // [data-elastic] is also what keeps transitions off so the band tracks
    // the pointer with zero lag.
    element.setAttribute('data-elastic', 'true')
    element.style.setProperty('--gp-elastic-x', clampedX.toFixed(4))
    element.style.setProperty('--gp-elastic-y', clampedY.toFixed(4))
    element.style.setProperty('--gp-elastic-origin', `${originX} ${originY}`)
  }

  const commitScaleState = (resize: ResizeState, target: 'full' | 'icon', fromSize: Size) => {
    resize.pending = null
    resize.committed = true
    if (!resize.historyCaptured) {
      useWidgetStore.getState().snapshotHistory()
      resize.historyCaptured = true
    }
    // The stretch recoils (spring, not snap) while the box glides to its new
    // state — together they are the elastic hand-off between scale states.
    releaseElastic()
    // A state change is a single terminal decision for this drag. Releasing
    // and starting a new gesture is required before another state can change.
    document.body.removeAttribute('data-widget-dragging')
    useWidgetStore.getState().setWidgetScaleState(widgetId, target, { skipHistory: true, fromSize })
  }

  /**
   * Apply a resized box with the pinned sides held still. An expanded card
   * pays for that with its view offset — its stored position must not move, or
   * folding it back would leave the resting tile somewhere it never was. Any
   * other card pays for it with its real position.
   */
  const applyAnchoredSize = (size: Size, edge: ResizeEdge, snap: boolean) => {
    const store = useWidgetStore.getState()
    if (!restExpanded) {
      store.resizeWidgetFromEdge(widgetId, size, edge, snap)
      return
    }
    const before = store.widgets[widgetId]
    if (!before) return
    store.resizeWidget(widgetId, size, snap)
    const after = useWidgetStore.getState().widgets[widgetId]
    if (!after) return
    useWidgetRestStore.getState().nudgeExpandedOffset({
      x: edge.x === -1 ? before.size.width - after.size.width : 0,
      y: edge.y === -1 ? before.size.height - after.size.height : 0,
    })
  }

  const resizeMode = (): ResizeMode => {
    if (widget?.iconified) return 'icon'
    if (restingImage) return 'image'
    if (resting) return 'rest'
    return 'full'
  }

  /** The edge under a press. Touch and pen never hover, so they get no chance
   * to arm one first — hit-test the press itself, with a band widened to the
   * platform's minimum touch target. */
  const edgeUnderPress = (e: ReactPointerEvent<HTMLElement>): ResizeEdge | null => {
    if (armedRef.current) return armedRef.current
    const element = elementRef.current
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const zoom = useCanvasStore.getState().zoom || 1
    const coarse = e.pointerType !== 'mouse'
    const band = (coarse ? RESIZE_BAND_PX * 2 : RESIZE_BAND_PX) / zoom
    return resizeEdgeAt(
      { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom },
      { width: rect.width / zoom, height: rect.height / zoom },
      band,
      (coarse ? RESIZE_CORNER_PX * 1.6 : RESIZE_CORNER_PX) / zoom,
    )
  }

  const onEdgePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!widget || !gestureAllowed) return false
    if (e.button !== 0) return false
    const edge = edgeUnderPress(e)
    if (!edge) return false
    e.stopPropagation()
    onGestureStart()
    // The pointer owns this widget's size from here until release: the content
    // floor's grow pass would otherwise re-inflate the card between frames and
    // the two would trade sizes at pointer speed (a visible flicker).
    beginWidgetSizingGesture(widgetId)
    useCanvasStore.getState().cancelViewAnimation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const mode = resizeMode()
    if (mode === 'icon') {
      // An icon is square and moves in both axes at once, so it wears the
      // diagonal cursor. (This also has to be one of the values the cursor
      // lock in 01-tokens-base.css knows: an unrecognised one matched no rule
      // and left the icon drag with no locked cursor at all.)
      document.body.setAttribute('data-widget-resizing', 'both')
    } else if (mode !== 'rest') {
      document.body.setAttribute(
        'data-widget-resizing',
        widgetDefinition(widget.type).sizing?.autoHeight ? 'width' : 'both',
      )
    }
    const move = (event: PointerEvent) => onResizePointerMove(event)
    const end = (event: PointerEvent) => onResizePointerEnd(event)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    resizeRef.current = {
      pointerId: e.pointerId,
      edge,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      // A resting tile's gesture is measured against the tile the user can
      // see, not the dormant full-card size hiding behind it.
      startWidth: mode === 'rest' ? effectiveSize.width : widget.size.width,
      startHeight: mode === 'rest' ? effectiveSize.height : widget.size.height,
      engaged: false,
      committed: false,
      historyCaptured: false,
      pending: null,
      disposeWindowListeners: () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
      },
    }
    return true
  }

  // Applies the proposed size the instant it's computed rather than queuing
  // behind a requestAnimationFrame first — the same zero-added-latency
  // reasoning as PointerDragSession.move(): a queued rAF only matters for
  // input firing faster than the display repaints, and that's exactly the
  // hardware where an extra frame of lag is most noticeable.
  const schedule = (resize: ResizeState, apply: (size: Size) => void) => {
    if (resize.pending) apply(resize.pending)
  }

  const onResizePointerMove = (e: ResizePointerSample) => {
    if (!widget) return
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== e.pointerId || resize.committed) return
    const zoom = useCanvasStore.getState().zoom || 1
    const screenDx = e.clientX - resize.startX
    const screenDy = e.clientY - resize.startY
    if (!resize.engaged) {
      if (Math.hypot(screenDx, screenDy) < ENGAGE_SLOP_PX) return
      resize.engaged = true
      if (resize.mode === 'full' || resize.mode === 'image' || resize.mode === 'icon') {
        useWidgetStore.getState().snapshotHistory()
        resize.historyCaptured = true
      }
      // Suppress the size transition while the outline is held so per-frame
      // updates track the pointer exactly (same trick as drags).
      document.body.setAttribute('data-widget-dragging', 'true')
    }
    const dx = screenDx / zoom
    const dy = screenDy / zoom
    const growth = outwardGrowth(resize.edge, dx, dy)

    if (resize.mode === 'rest') {
      // A resting tile is sized by its content, so the only thing this gesture
      // can decide is whether the widget should stop being a card at all.
      if (crushesToIcon(-growth.x, -growth.y)) {
        commitScaleState(resize, 'icon', { width: resize.startWidth, height: resize.startHeight })
        return
      }
      // Each pulled axis stretches against its own dimension; a pinned axis
      // stays flat. That is what makes a side pull read as pulling one side.
      const stretchAlong = (pull: number, base: number) => {
        const travel = elasticOvershoot(Math.abs(pull), REST_ELASTIC_PX)
        return (Math.max(1, base) + Math.sign(pull) * travel) / Math.max(1, base)
      }
      paintElastic(
        resize.edge.x === 0 ? 1 : stretchAlong(growth.x, resize.startWidth),
        resize.edge.y === 0 ? 1 : stretchAlong(growth.y, resize.startHeight),
        resize.edge,
      )
      return
    }

    if (resize.mode === 'icon') {
      const intentWidth = resize.edge.x === 0 ? resize.startWidth : resize.startWidth + growth.x
      const intentHeight = resize.edge.y === 0 ? resize.startHeight : resize.startHeight + growth.y
      // A corner drag averages both axes; a side drag has only its own to go
      // on. Either way the icon stays square — that is the whole point of it.
      const intent = resize.edge.x !== 0 && resize.edge.y !== 0
        ? (intentWidth + intentHeight) / 2
        : resize.edge.x !== 0
          ? intentWidth
          : intentHeight
      if (iconEscapesToFull(intent)) {
        // Measured against the LIVE record, not the render-time prop: the drag
        // may have already scaled the icon, and re-centring the returning
        // widget on the stale square lands it half a step off.
        const live = useWidgetStore.getState().widgets[widgetId]
        commitScaleState(resize, 'full', live?.size ?? widget.size)
        return
      }
      // The icon scales continuously across its one-cell range; past either
      // end the box holds at the clamp and only the band stretches.
      const edge = clampIconEdge(intent)
      const past = intent - edge
      const bandedEdge = edge + Math.sign(past) * elasticOvershoot(Math.abs(past), REST_ELASTIC_PX)
      paintElastic(bandedEdge / edge, bandedEdge / edge, resize.edge)
      // Compared against the live record, not the render-time one: several
      // moves can land inside a single frame, and a stale closure would keep
      // re-proposing a size the store already holds.
      const live = useWidgetStore.getState().widgets[widgetId]
      resize.pending = { width: edge, height: edge }
      if (live && (edge !== live.size.width || edge !== live.size.height)) {
        schedule(resize, (size) => {
          applyAnchoredSize(size, resize.edge, false)
        })
      }
      return
    }

    if (resize.mode === 'image') {
      // Ratio-locked, clamped, never grid-snapped, never a scale-state
      // change: a resting image resizes like a photograph, nothing else.
      const startWidth = Math.max(1, resize.startWidth)
      const startHeight = Math.max(1, resize.startHeight)
      const lead = resize.edge.x !== 0 ? growth.x : growth.y
      const scaleMin = REST_IMAGE_MIN_EDGE / Math.min(startWidth, startHeight)
      const scaleMax = REST_IMAGE_MAX_EDGE / Math.max(startWidth, startHeight)
      const scale = Math.min(scaleMax, Math.max(scaleMin, (startWidth + lead) / startWidth))
      resize.pending = {
        width: Math.round(startWidth * scale),
        height: Math.round(startHeight * scale),
      }
      schedule(resize, (size) => {
        applyAnchoredSize(size, resize.edge, false)
      })
      return
    }

    const sizing = mergeWidgetSizing(widgetDefinition(widget.type).sizing, getLiveWidgetSizing(widgetId))
    const { minWidth, minHeight, maxWidth, maxHeight } = fullWidgetResizeBounds(sizing, DEFAULT_SIZING)
    // Content-fit widgets: height always follows the content reporter, so the
    // gesture only drives width.
    const lockHeight = sizing?.autoHeight === true
    const rawWidth = resize.edge.x === 0 ? resize.startWidth : resize.startWidth + growth.x
    const rawHeightIntent = resize.edge.y === 0 ? resize.startHeight : resize.startHeight + growth.y
    const rawHeight = lockHeight ? resize.startHeight : rawHeightIntent

    resize.pending = {
      width: Math.min(maxWidth, Math.max(minWidth, rawWidth)),
      height: Math.min(maxHeight, Math.max(minHeight, rawHeight)),
    }
    // Past a bound the card stops but the band shows the pull — per axis, so
    // only the side actually against its limit stretches, and a floor reads
    // as a floor rather than as a dead gesture.
    const overWidth = Math.max(0, minWidth - rawWidth, rawWidth - maxWidth)
    const overHeight = lockHeight ? 0 : Math.max(0, minHeight - rawHeightIntent, rawHeightIntent - maxHeight)
    const bandAlong = (over: number, pastFloor: boolean, base: number) =>
      over === 0 ? 1 : (base + (pastFloor ? -1 : 1) * elasticOvershoot(over, REST_ELASTIC_PX)) / base
    paintElastic(
      bandAlong(overWidth, rawWidth < minWidth, Math.max(1, resize.pending.width)),
      bandAlong(overHeight, rawHeightIntent < minHeight, Math.max(1, resize.pending.height)),
      resize.edge,
    )

    schedule(resize, (size) => {
      if (useScaleDebugStore.getState().isOpen) {
        useScaleDebugStore.getState().record({
          widgetId,
          widgetType: widget.type,
          kind: 'pointer-resize',
          before: { width: widget.size.width, height: widget.size.height },
          after: size,
          zoom,
          detail: {
            dx: Math.round(dx),
            dy: Math.round(dy),
            edge: resizeEdgeKey(resize.edge) ?? '',
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
          anomalies: resizeAnomalies(size, { minWidth, minHeight, maxWidth, maxHeight }, {
            snapped: false,
            locked: widget.metadata.locked === true,
            changed: true,
          }),
        })
      }
      // No live neighbor displacement during resize: the card grows over its
      // neighbors and the release settle resolves any overlap once, minimally.
      applyAnchoredSize(size, resize.edge, false)
    })
  }

  const onResizePointerEnd = (e: Pick<ResizePointerSample, 'pointerId'>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== e.pointerId) return
    resizeRef.current = null
    resize.disposeWindowListeners()
    releaseElastic()
    document.body.removeAttribute('data-widget-dragging')
    document.body.removeAttribute('data-widget-resizing')
    onGestureEnd()
    if (!resize.engaged) {
      // The outline was pressed but never dragged. Hand the press back so a
      // resting tile still opens on a plain click.
      endWidgetSizingGesture(widgetId)
      onEdgeClick()
      return
    }
    if (resize.committed || resize.mode === 'rest') {
      // Hand size authority back before returning, or the floor stays asleep.
      endWidgetSizingGesture(widgetId)
      return
    }
    // `schedule` already applies every proposed size synchronously, so this
    // is a defensive final commit rather than recovering a dropped frame —
    // harmless to repeat, and cheap insurance against any path that sets
    // `pending` without going through `schedule`.
    if (resize.pending) {
      // Photographs keep their ratio-locked free size. Full cards and icons
      // settle only here: cards to their regular grid, icons to the nearest
      // 2×2/3×3 square. Pointer-move commits above always pass `false`.
      applyAnchoredSize(
        resize.pending,
        resize.edge,
        resize.mode === 'full' || resize.mode === 'icon',
      )
    }
    // Only now — with the final box committed — does the content floor get its
    // say, and it measures once against a box that is no longer moving.
    endWidgetSizingGesture(widgetId)
    useWidgetStore.getState().settleWidgets([widgetId])
  }

  return {
    armedEdge,
    resizeEdgeAttribute: resizeEdgeKey(armedEdge),
    resizeCursor: resizeEdgeCursor(armedEdge),
    onEdgeHoverMove,
    onEdgeHoverLeave,
    onEdgePointerDown,
  }
}
