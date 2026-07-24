// Movement (px) a press must travel before it becomes a drag rather than a
// click/select. Small enough that engaging a drag feels immediate, large
// enough that the hand-jitter in a deliberate click never nudges the widget.
const DRAG_THRESHOLD = 3

interface PointerSample {
  pointerId: number
  clientX: number
  clientY: number
}

interface DragCallbacks {
  /** Fires once, when movement first crosses the drag threshold. */
  onFirstMove?: () => void
  /** Receives accumulated screen-space movement, at most once per frame. */
  onDelta: (dx: number, dy: number) => void
}

/**
 * Drag gesture with zero added latency: every qualifying pointer move applies
 * its delta the instant it arrives, rather than queuing behind a
 * `requestAnimationFrame` hop first. A queued rAF only ever helps hardware
 * firing pointermove faster than the display repaints — and that is exactly
 * the case where an added frame of latency is most noticeable, since the
 * whole point of high-frequency input is to track the pointer tightly. Since
 * `onDelta` receives one small delta per event instead of one accumulated
 * delta per frame, the cumulative motion over the gesture is identical either
 * way — only the added lag is removed.
 *
 * While a drag is live, `data-widget-dragging` is set on <body> so the CSS
 * position transitions on widgets collapse to zero (per-frame movement must
 * track the pointer exactly; only discrete moves like settle/undo animate).
 */
export class PointerDragSession {
  readonly pointerId: number
  moved = false

  private lastX: number
  private lastY: number
  private readonly callbacks: DragCallbacks

  constructor(event: PointerSample, callbacks: DragCallbacks) {
    this.pointerId = event.pointerId
    this.lastX = event.clientX
    this.lastY = event.clientY
    this.callbacks = callbacks
  }

  move(event: PointerSample): void {
    if (event.pointerId !== this.pointerId) return
    const dx = event.clientX - this.lastX
    const dy = event.clientY - this.lastY
    if (!this.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
      this.moved = true
      document.body.setAttribute('data-widget-dragging', 'true')
      this.callbacks.onFirstMove?.()
    }
    this.lastX = event.clientX
    this.lastY = event.clientY
    if (dx !== 0 || dy !== 0) this.callbacks.onDelta(dx, dy)
  }

  /** Tear down and report whether a drag happened. */
  end(): boolean {
    if (this.moved) document.body.removeAttribute('data-widget-dragging')
    return this.moved
  }
}
