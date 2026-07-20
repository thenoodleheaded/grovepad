import { create } from 'zustand'
import type { Size, Vector2D } from '../types/spatial'
import { clampZoom } from '../types/spatial'
import { cameraEngine, type CameraFrame } from '../engine/camera/cameraEngine'

// ---------------------------------------------------------------------------
// Public camera seam. The engine (src/engine/camera/cameraEngine.ts) owns the
// hot path — it writes the world transform imperatively before this store
// hears about a frame. The store exists so React chrome, tools, and tests
// keep one stable, selector-friendly surface: every action here delegates,
// and pan/zoom mirror the engine frame-accurately (Zustand notify over the
// handful of guarded subscribers is micro-cheap; nothing hook-subscribes
// pan/zoom per frame).
// ---------------------------------------------------------------------------

interface CanvasFitRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasState {
  /** Screen-space translation of the world origin. */
  pan: Vector2D
  /** World→screen scale factor, clamped to [ZOOM_MIN, ZOOM_MAX]. */
  zoom: number
  /** Current viewport size in screen pixels, used for world-space culling. */
  viewportSize: Size
  /** True while a pan/pinch gesture is active. */
  isPanning: boolean
  canGoBack: boolean
  canGoForward: boolean

  panBy: (delta: Vector2D) => void
  setPan: (pan: Vector2D) => void
  setView: (pan: Vector2D, zoom: number) => void
  setViewportSize: (size: Size) => void
  setIsPanning: (isPanning: boolean) => void
  /** Fit immediately by default so framing is an atomic visibility guarantee. */
  fitRect: (rect: CanvasFitRect, padding?: number, animated?: boolean) => void
  /** Zoom keeping the world point under `focalPoint` (viewport px) fixed. */
  zoomTo: (zoom: number, focalPoint: Vector2D) => void
  /** Like zoomTo, but glides to the target over a short eased tween. */
  zoomToAnimated: (zoom: number, focalPoint: Vector2D) => void
  /** Ease to a target view; reduced motion jumps instantly. */
  animateView: (pan: Vector2D, zoom: number, duration?: number) => void
  cancelViewAnimation: () => void
  goBack: () => void
  goForward: () => void
  fitAll: () => void
}

export const useCanvasStore = create<CanvasState>()((set, get) => {
  cameraEngine.connectStore(
    (frame: CameraFrame) => set({ pan: frame.pan, zoom: frame.zoom }),
    (canGoBack, canGoForward) => set({ canGoBack, canGoForward }),
  )

  return {
    pan: { x: 0, y: 0 },
    zoom: 1,
    viewportSize: { width: 1280, height: 720 },
    isPanning: false,
    canGoBack: false,
    canGoForward: false,

    panBy: (delta) => cameraEngine.panBy(delta),

    setPan: (pan) => cameraEngine.setView(pan, cameraEngine.getFrame().zoom),

    setView: (pan, zoom) => cameraEngine.setView(pan, zoom),

    setViewportSize: (viewportSize) => {
      cameraEngine.setViewportSize(viewportSize)
      set((state) =>
        state.viewportSize.width === viewportSize.width &&
        state.viewportSize.height === viewportSize.height
          ? state
          : { viewportSize },
      )
    },

    setIsPanning: (isPanning) => {
      set((state) => (state.isPanning === isPanning ? state : { isPanning }))
    },

    zoomTo: (zoom, focalPoint) => cameraEngine.zoomAtPoint(zoom, focalPoint),

    zoomToAnimated: (zoom, focalPoint) => {
      const next = clampZoom(zoom)
      const { pan, zoom: prev } = cameraEngine.getFrame()
      if (next === prev) return
      const scale = next / prev
      cameraEngine.animateTo(
        {
          x: focalPoint.x - (focalPoint.x - pan.x) * scale,
          y: focalPoint.y - (focalPoint.y - pan.y) * scale,
        },
        next,
        180,
      )
    },

    animateView: (pan, zoom, duration = 300) => cameraEngine.animateTo(pan, zoom, duration),

    cancelViewAnimation: () => cameraEngine.interrupt(),

    goBack: () => cameraEngine.goBack(),

    goForward: () => cameraEngine.goForward(),

    fitRect: (rect, padding = 120, animated = false) => {
      const viewportSize = get().viewportSize
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const availableWidth = Math.max(1, viewportSize.width - padding * 2)
      const availableHeight = Math.max(1, viewportSize.height - padding * 2)
      const zoom = clampZoom(Math.min(1.45, availableWidth / width, availableHeight / height))
      const pan = {
        x: viewportSize.width / 2 - (rect.x + width / 2) * zoom,
        y: viewportSize.height / 2 - (rect.y + height / 2) * zoom,
      }
      if (animated) cameraEngine.animateTo(pan, zoom)
      else cameraEngine.setView(pan, zoom)
    },

    fitAll: () => cameraEngine.animateTo({ x: 0, y: 0 }, 1),
  }
})
