import { memo, useEffect, useRef } from 'react'
import { cameraEngine, subscribeCameraMotion } from '../camera/cameraEngine'
import { viewportToWorldRect } from '../../utils/canvasView'
import type { PrimitiveWidget } from '../../widgets/primitiveWidget'
import type { SpriteRegion } from './spritePainter'
import { DARK_SPRITE_THEME } from './spritePainter'
import type { SpritePaintRequest, SpritePaintResponse } from './spriteWorker'

// ---------------------------------------------------------------------------
// Sprite underlay (tier T2). A world-anchored <canvas> painted by the raster
// worker, sitting UNDER the DOM widget layer: wherever a live card is
// mounted it covers its own sprite; wherever the mount ring hasn't reached,
// the sprite shows instead. During motion the compositor scales this bitmap
// with the world transform — zero main-thread work, no mounts, softness at
// speed by ratified design — and every repaint (re-anchor, settle re-crisp,
// board edits) happens off-thread and lands as one transferFromImageBitmap.
// ---------------------------------------------------------------------------

/** The painted region covers this many viewports beyond the visible rect. */
const REGION_MARGIN_VIEWPORTS = 1.5
/** Repaint when the camera has consumed this fraction of the margin. */
const REANCHOR_FRACTION = 0.45
/** Bitmap cap per axis (device px) — bounds worker cost and memory. */
const MAX_BITMAP_AXIS = 4096
/** Coalescing delay for repaint requests — never on a gesture frame. */
const REPAINT_SLICE_MS = 120

interface SpriteUnderlayProps {
  /** Projections of every widget WITHOUT live DOM (index minus mounted). */
  unmountedWidgets: readonly PrimitiveWidget[]
}

function supported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
}

function computeRegion(): SpriteRegion {
  const { pan, zoom } = cameraEngine.getFrame()
  const viewportSize = cameraEngine.getViewportSize()
  const view = viewportToWorldRect(pan, zoom, viewportSize, 0)
  const marginX = view.width * REGION_MARGIN_VIEWPORTS
  const marginY = view.height * REGION_MARGIN_VIEWPORTS
  const width = view.width + marginX * 2
  const height = view.height + marginY * 2
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)
  // Paint at the live zoom unless the bitmap cap forces a coarser scale —
  // exactly the "scale down only when needed" rule.
  const capScale = Math.min(MAX_BITMAP_AXIS / (width * dpr), MAX_BITMAP_AXIS / (height * dpr))
  const paintZoom = Math.min(zoom, capScale)
  return { x: view.x - marginX, y: view.y - marginY, width, height, paintZoom, devicePixelRatio: dpr }
}

/** True once the camera nears the edge of what the bitmap covers. */
function needsReanchor(region: SpriteRegion): boolean {
  const { pan, zoom } = cameraEngine.getFrame()
  const view = viewportToWorldRect(pan, zoom, cameraEngine.getViewportSize(), 0)
  const slackX = (view.width * REGION_MARGIN_VIEWPORTS) * (1 - REANCHOR_FRACTION)
  const slackY = (view.height * REGION_MARGIN_VIEWPORTS) * (1 - REANCHOR_FRACTION)
  return (
    view.x - slackX < region.x ||
    view.y - slackY < region.y ||
    view.x + view.width + slackX > region.x + region.width ||
    view.y + view.height + slackY > region.y + region.height ||
    // Zoomed in past the painted resolution by more than 2x — repaint sharper.
    zoom > region.paintZoom * 2
  )
}

export const SpriteUnderlay = memo(function SpriteUnderlay({ unmountedWidgets }: SpriteUnderlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widgetsRef = useRef(unmountedWidgets)
  widgetsRef.current = unmountedWidgets
  const schedulePaintRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!supported()) return
    const canvas = canvasRef.current
    if (!canvas) return
    const blitCtx = canvas.getContext('bitmaprenderer')
    if (!blitCtx) return

    const worker = new Worker(new URL('./spriteWorker.ts', import.meta.url), { type: 'module' })
    let generation = 0
    let appliedRegion: SpriteRegion | null = null
    let inFlight = false
    let repaintTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const requestPaint = () => {
      if (disposed || inFlight) return
      inFlight = true
      generation++
      const region = computeRegion()
      const scale = region.paintZoom * region.devicePixelRatio
      const request: SpritePaintRequest = {
        kind: 'paint',
        generation,
        widgets: widgetsRef.current as PrimitiveWidget[],
        region,
        theme: DARK_SPRITE_THEME,
        bitmapWidth: Math.max(1, Math.round(region.width * scale)),
        bitmapHeight: Math.max(1, Math.round(region.height * scale)),
      }
      worker.postMessage(request)
    }

    const schedulePaint = () => {
      if (disposed || repaintTimer !== null) return
      repaintTimer = setTimeout(() => {
        repaintTimer = null
        requestPaint()
      }, REPAINT_SLICE_MS)
    }

    worker.onmessage = (event: MessageEvent<SpritePaintResponse>) => {
      const response = event.data
      inFlight = false
      if (disposed || response.kind !== 'painted') return
      if (response.generation !== generation) {
        // Stale — the camera moved on while this painted. A newer request is
        // already scheduled or about to be; just drop the bitmap.
        response.bitmap.close()
        schedulePaint()
        return
      }
      const canvasEl = canvasRef.current
      if (!canvasEl) return
      canvasEl.width = response.bitmap.width
      canvasEl.height = response.bitmap.height
      blitCtx.transferFromImageBitmap(response.bitmap)
      const region = response.region
      canvasEl.style.transform = `translate3d(${region.x}px, ${region.y}px, 0)`
      canvasEl.style.width = `${region.width}px`
      canvasEl.style.height = `${region.height}px`
      appliedRegion = region
    }

    schedulePaintRef.current = schedulePaint

    // First paint, then follow the camera: repaint slices are timeout-based
    // (never inside a gesture frame) and only fire when the anchor is stale.
    requestPaint()
    const offFrame = cameraEngine.onFrame(() => {
      if (appliedRegion && needsReanchor(appliedRegion)) schedulePaint()
    })
    const offMotion = subscribeCameraMotion((active) => {
      if (!active) schedulePaint() // settle re-crisp at exact zoom
    })

    return () => {
      disposed = true
      schedulePaintRef.current = null
      offFrame()
      offMotion()
      if (repaintTimer !== null) clearTimeout(repaintTimer)
      worker.terminate()
    }
  }, [])

  // Membership changes (mount ring moved at settle, board edits): repaint
  // with the fresh unmounted set. The worker effect owns the scheduler.
  useEffect(() => {
    schedulePaintRef.current?.()
  }, [unmountedWidgets])

  if (!supported()) return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-sprite-underlay
      className="pointer-events-none absolute left-0 top-0 origin-top-left"
    />
  )
})
