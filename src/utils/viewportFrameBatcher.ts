import { clampZoom, type Vector2D } from '../types/spatial'

export interface ViewportFrameView {
  pan: Vector2D
  zoom: number
}

interface ViewportFrameBatcherOptions {
  getView: () => ViewportFrameView
  commitView: (pan: Vector2D, zoom: number) => void
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (id: number) => void
}

function copyView({ pan, zoom }: ViewportFrameView): ViewportFrameView {
  return { pan: { ...pan }, zoom }
}

/**
 * Owns one staged camera view until the next animation frame. Wheel, drag,
 * pinch, and inertia can all contribute to that view, but only the frame
 * callback commits it to the store and DOM subscribers.
 */
export function createViewportFrameBatcher({
  getView,
  commitView,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
}: ViewportFrameBatcherOptions) {
  let frameId: number | null = null
  let pending: ViewportFrameView | null = null

  const ensurePending = () => {
    if (pending === null) pending = copyView(getView())
    return pending
  }

  const commit = () => {
    if (pending === null) return
    const next = pending
    pending = null
    commitView(next.pan, next.zoom)
  }

  const schedule = () => {
    if (frameId !== null) return
    frameId = requestFrame(() => {
      frameId = null
      commit()
    })
  }

  return {
    panBy(delta: Vector2D) {
      if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return
      if (delta.x === 0 && delta.y === 0) return
      const next = ensurePending()
      next.pan.x += delta.x
      next.pan.y += delta.y
      schedule()
    },

    zoomBy(factor: number, focalPoint: Vector2D) {
      if (
        !Number.isFinite(factor) ||
        factor <= 0 ||
        !Number.isFinite(focalPoint.x) ||
        !Number.isFinite(focalPoint.y)
      ) {
        return
      }
      const next = ensurePending()
      const nextZoom = clampZoom(next.zoom * factor)
      if (nextZoom === next.zoom) return
      const scale = nextZoom / next.zoom
      next.pan = {
        x: focalPoint.x - (focalPoint.x - next.pan.x) * scale,
        y: focalPoint.y - (focalPoint.y - next.pan.y) * scale,
      }
      next.zoom = nextZoom
      schedule()
    },

    setView(pan: Vector2D, zoom: number) {
      if (!Number.isFinite(pan.x) || !Number.isFinite(pan.y) || !Number.isFinite(zoom)) return
      pending = { pan: { ...pan }, zoom: clampZoom(zoom) }
      schedule()
    },

    /** Commit immediately at gesture boundaries where later math needs the view. */
    flush() {
      if (frameId !== null) {
        cancelFrame(frameId)
        frameId = null
      }
      commit()
    },

    cancel() {
      if (frameId !== null) cancelFrame(frameId)
      frameId = null
      pending = null
    },
  }
}
