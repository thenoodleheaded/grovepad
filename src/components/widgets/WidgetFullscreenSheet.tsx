import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, TriangleAlert } from 'lucide-react'
import { ErrorBoundary } from '../ErrorBoundary'
import { useOverlayDismiss } from '../../hooks/useOverlayDismiss'
import { useWidgetSheetStore } from '../../store/useWidgetSheetStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import type { ModuleData } from '../../types/spatial'
import { createOwnedTimeout, type OwnedTimeout } from '../../utils/ownedTimeout'
import { restGlideMs } from '../../utils/widgetRest'
import { widgetAccent } from '../../utils/widgetSkins'
import {
  SHEET_OPEN_CLIP,
  sheetDragDismisses,
  sheetDragScrim,
  sheetDragTravel,
  sheetFallbackOrigin,
  sheetOriginCenter,
  sheetOriginClip,
  widgetSheetOrigin,
  type SheetOrigin,
  type SheetViewport,
} from '../../utils/widgetSheet'
import { widgetDefinition } from '../../widgets/registry'
import { WidgetRenderer } from './WidgetRenderer'

/** What the sheet is currently flying between. Outlives `sheetWidgetId` by one
 * glide so a closing sheet can fold back onto its tile instead of blinking. */
interface SheetFlight {
  widgetId: string
  from: SheetOrigin
  viewport: SheetViewport
}

/** The layer is `position: fixed`, so its box is the layout viewport — the
 * same space `getBoundingClientRect()` reports the tile in. */
function currentViewport(): SheetViewport {
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * A widget as its own screen, for phones.
 *
 * One instance for the whole app: the sheet is a singleton view, like the
 * expansion slot it stands in for. It renders the very same `WidgetRenderer`
 * the card does, inside the same `gp-widget-card` / `gp-widget-content`
 * material, so every skin, field island and control behaves identically — the
 * widget is not re-implemented at a second size, it is simply given the
 * screen.
 *
 * The flight is a clip-path grow (see widgetSheet.ts): the content is at full
 * size from the first frame and never scales, so nothing is distorted on the
 * way in or out.
 */
export function WidgetFullscreenSheet() {
  const sheetWidgetId = useWidgetSheetStore((state) => state.sheetWidgetId)
  const origin = useWidgetSheetStore((state) => state.origin)
  const [flight, setFlight] = useState<SheetFlight | null>(null)
  // False for exactly one painted frame at each end of the flight: the browser
  // needs the closed clip on screen before the open one can be transitioned to.
  const [opened, setOpened] = useState(false)
  const [dragTravel, setDragTravel] = useState(0)
  const [dragging, setDragging] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const flightRef = useRef<SheetFlight | null>(null)
  const exitRef = useRef<OwnedTimeout | null>(null)
  const dragRef = useRef<{ pointerId: number; startY: number } | null>(null)
  flightRef.current = flight

  // Created on demand and dropped on unmount, never held past a disposal: a
  // timeout allocated once at mount is dead for the rest of the session after
  // React's development double-mount disposes it, and the sheet would then
  // never unmount itself after a closing glide.
  const exitTimeout = () => (exitRef.current ??= createOwnedTimeout())

  useEffect(() => () => {
    exitRef.current?.dispose()
    exitRef.current = null
  }, [])

  useEffect(() => {
    if (sheetWidgetId !== null) {
      exitTimeout().cancel()
      const viewport = currentViewport()
      setFlight({ widgetId: sheetWidgetId, from: origin ?? sheetFallbackOrigin(viewport), viewport })
      setDragTravel(0)
      setDragging(false)
      setOpened(false)
      return undefined
    }
    const open = flightRef.current
    if (!open) return undefined
    // Fold back onto wherever the tile is NOW, and onto the viewport as it is
    // now — a rotation or a software keyboard while the sheet was open would
    // otherwise aim the closing flight at a rectangle that no longer exists.
    setFlight({
      ...open,
      from: widgetSheetOrigin(open.widgetId) ?? open.from,
      viewport: currentViewport(),
    })
    setOpened(false)
    setDragging(false)
    setDragTravel(0)
    exitTimeout().schedule(() => setFlight(null), restGlideMs(panelRef.current))
    return undefined
  }, [sheetWidgetId, origin])

  /**
   * Launch the opening flight.
   *
   * A transition needs a resolved "before" value on an element that is already
   * in the document — a freshly inserted node simply adopts whatever style it
   * is given, with nothing to animate from. So the render above commits the
   * tile-sized clip, this forces the browser to actually resolve it, and only
   * then is the open clip applied.
   *
   * Deliberately not the usual double-`requestAnimationFrame`: rAF is
   * throttled to a standstill in a backgrounded or occluded tab, which left
   * the sheet frozen at tile size — open, interactive, and invisible. A forced
   * layout read has no such dependency on the frame clock.
   */
  useLayoutEffect(() => {
    if (sheetWidgetId === null || !panelRef.current) return
    void panelRef.current.getBoundingClientRect()
    setOpened(true)
  }, [sheetWidgetId, flight])

  /**
   * Tell the rest of the app that a widget owns the screen.
   *
   * The board behind an opening sheet pushes back and dims — the parallax that
   * makes this read as going *into* the widget instead of a panel sliding over
   * it. That is one line of CSS on the canvas shell, so the signal is a root
   * dataset flag (the same convention adaptiveInputRuntime uses for global
   * presentation state) rather than prop-drilling through the viewport.
   *
   * It stays set for the whole closing glide as well, because the shell's own
   * transition back has to run for as long as the sheet's does.
   */
  useEffect(() => {
    const root = document.documentElement
    if (flight) root.dataset.widgetSheet = opened ? 'open' : 'flight'
    else delete root.dataset.widgetSheet
  }, [flight, opened])

  useEffect(() => () => {
    delete document.documentElement.dataset.widgetSheet
  }, [])

  const close = useCallback(() => useWidgetSheetStore.getState().closeWidgetSheet(), [])

  // The widget the sheet stands for. The store's id leads, because it is set a
  // render before `flight` catches up; `flight` carries it through the closing
  // glide, after the store has already let go.
  const trackedId = sheetWidgetId ?? flight?.widgetId ?? null
  const widget = useWidgetStore((state) => (trackedId ? state.widgets[trackedId] : undefined))
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  // Nothing left to show: the widget was deleted from under the sheet, a
  // different board was loaded, or navigation moved to another canvas. In every
  // case there is no tile to fold back onto and no card the sheet still stands
  // for, so it closes rather than hovering over a board it doesn't belong to.
  const orphaned = trackedId !== null && (!widget || widget.canvasId !== activeCanvasId)

  useEffect(() => {
    if (sheetWidgetId !== null && orphaned) close()
  }, [sheetWidgetId, orphaned, close])

  useOverlayDismiss(sheetWidgetId !== null, close, {
    containerRef: panelRef,
    // Focus lands on the sheet itself, not on its close button: an opened
    // widget should read as "here is your widget", and parking a focus ring on
    // Close is both ugly and the wrong first thing to offer.
    initialFocusRef: panelRef,
  })

  const endDrag = (event: ReactPointerEvent<HTMLElement>, dismissable: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    const travel = sheetDragTravel(event.clientY - drag.startY)
    setDragging(false)
    setDragTravel(0)
    if (dismissable && flight && sheetDragDismisses(travel, flight.viewport.height)) close()
  }

  if (!flight || !widget || orphaned) return null

  const definition = widgetDefinition(widget.type)
  const Icon = definition.icon
  const accent = widgetAccent(widget, definition)
  // The content grows out of — and shrinks back into — the middle of the tile
  // that was tapped, not the middle of the screen. Viewport coordinates work
  // directly here because the stage's box IS the viewport: the safe-area insets
  // live on its children for exactly this reason (see 33-widget-sheet.css).
  const from = sheetOriginCenter(flight.from)

  return createPortal(
    <div className="gp-widget-sheet-layer" role="dialog" aria-modal="true" aria-label={`${widget.title}, full screen`}>
      <div
        aria-hidden
        className="gp-widget-sheet-scrim"
        data-open={opened || undefined}
        style={{ '--gp-sheet-scrim': sheetDragScrim(dragTravel, flight.viewport.height) } as CSSProperties}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        // The card's own material, so the widget grows into the screen wearing
        // the surface it wore on the board rather than arriving as a new object.
        className="gp-widget-sheet gp-widget-card gp-glass gp-backplate"
        data-open={opened || undefined}
        data-dragging={dragging || undefined}
        style={{
          clipPath: opened ? SHEET_OPEN_CLIP : sheetOriginClip(flight.from, flight.viewport),
          transform: dragTravel > 0 ? `translate3d(0, ${dragTravel}px, 0)` : undefined,
          '--gp-widget-accent': accent,
        } as CSSProperties}
      >
        <div
          className="gp-widget-sheet-stage"
          data-open={opened || undefined}
          style={{ transformOrigin: `${from.x}px ${from.y}px` }}
        >
        <header
          className="gp-widget-sheet-head"
          onPointerDown={(event) => {
            if (event.button !== 0 || dragRef.current) return
            if (event.target instanceof Element && event.target.closest('button')) return
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = { pointerId: event.pointerId, startY: event.clientY }
            setDragging(true)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            setDragTravel(sheetDragTravel(event.clientY - drag.startY))
          }}
          onPointerUp={(event) => endDrag(event, true)}
          // A cancelled gesture is not a decision: the sheet always snaps back.
          onPointerCancel={(event) => endDrag(event, false)}
          onLostPointerCapture={(event) => endDrag(event, false)}
        >
          <span aria-hidden className="gp-widget-sheet-grip" />
          <div className="gp-widget-sheet-identity">
            <Icon size={16} style={{ color: accent }} aria-hidden />
            <h2 className="gp-widget-sheet-title">{widget.title}</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={`Close ${widget.title}`}
            className="gp-widget-sheet-close gp-touch-target"
          >
            <ChevronDown size={20} aria-hidden />
          </button>
        </header>
        <div className="gp-widget-content gp-widget-sheet-body">
          <ErrorBoundary
            key={widget.id}
            fallback={(retry) => (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
                <TriangleAlert size={18} className="text-amber-400" aria-hidden />
                <p className="text-[11px] text-neutral-500">This widget failed to render.</p>
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-md border gp-hairline px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800"
                >
                  Try again
                </button>
              </div>
            )}
          >
            <WidgetRenderer
              widget={widget}
              onUpdate={(data: ModuleData) =>
                useWidgetStore.getState().updateWidgetData(widget.id, data, {
                  // Same rule the card uses: typing coalesces into one history
                  // step, every completed ink gesture keeps its own.
                  coalesceHistory: widget.type !== 'sketchpad',
                })
              }
              // The sheet is the screen; nothing here resizes to fit content.
              onHeightChange={() => {}}
            />
          </ErrorBoundary>
        </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
