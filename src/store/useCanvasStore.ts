import { create } from 'zustand'
import type { Size, Vector2D } from '../types/spatial'
import { clampZoom } from '../types/spatial'

export interface CanvasFitRect {
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
  /** True while a middle-click or Space+drag pan gesture is active. */
  isPanning: boolean
  canGoBack: boolean
  canGoForward: boolean

  panBy: (delta: Vector2D) => void
  setPan: (pan: Vector2D) => void
  setView: (pan: Vector2D, zoom: number) => void
  setViewportSize: (size: Size) => void
  setIsPanning: (isPanning: boolean) => void
  fitRect: (rect: CanvasFitRect, padding?: number) => void
  /**
   * Set the zoom level while keeping the world point currently under
   * `focalPoint` (viewport-relative screen coordinates) stationary.
   *
   * world = (focal - pan) / zoom must be invariant, so
   * pan' = focal - (focal - pan) * (zoom' / zoom)
   */
  zoomTo: (zoom: number, focalPoint: Vector2D) => void
  /** Like zoomTo, but glides to the target over a short eased tween. */
  zoomToAnimated: (zoom: number, focalPoint: Vector2D) => void
  /**
   * Ease the camera to a target pan/zoom. The tween is a finite rAF loop
   * (~300ms) that any user gesture cancels; it never runs while idle.
   * Falls back to an instant jump when the user prefers reduced motion.
   */
  animateView: (pan: Vector2D, zoom: number, duration?: number) => void
  cancelViewAnimation: () => void
  goBack: () => void
  goForward: () => void
  fitAll: () => void
}

const reducedMotion =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

let animationFrame = 0

function easeOutQuint(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv * inv * inv
}

export const useCanvasStore = create<CanvasState>()((set, get) => {
  const backStack: Array<{ pan: Vector2D; zoom: number }> = []
  const forwardStack: Array<{ pan: Vector2D; zoom: number }> = []
  let applyingHistory = false
  const recordView = () => {
    if (applyingHistory) return
    const { pan, zoom } = get()
    const last = backStack.at(-1)
    if (!last || last.pan.x !== pan.x || last.pan.y !== pan.y || last.zoom !== zoom) {
      backStack.push({ pan: { ...pan }, zoom })
      if (backStack.length > 30) backStack.shift()
    }
    forwardStack.length = 0
    set({ canGoBack: backStack.length > 0, canGoForward: false })
  }
  const cancelAnimation = () => {
    if (animationFrame !== 0) {
      cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }
  }

  return {
    pan: { x: 0, y: 0 },
    zoom: 1,
    viewportSize: { width: 1280, height: 720 },
    isPanning: false,
    canGoBack: false,
    canGoForward: false,

    panBy: (delta) => {
      cancelAnimation()
      if (delta.x === 0 && delta.y === 0) return
      set((state) => ({
        pan: { x: state.pan.x + delta.x, y: state.pan.y + delta.y },
      }))
    },

    setPan: (pan) => {
      cancelAnimation()
      set((state) =>
        state.pan.x === pan.x && state.pan.y === pan.y ? state : { pan },
      )
    },

    setView: (pan, zoom) => {
      cancelAnimation()
      const nextZoom = clampZoom(zoom)
      set((state) =>
        state.pan.x === pan.x &&
        state.pan.y === pan.y &&
        state.zoom === nextZoom
          ? state
          : { pan, zoom: nextZoom },
      )
    },

    setViewportSize: (viewportSize) =>
      set((state) =>
        state.viewportSize.width === viewportSize.width &&
        state.viewportSize.height === viewportSize.height
          ? state
          : { viewportSize },
      ),

    setIsPanning: (isPanning) => {
      if (isPanning) cancelAnimation()
      set((state) => (state.isPanning === isPanning ? state : { isPanning }))
    },

    zoomTo: (zoom, focalPoint) => {
      cancelAnimation()
      const next = clampZoom(zoom)
      const { pan, zoom: prev } = get()
      if (next === prev) return
      const scale = next / prev
      set({
        zoom: next,
        pan: {
          x: focalPoint.x - (focalPoint.x - pan.x) * scale,
          y: focalPoint.y - (focalPoint.y - pan.y) * scale,
        },
      })
    },

    zoomToAnimated: (zoom, focalPoint) => {
      const next = clampZoom(zoom)
      const { pan, zoom: prev } = get()
      if (next === prev) return
      const scale = next / prev
      get().animateView(
        {
          x: focalPoint.x - (focalPoint.x - pan.x) * scale,
          y: focalPoint.y - (focalPoint.y - pan.y) * scale,
        },
        next,
        180,
      )
    },

    animateView: (targetPan, targetZoom, duration = 300) => {
      cancelAnimation()
      const endZoom = clampZoom(targetZoom)
      const { pan: startPan, zoom: startZoom } = get()
      if (
        startPan.x === targetPan.x &&
        startPan.y === targetPan.y &&
        startZoom === endZoom
      ) {
        return
      }
      recordView()
      if (reducedMotion?.matches || duration <= 0) {
        set({ pan: targetPan, zoom: endZoom })
        return
      }

      // Interpolate zoom in log space so the scale change feels uniform.
      const startLogZoom = Math.log(startZoom)
      const logZoomSpan = Math.log(endZoom) - startLogZoom
      const startTime = performance.now()

      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration)
        const eased = easeOutQuint(t)
        set({
          pan: {
            x: startPan.x + (targetPan.x - startPan.x) * eased,
            y: startPan.y + (targetPan.y - startPan.y) * eased,
          },
          zoom: Math.exp(startLogZoom + logZoomSpan * eased),
        })
        animationFrame = t < 1 ? requestAnimationFrame(step) : 0
      }

      animationFrame = requestAnimationFrame(step)
    },

    cancelViewAnimation: cancelAnimation,

    goBack: () => {
      const previous = backStack.pop()
      if (!previous) return
      const current = get()
      forwardStack.push({ pan: { ...current.pan }, zoom: current.zoom })
      applyingHistory = true
      get().animateView(previous.pan, previous.zoom, 220)
      applyingHistory = false
      set({ canGoBack: backStack.length > 0, canGoForward: true })
    },

    goForward: () => {
      const next = forwardStack.pop()
      if (!next) return
      const current = get()
      backStack.push({ pan: { ...current.pan }, zoom: current.zoom })
      applyingHistory = true
      get().animateView(next.pan, next.zoom, 220)
      applyingHistory = false
      set({ canGoBack: true, canGoForward: forwardStack.length > 0 })
    },

    fitRect: (rect, padding = 120) => {
      const { viewportSize } = get()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const availableWidth = Math.max(1, viewportSize.width - padding * 2)
      const availableHeight = Math.max(1, viewportSize.height - padding * 2)
      const zoom = clampZoom(Math.min(1.45, availableWidth / width, availableHeight / height))
      get().animateView(
        {
          x: viewportSize.width / 2 - (rect.x + width / 2) * zoom,
          y: viewportSize.height / 2 - (rect.y + height / 2) * zoom,
        },
        zoom,
      )
    },

    fitAll: () => get().animateView({ x: 0, y: 0 }, 1),
  }
})
