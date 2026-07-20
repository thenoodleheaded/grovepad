import { useEffect, useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import type { Size } from '../types/spatial'
import { viewportToWorldRect, type WorldRect } from '../utils/canvasView'
import { cameraEngine, subscribeCameraMotion } from '../engine/camera/cameraEngine'

/**
 * Motion-aware quantization (canvas engine contract §4). Culling only
 * recomputes when the camera crosses a chunk/bucket boundary, so ordinary
 * panning costs zero React work — the world layer's CSS transform does
 * everything. The faster the camera, the coarser the boundaries and the
 * rarer the flushes: a zoom gesture that crossed ~47 fine buckets (one
 * SVG-layer re-render each) crosses a handful of coarse ones instead, and
 * the settle flush restores full precision.
 */
const GRANULARITY = {
  idle: { chunk: 256, zoomBucket: 0.02, minIntervalMs: 0 },
  moving: { chunk: 512, zoomBucket: 0.05, minIntervalMs: 120 },
  fast: { chunk: 1024, zoomBucket: 0.15, minIntervalMs: 200 },
} as const

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
  const { chunk, zoomBucket } = GRANULARITY[cameraEngine.getVelocity().tier]
  const raw = viewportToWorldRect(pan, zoom, viewportSize, overscanScreen)
  const x = Math.floor(raw.x / chunk) * chunk
  const y = Math.floor(raw.y / chunk) * chunk
  const right = Math.ceil((raw.x + raw.width) / chunk) * chunk
  const bottom = Math.ceil((raw.y + raw.height) / chunk) * chunk
  return {
    rect: { x, y, width: right - x, height: bottom - y },
    zoom: Math.round(zoom / zoomBucket) * zoomBucket,
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
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    let lastFlushAt = 0

    const flush = () => {
      rafId = 0
      lastFlushAt = performance.now()
      const next = computeView(overscanScreen)
      setView((prev) => (sameView(prev, next) ? prev : next))
    }

    // Flushes are rAF-aligned but also tier-throttled: mid-motion a flush may
    // fire at most once per the tier's min interval, so a fast zoom crosses
    // coarse buckets a few times instead of re-rendering per fine bucket.
    const request = () => {
      if (rafId !== 0 || holdTimer !== null) return
      const { minIntervalMs } = GRANULARITY[cameraEngine.getVelocity().tier]
      const wait = minIntervalMs - (performance.now() - lastFlushAt)
      if (wait > 0) {
        holdTimer = setTimeout(() => {
          holdTimer = null
          if (rafId === 0) rafId = requestAnimationFrame(flush)
        }, wait)
        return
      }
      rafId = requestAnimationFrame(flush)
    }

    // Catch changes that landed between render and effect setup.
    flush()

    const unsubscribeFrames = cameraEngine.onFrame(request)
    // Settle: cancel any hold and reconcile immediately at full precision.
    const unsubscribeMotion = subscribeCameraMotion((active) => {
      if (active) return
      if (holdTimer !== null) {
        clearTimeout(holdTimer)
        holdTimer = null
      }
      if (rafId === 0) rafId = requestAnimationFrame(flush)
    })
    // Viewport size arrives through the store, not engine frames.
    const unsubscribeStore = useCanvasStore.subscribe((state, previous) => {
      if (state.viewportSize !== previous.viewportSize) request()
    })

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId)
      if (holdTimer !== null) clearTimeout(holdTimer)
      unsubscribeFrames()
      unsubscribeMotion()
      unsubscribeStore()
    }
  }, [overscanScreen])

  return view
}
