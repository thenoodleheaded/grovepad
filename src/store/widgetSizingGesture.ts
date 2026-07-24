// ---------------------------------------------------------------------------
// Who owns a widget's size right now.
//
// Two systems can resize the same card: the pointer (an outline drag) and the
// content floor (a ResizeObserver that grows a card until its content fits).
// Left to themselves they fight, and the fight is a visible oscillation:
//
//   frame 1  the drag sets a narrower box
//   frame 2  the narrower box reflows the text taller, the floor grows the
//            card to fit it
//   frame 3  the drag — which computes its box from the gesture's start, not
//            from the live size — sets the narrow box again
//
// …at pointer speed, which reads as the card flickering between two sizes. It
// bites hardest on a diagonal shrink, because that is the one gesture driving
// both axes into the floor at once.
//
// The rule that resolves it: while a gesture is live, the pointer is the only
// author of that widget's size. The floor stands down, then measures once when
// the gesture ends and grows the card if the content genuinely needs it. The
// gesture still respects the floor captured before it started, so a drag can
// never shrink a card below its content in the first place.
//
// Module state rather than a store: this is per-frame gesture bookkeeping with
// no renderable value, and routing it through zustand would re-render every
// subscriber on pointer down.
// ---------------------------------------------------------------------------

const active = new Set<string>()
const listeners = new Set<(widgetId: string) => void>()
const floorProbes = new Map<string, () => void>()

/**
 * Register a synchronous "measure this widget's content bounds now" probe.
 *
 * The bounds a gesture clamps against are measured from the mounted DOM, and
 * that measurement is normally scheduled on a frame. A card opened out of its
 * resting tile can be grabbed before that frame ever runs — and since the
 * gesture then suspends the measuring pass, it would never run at all, leaving
 * the drag with only the generic registry limits to obey. So the gesture takes
 * one reading itself, at the instant it starts.
 */
export function registerWidgetFloorProbe(widgetId: string, probe: () => void): () => void {
  floorProbes.set(widgetId, probe)
  return () => {
    if (floorProbes.get(widgetId) === probe) floorProbes.delete(widgetId)
  }
}

/** Claim size authority for one widget for the length of a pointer gesture. */
export function beginWidgetSizingGesture(widgetId: string): void {
  // Read the content's real bounds before suspending the pass that would have
  // read them, so the gesture starts out knowing its floor and ceiling.
  if (!active.has(widgetId)) floorProbes.get(widgetId)?.()
  active.add(widgetId)
}

/** Release it, and let the content floor re-measure now that the box is final.
 * Safe to call for a widget that never claimed authority. */
export function endWidgetSizingGesture(widgetId: string): void {
  if (!active.delete(widgetId)) return
  for (const listener of listeners) listener(widgetId)
}

/** Whether a pointer gesture currently owns this widget's size. */
export function isWidgetSizingGestureActive(widgetId: string): boolean {
  return active.has(widgetId)
}

/** Notified when a widget's gesture ends, so a suspended measurement pass can
 * run once against the committed box. Returns its own disposer. */
export function subscribeWidgetSizingGestureEnd(
  listener: (widgetId: string) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test seam: drop all gesture state between cases. */
export function resetWidgetSizingGestures(): void {
  active.clear()
  listeners.clear()
  floorProbes.clear()
}
