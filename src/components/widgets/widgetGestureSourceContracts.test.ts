/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const resize = readFileSync(new URL('./useWidgetResize.ts', import.meta.url), 'utf8')
const controls = readFileSync(new URL('../../styles/product/04-controls.css', import.meta.url), 'utf8')
const restStore = readFileSync(new URL('../../store/useWidgetRestStore.ts', import.meta.url), 'utf8')
const floor = readFileSync(new URL('./useContentFloor.ts', import.meta.url), 'utf8')
const root = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../../styles/product/01-tokens-base.css', import.meta.url), 'utf8')

describe('magnetic lift survives every gesture', () => {
  it('never resets the lift on a press, whoever claims it', () => {
    // Resetting on press snapped the card back to its unlifted position the
    // instant it was grabbed or scaled — the thing under the pointer moved out
    // from under the pointer. No press path may call the reset.
    expect(card).not.toContain('magneticHover.suspend()\n        return')
    expect(card).toContain('if (edgeResize.onEdgePointerDown(e)) return')
  })

  it('holds the lift still for the length of a scale, then releases it', () => {
    expect(card).toContain('onGestureStart: () => magneticHover.hold()')
    expect(card).toContain('onGestureEnd: () => magneticHover.release()')
  })

  it('leaves the ordinary drag path to freeze and carry the offset', () => {
    // `freeze` (capture phase) pins the offset under the finger; `beginDrag`
    // preserves it for the length of the drag. Neither may be a reset.
    expect(card).toContain('onPointerDownCapture={() => magneticHover.freeze()}')
    expect(card).toContain('magneticHover.beginDrag()')
  })
})

describe('an open card folds back onto the spot it opened from', () => {
  it('pays for an expanded resize out of the view offset, not the anchor', () => {
    // Walking the stored position would leave the resting tile somewhere it
    // had never been once the card folded back.
    expect(resize).toContain('if (!restExpanded) {')
    expect(resize).toContain('nudgeExpandedOffset({')
  })

  it('drops the whole offset on collapse, restoring the original anchor', () => {
    expect(restStore).toContain("set({ expandedWidgetId: null, expandedOffset: NO_OFFSET, expandedFrom: null })")
  })

  it('folds a card opened from an icon back into that exact icon square', () => {
    // The origin — kind AND size — is captured at expansion; collapse hands it
    // to the scale-state action history-neutrally, so open-and-close nets to
    // no edit and a continuously sized icon never comes back as the 2×2 floor.
    expect(restStore).toContain("expandedFrom?.kind === 'icon'")
    expect(restStore).toContain("setWidgetScaleState(expandedWidgetId, 'icon', {")
    expect(restStore).toContain('toSize: expandedFrom.size')
    // Pinning keeps the card open: it must release the slot without the
    // fold-back, or it would iconify the very card being pinned.
    expect(card).toContain('collapseWidget({ restoreOrigin: false })')
  })
})

describe('expansion offset is captured, not re-derived', () => {
  it('captures the offset at the moment a card opens', () => {
    expect(card).toContain('expansionOffsetFor(restingTileSize(live), live.size)')
    // Every expansion goes through the one helper, so none can open without an
    // offset and land back on the un-centred stored position.
    expect(card).not.toMatch(/expandWidget\(\s*widgetId\s*\)/)
  })

  it('draws the open card at the stored position plus that frozen offset', () => {
    expect(card).toContain('const restOffset = restExpansionOffset(widget, restCtx)')
    // Positioning sums the stored anchor with every view-only offset: ghost
    // displacement and the rest-expansion offset.
    expect(card).toContain('widget.position.x + (ghostOffset?.x ?? 0) + restOffset.x')
  })
})

describe('the rubber band never rides the positioning transform', () => {
  it('paints the band on the card, whose own origin is local', () => {
    // A `scale` on the wrapper resolves about a point near the world origin,
    // because `transform` composes before it — a distant card shot off
    // diagonally instead of stretching in place.
    expect(resize).toContain('const element = elementRef.current')
    expect(resize).not.toContain('layoutRef')
    expect(controls).toContain('.gp-widget-card[data-elastic]')
    expect(controls).not.toContain('.gp-widget-layout-motion[data-elastic]')
  })

  it('clamps whatever any charter computes, on each axis', () => {
    expect(resize).toContain('Math.min(ELASTIC_SCALE_MAX, Math.max(ELASTIC_SCALE_MIN, scaleX))')
    expect(resize).toContain('Math.min(ELASTIC_SCALE_MAX, Math.max(ELASTIC_SCALE_MIN, scaleY))')
  })

  it('springs back through the release keyframes instead of snapping flat', () => {
    expect(resize).toContain("element.setAttribute('data-elastic-release', 'true')")
    expect(controls).toContain('@keyframes gp-elastic-release')
    expect(controls).toContain('.gp-widget-card[data-elastic-release]')
  })
})

describe('one author owns a size at a time', () => {
  it('claims size authority for the length of an outline gesture', () => {
    // Without this the content floor grows the card between drag frames and
    // the drag shrinks it again on the next — a flicker at pointer speed.
    expect(resize).toContain('beginWidgetSizingGesture(widgetId)')
    expect(resize).toContain('endWidgetSizingGesture(widgetId)')
  })

  it('stands the content floor down while a gesture holds authority', () => {
    expect(floor).toContain('if (isWidgetSizingGestureActive(widgetId)) return')
    // The committed box often equals the last dragged one, so no observer
    // fires: the gesture's end has to trigger the catch-up measurement.
    expect(floor).toContain('subscribeWidgetSizingGestureEnd(')
  })

  it('stands the card height reporter down too', () => {
    expect(card).toContain('if (isWidgetSizingGestureActive(widgetId)) return')
  })
})

describe('the icon band carries continuous size feedback', () => {
  it('never tweens the box during an icon drag', () => {
    // The box and its boundary feedback both track the pointer directly. A
    // tween multiplied by the band's compensation creates visible lag.
    expect(root).not.toContain("data-widget-resizing='detent'")
    expect(resize).not.toContain("'detent'")
  })

  it('keeps icon size continuous during the drag and snaps only on release', () => {
    expect(resize).toContain('applyAnchoredSize(size, resize.edge, false)')
    expect(resize).toContain("resize.mode === 'full' || resize.mode === 'icon'")
    expect(resize).not.toContain("resize.mode === 'icon' ?")
  })

  it('locks a cursor the stylesheet actually knows', () => {
    // An unrecognised value matched no rule and left an icon drag with no
    // locked cursor at all.
    expect(resize).toContain("document.body.setAttribute('data-widget-resizing', 'both')")
    expect(tokens).toContain("body[data-widget-resizing='both']")
  })
})

describe('icon position snapping belongs only to drag release', () => {
  it('snaps the dragged icon when a completed move is let go, unless it is glued', () => {
    // Per-widget grid snapping would tear a glued icon off its 0.3-cell seam;
    // the cluster's rigid settle owns its snapping instead.
    expect(card).toContain('if (liveWidget?.iconified && !settled.widgetGlueIndex[draggedId]) state.snapWidgetToGrid(draggedId)')
  })

  it('does not route resizing or pointer cancellation through the icon snap', () => {
    expect(resize).not.toContain('snapWidgetToGrid')
    const cancelPath = card.slice(card.indexOf('const onPointerCancel'), card.indexOf('const onContextMenu'))
    expect(cancelPath).not.toContain('snapWidgetToGrid')
  })
})

describe('option-drag owns gluing', () => {
  it('captures the modifier at press time, not per move event', () => {
    // Reading e.altKey on every move would flip the gesture mid-drag when the
    // key is released to steady the hand; the press decides the gesture.
    expect(card).toContain('glueDragRef.current = e.altKey')
  })

  it('moves the grabbed widget alone while its cluster stays put', () => {
    expect(card).toContain("glueDragRef.current ? { soloGlued: true, moveSelection: false } : undefined")
  })

  it('previews the weld or the pull-off continuously during the drag', () => {
    expect(card).toContain('findGlueSnap(dragged, state.widgets)')
    expect(card).toContain('pulledFreeOfCluster(dragged, members, state.widgets)')
    // Neighbors must not scatter while the gesture is about to weld.
    expect(card).toContain('setDragDisplacementSuppressed(Boolean(snap))')
  })

  it('commits exactly what the preview promised on release', () => {
    expect(card).toContain('state.commitGlue()')
    // The drag's first move already opened the history step; the pull-off
    // must not open a second one.
    expect(card).toContain('state.unglueWidget(draggedId, { skipHistory: true })')
  })

  it('clears every glue intent on release and on cancellation', () => {
    const upPath = card.slice(card.indexOf('const onPointerUp'), card.indexOf('const onPointerCancel'))
    const cancelPath = card.slice(card.indexOf('const onPointerCancel'), card.indexOf('const onContextMenu'))
    for (const path of [upPath, cancelPath]) {
      expect(path).toContain('setGlueIntent(null)')
      expect(path).toContain('setUnglueIntentWidgetId(null)')
      expect(path).toContain('glueDragRef.current = false')
    }
  })

  it('drags whole glue clusters on a plain drag, matching the store move', () => {
    // The displacement scene must mirror exactly what moveWidget moved: the
    // selection expanded through every touched cluster.
    expect(card).toContain('glueId ? fresh.glues[glueId]?.widgetIds ?? [id] : [id]')
  })
})

describe('the armed outline thickens outward', () => {
  it('insets the band by its own width so the border lands outside the card', () => {
    expect(controls).toContain('inset: calc(-1 * var(--gp-resize-edge-width))')
    // Concentric per Article XIV: the radius grows by the same amount.
    expect(controls).toContain('calc(var(--gp-widget-radius, 22px) + var(--gp-resize-edge-width))')
  })

  it('does not let a utility class pin the band back to the card bounds', () => {
    expect(card).toContain('className="gp-resize-edge pointer-events-none z-20"')
  })
})
