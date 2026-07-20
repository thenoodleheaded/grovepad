import { useEffect, useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import type { Size } from '../types/spatial'
import { viewportToWorldRect, type WorldRect } from '../utils/canvasView'
import { cameraEngine } from '../engine/camera/cameraEngine'

/**
 * World-space chunk the visible rect snaps to. Culling only recomputes when
 * the camera crosses a chunk boundary, so ordinary panning costs zero React
 * work — the world layer's CSS transform does everything.
 */
const VIEW_CHUNK = 256

/** Zoom is bucketed so tiny pinch jitter doesn't invalidate camera culling. */
const ZOOM_BUCKET = 0.02

export interface QuantizedView {
  /** Visible world rect, expanded by overscan and snapped outward to chunks. */
  rect: WorldRect
  /** Bucketed zoom for stable world-rect culling during camera motion. */
  zoom: number
  viewportSize: Size
}

function computeView(overscanScreen: number): QuantizedView {
  const { pan, zoom } = cameraEngine.getFrame()
  const viewportSize = cameraEngine.getViewportSize()
  const raw = viewportToWorldRect(pan, zoom, viewportSize, overscanScreen)
  const x = Math.floor(raw.x / VIEW_CHUNK) * VIEW_CHUNK
  const y = Math.floor(raw.y / VIEW_CHUNK) * VIEW_CHUNK
  const right = Math.ceil((raw.x + raw.width) / VIEW_CHUNK) * VIEW_CHUNK
  const bottom = Math.ceil((raw.y + raw.height) / VIEW_CHUNK) * VIEW_CHUNK
  return {
    rect: { x, y, width: right - x, height: bottom - y },
    zoom: Math.round(zoom / ZOOM_BUCKET) * ZOOM_BUCKET,
    viewportSize,
  }
}

function sameView(a: QuantizedView, b: QuantizedView): boolean {
  return (
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height &&
    a.zoom === b.zoom &&
    a.viewportSize.width === b.viewportSize.width &&
    a.viewportSize.height === b.viewportSize.height
  )
}

/**
 * rAF-coalesced, chunk-quantized camera snapshot for world-space layers.
 *
 * Engine frames are folded to at most one recompute per animation frame, and
 * the snapshot only changes identity when the quantized rect, zoom bucket, or
 * viewport actually change — so subscribers never re-render during in-chunk
 * panning, and culling keeps up continuously during motion (the old pipeline
 * paused culling mid-gesture and paid for it with a giant settle reveal).
 */
export function useQuantizedView(overscanScreen: number): QuantizedView {
  const [view, setView] = useState(() => computeView(overscanScreen))

  useEffect(() => {
    let rafId = 0

    const flush = () => {
      rafId = 0
      const next = computeView(overscanScreen)
      setView((prev) => (sameView(prev, next) ? prev : next))
    }

    // Catch changes that landed between render and effect setup.
    flush()

    const unsubscribeFrames = cameraEngine.onFrame(() => {
      if (rafId === 0) rafId = requestAnimationFrame(flush)
    })
    // Viewport size arrives through the store, not engine frames.
    const unsubscribeStore = useCanvasStore.subscribe((state, previous) => {
      if (state.viewportSize !== previous.viewportSize && rafId === 0) {
        rafId = requestAnimationFrame(flush)
      }
    })

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId)
      unsubscribeFrames()
      unsubscribeStore()
    }
  }, [overscanScreen])

  return view
}
