import {useLayoutEffect, type RefObject} from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { clearLiveWidgetSizing, setLiveWidgetSizing } from '../../store/liveWidgetSizing'
import { isWidgetSizingGestureActive, registerWidgetFloorProbe, subscribeWidgetSizingGestureEnd } from '../../store/widgetSizingGesture'
import type { Size, Widget } from '../../types/spatial'
import { GRID_SIZE, WIDGET_MAX_EDGE } from '../../types/spatial'
import { CARD_INSET as CONTENT_FLOOR_INSET, SUBGRID, contentFitHeight, hasSignificantVerticalOverflow, measureWidgetContentFloor, naturalContentHeight, verticalContentFloor } from '../../utils/widgetContentFloor'
import { contentFloorAnomalies } from '../../utils/scaleDebugAnomalies'
import { useScaleDebugStore } from '../../store/useScaleDebugStore'
import { DEFAULT_SIZING, widgetDefinition } from '../../widgets/registry'

/** Traces one content-floor measurement pass — every value the grow/shrink
 * decision above actually used, whether or not it resized anything. Guarded
 * on isOpen before doing any work: this fires from a ResizeObserver that
 * ticks on every layout change, including every frame of a manual drag. */
function recordContentFloorDebug(
  widgetId: string,
  widgetType: string,
  before: Size,
  detail: Record<string, number | string | boolean | null>,
  anomalies: string[],
): void {
  if (!useScaleDebugStore.getState().isOpen) return
  useScaleDebugStore.getState().record({
    widgetId,
    widgetType,
    kind: 'content-floor',
    before,
    after: null,
    zoom: useCanvasStore.getState().zoom,
    detail,
    anomalies,
  })
}

/** Owns the content-floor auto-grow/shrink measurement for one widget card.
 * Extracted verbatim from WidgetCard.tsx — behavior and effect deps unchanged. */
export function useContentFloor(
  widgetId: string,
  contentRef: RefObject<HTMLDivElement | null>,
  fitContentType: Widget['type'] | undefined,
  shouldFitContent: boolean,
): void {
  // The mounted renderer declares its real floor. Unlike an outer overflow
  // check, this reads complete input/ellipsis text and recursively composes
  // rows, grids, and stacked panels, so visually chopped text is detectable.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || !fitContentType || !shouldFitContent) {
      clearLiveWidgetSizing(widgetId)
      return
    }
    let raf = 0
    let ready = false
    // Grow-only can grow a card to fit overflow but never reclaim empty space,
    // because a stretched .gp-widget-ui reports scrollHeight === clientHeight.
    // A card inflated once by a transient measurement (or carried in from a
    // prior session) would keep its bottom void forever. This one-shot fit,
    // run on the first settle pass after mount, reclaims that void so a canvas
    // opens with every card sized to its real content; grow-only owns it after.
    // The load-time fit must wait for a STABLE reading: a renderer's visual
    // (an SVG hero, a lazy panel) can measure tall for a frame before it lays
    // out, and fitting on that transient would either miss the void or clip
    // real content. We re-measure until the natural height repeats, then fit
    // exactly once. A widget whose layout never settles (a live animation that
    // reflows) simply keeps grow-only — no worse than before.
    let initialFitDone = false
    let lastNatural = -1
    let fitAttempts = 0
    let retryTimer = 0
    const readyTimer = window.setTimeout(() => {
      ready = true
      measure()
    }, 360)
    /**
     * Measure the content and publish the bounds a resize gesture clamps
     * against. Synchronous and side-effect-free beyond that publication, so
     * the gesture itself can call it at the instant a press lands — a card
     * opened out of its resting tile may be grabbed before any scheduled
     * frame has run, and without this the drag would obey only the generic
     * registry limits and slide straight through its own content.
     */
    const publishBounds = (): { ui: HTMLElement; live: Widget; declaredSizing: ReturnType<typeof widgetDefinition>['sizing']; result: ReturnType<typeof measureWidgetContentFloor> } | null => {
      const ui = content.querySelector<HTMLElement>('.gp-widget-ui')
      if (!ui) return null
      const live = useWidgetStore.getState().widgets[widgetId]
      if (!live || live.iconified) return null
      const declaredSizing = widgetDefinition(live.type).sizing
      const result = measureWidgetContentFloor(ui, live.size, {
        ...DEFAULT_SIZING,
        ...declaredSizing,
      })
      setLiveWidgetSizing(widgetId, result.sizing)
      return { ui, live, declaredSizing, result }
    }
    const disposeProbe = registerWidgetFloorProbe(widgetId, () => { publishBounds() })

    const measure = () => {
      // A pointer gesture owns this widget's size while it runs. Measuring
      // here would grow the card between two frames of the drag, and the drag
      // would shrink it again on the next — the two trading sizes at pointer
      // speed. The gesture's own end wakes this pass back up.
      if (isWidgetSizingGestureActive(widgetId)) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const measured = publishBounds()
        if (!measured) return
        const { ui, live, declaredSizing, result } = measured
        // Publishing bounds is safe on the first frame; changing the card's
        // own size is not. A renderer can measure tall for a frame before it
        // lays out, and growing on that transient is not reversible under the
        // grow-only rule — so that still waits for a settled reading.
        if (!ready) return
        const fallback = { ...DEFAULT_SIZING, ...declaredSizing }
        const autoHeight = declaredSizing?.autoHeight === true
        const overflowY = Math.max(0, ui.scrollHeight - ui.clientHeight)

        // autoHeight already fits every pass; only fixed-height cards can
        // strand a void. naturalContentHeight sees a compact stack's true
        // height while a flex-1 region (an internal scroll panel) still
        // measures full, so content-filled cards are never shrunk.
        if (!initialFitDone && !autoHeight) {
          const natural = naturalContentHeight(ui)
          if (natural > 0 && natural === lastNatural) {
            initialFitDone = true
            const minHeight = Math.max(result.sizing.minHeight ?? 0, fallback.minHeight ?? 0)
            const fitted = contentFitHeight(
              natural,
              minHeight,
              Math.min(WIDGET_MAX_EDGE, fallback.maxHeight ?? WIDGET_MAX_EDGE),
              CONTENT_FLOOR_INSET,
              SUBGRID,
            )
            // Only shrink, and only when the void is real (over one grid cell),
            // so a correctly sized card never twitches on load.
            const willShrink = fitted + GRID_SIZE <= live.size.height
            recordContentFloorDebug(widgetId, live.type, live.size, {
              phase: 'load-fit-settled',
              natural,
              overflowY,
              scrollHeight: ui.scrollHeight,
              clientHeight: ui.clientHeight,
              growToWidth: result.growTo.width,
              fitted,
              willShrink,
              autoHeight,
            }, contentFloorAnomalies({
              cardHeight: live.size.height,
              naturalHeight: natural,
              inset: CONTENT_FLOOR_INSET,
              overflowY,
              autoHeight,
            }).filter((flag) => flag !== 'content-void' || !willShrink)) // a void about to be fixed is not a bug
            if (willShrink) {
              useWidgetStore.getState().resizeWidget(widgetId, {
                width: result.growTo.width,
                height: fitted,
              })
              return
            }
          } else {
            lastNatural = natural
            // Still stabilizing (an SVG hero or lazy panel mid-layout) — not
            // yet a confirmed void, so no anomaly flag until it repeats.
            recordContentFloorDebug(widgetId, live.type, live.size, {
              phase: 'load-fit-settling',
              natural,
              overflowY,
              scrollHeight: ui.scrollHeight,
              clientHeight: ui.clientHeight,
              attempt: fitAttempts,
              autoHeight,
            }, [])
            if (fitAttempts++ < 6) retryTimer = window.setTimeout(measure, 180)
          }
        }

        const fittedHeight = autoHeight
          ? contentFitHeight(
              ui.scrollHeight,
              declaredSizing.minHeight ?? DEFAULT_SIZING.minHeight,
              // Auto-grow stops at the absolute ceiling; past it the card
              // holds its size and the content scrolls inside it.
              Math.min(WIDGET_MAX_EDGE, declaredSizing.maxHeight ?? WIDGET_MAX_EDGE),
            )
          : result.growTo.height
        const willGrow =
          result.growTo.width > live.size.width ||
          (autoHeight ? fittedHeight !== live.size.height : fittedHeight > live.size.height)
        recordContentFloorDebug(widgetId, live.type, live.size, {
          phase: 'grow-floor',
          overflowY,
          scrollHeight: ui.scrollHeight,
          clientHeight: ui.clientHeight,
          growToWidth: result.growTo.width,
          growToHeight: fittedHeight,
          willGrow,
          autoHeight,
        }, overflowY > 4 && !willGrow ? ['overflow-not-grown'] : [])
        if (willGrow) {
          useWidgetStore.getState().resizeWidget(widgetId, {
            width: result.growTo.width,
            height: fittedHeight,
          })
        }
      })
    }
    // The committed box may match the last dragged one, in which case no
    // observer fires — so the gesture's end is its own trigger.
    const disposeGestureEnd = subscribeWidgetSizingGestureEnd((endedId) => {
      if (endedId === widgetId) measure()
    })
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(content)
    const mutationObserver = new MutationObserver(measure)
    mutationObserver.observe(content, { childList: true, subtree: true, characterData: true })
    content.addEventListener('input', measure, true)
    content.addEventListener('change', measure, true)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(readyTimer)
      window.clearTimeout(retryTimer)
      disposeGestureEnd()
      disposeProbe()
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      content.removeEventListener('input', measure, true)
      content.removeEventListener('change', measure, true)
      clearLiveWidgetSizing(widgetId)
    }
  }, [contentRef, fitContentType, shouldFitContent, widgetId])

  // Lazy modules can first appear one frame after the shell. This outer probe
  // is retained as a backstop for a renderer that has not yet declared enough
  // information for the intrinsic floor composer.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || !shouldFitContent) return
    let raf = 0
    const fitOverflow = () => {
      if (isWidgetSizingGestureActive(widgetId)) return
      const live = useWidgetStore.getState().widgets[widgetId]
      if (!live || live.iconified) return
      const overflow = Math.ceil(content.scrollHeight - content.clientHeight)
      if (!hasSignificantVerticalOverflow(overflow)) return

      const maxHeight = Math.min(
        WIDGET_MAX_EDGE,
        widgetDefinition(live.type).sizing?.maxHeight ?? WIDGET_MAX_EDGE,
      )
      const height = Math.min(
        maxHeight,
        verticalContentFloor(content.scrollHeight, overflow, DEFAULT_SIZING.minHeight, 0),
      )
      if (height > live.size.height) {
        useWidgetStore.getState().resizeWidget(widgetId, { ...live.size, height })
      }
    }
    const readyTimer = window.setTimeout(() => {
      raf = requestAnimationFrame(fitOverflow)
    }, 360)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(readyTimer)
    }
  }, [contentRef, shouldFitContent, widgetId])
}
