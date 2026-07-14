import { useEffect, useState } from 'react'
import { useCanvasStore, type CanvasState } from '../store/useCanvasStore'
import type { Size } from '../types/spatial'
import { viewportToWorldRect, type WorldRect } from '../utils/canvasView'

/**
 * World-space chunk the visible rect snaps to. Culling only recomputes when
 * the camera crosses a chunk boundary, so ordinary panning costs zero React
 * work — the world layer's CSS transform does everything.
 */
const VIEW_CHUNK = 256

/** Zoom is bucketed so tiny pinch jitter doesn't invalidate render lists. */
const ZOOM_BUCKET = 0.02

export interface QuantizedView {
  /** Visible world rect, expanded by overscan and snapped outward to chunks. */
  rect: WorldRect
  /** Bucketed zoom — precise enough for LOD thresholds, stable under jitter. */
  zoom: number
  viewportSize: Size
}

function computeView(state: CanvasState, overscanScreen: number): QuantizedView {
  const raw = viewportToWorldRect(state.pan, state.zoom, state.viewportSize, overscanScreen)
  const x = Math.floor(raw.x / VIEW_CHUNK) * VIEW_CHUNK
  const y = Math.floor(raw.y / VIEW_CHUNK) * VIEW_CHUNK
  const right = Math.ceil((raw.x + raw.width) / VIEW_CHUNK) * VIEW_CHUNK
  const bottom = Math.ceil((raw.y + raw.height) / VIEW_CHUNK) * VIEW_CHUNK
  return {
    rect: { x, y, width: right - x, height: bottom - y },
    zoom: Math.round(state.zoom / ZOOM_BUCKET) * ZOOM_BUCKET,
    viewportSize: state.viewportSize,
  }
}

function sameView(a: QuantizedView, b: QuantizedView): boolean {
  return (
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height &&
    a.zoom === b.zoom &&
    a.viewportSize === b.viewportSize
  )
}

/**
 * rAF-coalesced, chunk-quantized camera snapshot for world-space layers.
 *
 * High-frequency pan/zoom updates are folded to at most one state check per
 * frame, and the returned snapshot only changes identity when the quantized
 * rect, zoom bucket, or viewport actually change — so subscribing components
 * do not re-render at all during in-chunk panning.
 */
export function useQuantizedView(overscanScreen: number): QuantizedView {
  const [view, setView] = useState(() =>
    computeView(useCanvasStore.getState(), overscanScreen),
  )

  useEffect(() => {
    let latest = useCanvasStore.getState()
    let rafId = 0

    const flush = () => {
      rafId = 0
      const next = computeView(latest, overscanScreen)
      setView((prev) => (sameView(prev, next) ? prev : next))
    }

    // Catch changes that landed between render and effect setup.
    flush()

    const unsubscribe = useCanvasStore.subscribe((state) => {
      if (
        state.pan === latest.pan &&
        state.zoom === latest.zoom &&
        state.viewportSize === latest.viewportSize
      ) {
        return
      }
      latest = state
      if (rafId === 0) rafId = requestAnimationFrame(flush)
    })

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId)
      unsubscribe()
    }
  }, [overscanScreen])

  return view
}
