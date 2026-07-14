const DRAG_THRESHOLD = 4

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
 * Frame-batched drag gesture. Pointer events can fire far above display
 * refresh (120Hz+ mice); deltas are accumulated and flushed through a single
 * requestAnimationFrame per frame so the store — and React — never do more
 * than one drag update per rendered frame.
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
  private pendingX = 0
  private pendingY = 0
  private rafId = 0
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
    this.pendingX += dx
    this.pendingY += dy
    if (this.rafId === 0) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0
        this.flush()
      })
    }
  }

  /** Flush pending movement, tear down, and report whether a drag happened. */
  end(): boolean {
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.flush()
    if (this.moved) document.body.removeAttribute('data-widget-dragging')
    return this.moved
  }

  private flush(): void {
    if (this.pendingX === 0 && this.pendingY === 0) return
    const dx = this.pendingX
    const dy = this.pendingY
    this.pendingX = 0
    this.pendingY = 0
    this.callbacks.onDelta(dx, dy)
  }
}
