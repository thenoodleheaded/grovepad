import type { Size, Vector2D } from '../../types/spatial'
import { clampZoom } from '../../types/spatial'

// ---------------------------------------------------------------------------
// Camera engine core (canvas engine contract §1).
//
// During a gesture frame this module writes the camera transform. Camera
// state lives here, outside React; the world element's transform is set
// imperatively the instant a frame arrives, and everything else (store
// mirror, minimap) observes through listeners.
// ---------------------------------------------------------------------------

export interface CameraFrame {
  pan: Vector2D
  zoom: number
}

/** Kinetic glide: speed halves roughly every 150ms; stops below 12 px/s. */
const GLIDE_DECAY_MS = 220
const GLIDE_STOP_SPEED = 12

let frame: CameraFrame = { pan: { x: 0, y: 0 }, zoom: 1 }
let viewportSize: Size = { width: 1280, height: 720 }
let worldEl: HTMLElement | null = null

let storeSink: ((frame: CameraFrame) => void) | null = null
let historySink: ((canGoBack: boolean, canGoForward: boolean) => void) | null = null
const frameListeners = new Set<(frame: CameraFrame) => void>()

let animationRaf = 0
let glideRaf = 0

const backStack: CameraFrame[] = []
const forwardStack: CameraFrame[] = []
let applyingHistory = false

const reducedMotion =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

function easeOutQuint(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv * inv * inv
}

function applyTransform(): void {
  if (!worldEl) return
  worldEl.style.transform = `translate3d(${frame.pan.x}px, ${frame.pan.y}px, 0) scale(${frame.zoom})`
}

function commit(pan: Vector2D, zoom: number): void {
  const clamped = clampZoom(zoom)
  if (frame.pan.x === pan.x && frame.pan.y === pan.y && frame.zoom === clamped) return
  frame = { pan: { x: pan.x, y: pan.y }, zoom: clamped }
  applyTransform()
  storeSink?.(frame)
  for (const listener of frameListeners) listener(frame)
}

function stopAnimation(): void {
  if (animationRaf !== 0) {
    cancelAnimationFrame(animationRaf)
    animationRaf = 0
  }
}

function stopGlide(): void {
  if (glideRaf !== 0) {
    cancelAnimationFrame(glideRaf)
    glideRaf = 0
  }
}

function pushHistoryEntry(): void {
  if (applyingHistory) return
  const last = backStack.at(-1)
  if (!last || last.pan.x !== frame.pan.x || last.pan.y !== frame.pan.y || last.zoom !== frame.zoom) {
    backStack.push({ pan: { ...frame.pan }, zoom: frame.zoom })
    if (backStack.length > 30) backStack.shift()
  }
  forwardStack.length = 0
  historySink?.(backStack.length > 0, false)
}

export const cameraEngine = {
  getFrame: (): CameraFrame => frame,
  getViewportSize: (): Size => viewportSize,

  registerWorld(el: HTMLElement | null): void {
    worldEl = el
    if (el) {
      el.style.willChange = 'transform'
      applyTransform()
    }
  },

  connectStore(
    sink: (frame: CameraFrame) => void,
    history: (canGoBack: boolean, canGoForward: boolean) => void,
  ): void {
    storeSink = sink
    historySink = history
  },

  onFrame(listener: (frame: CameraFrame) => void): () => void {
    frameListeners.add(listener)
    return () => frameListeners.delete(listener)
  },

  /** Interrupt any tween/glide — every direct gesture write starts here. */
  interrupt(): void {
    stopAnimation()
    stopGlide()
  },

  setViewportSize(size: Size): void {
    // A hidden or not-yet-laid-out host measures 0×0; keep the last known
    // real size instead of collapsing every viewport-derived rect to nothing.
    if (size.width < 1 || size.height < 1) return
    viewportSize = size
  },

  setView(pan: Vector2D, zoom: number): void {
    this.interrupt()
    commit(pan, zoom)
  },

  panBy(delta: Vector2D): void {
    this.interrupt()
    if (delta.x === 0 && delta.y === 0) return
    commit({ x: frame.pan.x + delta.x, y: frame.pan.y + delta.y }, frame.zoom)
  },

  /** Zoom keeping the world point under `focal` (viewport px) stationary. */
  zoomAtPoint(zoom: number, focal: Vector2D): void {
    this.interrupt()
    const next = clampZoom(zoom)
    if (next === frame.zoom) return
    const scale = next / frame.zoom
    commit(
      {
        x: focal.x - (focal.x - frame.pan.x) * scale,
        y: focal.y - (focal.y - frame.pan.y) * scale,
      },
      next,
    )
  },

  animateTo(targetPan: Vector2D, targetZoom: number, duration = 300): void {
    this.interrupt()
    const endZoom = clampZoom(targetZoom)
    if (frame.pan.x === targetPan.x && frame.pan.y === targetPan.y && frame.zoom === endZoom) return
    pushHistoryEntry()
    if (reducedMotion?.matches || duration <= 0) {
      commit(targetPan, endZoom)
      return
    }
    const startPan = { ...frame.pan }
    const startLogZoom = Math.log(frame.zoom)
    const logZoomSpan = Math.log(endZoom) - startLogZoom
    const startTime = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = easeOutQuint(t)
      commit(
        {
          x: startPan.x + (targetPan.x - startPan.x) * eased,
          y: startPan.y + (targetPan.y - startPan.y) * eased,
        },
        Math.exp(startLogZoom + logZoomSpan * eased),
      )
      animationRaf = t < 1 ? requestAnimationFrame(step) : 0
    }
    animationRaf = requestAnimationFrame(step)
  },

  /** Kinetic glide from a release velocity (screen px/s), decaying
   * exponentially. Any direct write interrupts it. */
  glide(velocity: Vector2D): void {
    this.interrupt()
    if (reducedMotion?.matches) return
    let vx = velocity.x
    let vy = velocity.y
    if (Math.hypot(vx, vy) < GLIDE_STOP_SPEED * 4) return
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      const decay = Math.exp(-dt / GLIDE_DECAY_MS)
      vx *= decay
      vy *= decay
      if (Math.hypot(vx, vy) < GLIDE_STOP_SPEED) {
        glideRaf = 0
        return
      }
      commit({ x: frame.pan.x + (vx * dt) / 1000, y: frame.pan.y + (vy * dt) / 1000 }, frame.zoom)
      glideRaf = requestAnimationFrame(step)
    }
    glideRaf = requestAnimationFrame(step)
  },

  recordView: pushHistoryEntry,

  goBack(): void {
    const previous = backStack.pop()
    if (!previous) return
    forwardStack.push({ pan: { ...frame.pan }, zoom: frame.zoom })
    applyingHistory = true
    this.animateTo(previous.pan, previous.zoom, 220)
    applyingHistory = false
    historySink?.(backStack.length > 0, true)
  },

  goForward(): void {
    const next = forwardStack.pop()
    if (!next) return
    backStack.push({ pan: { ...frame.pan }, zoom: frame.zoom })
    applyingHistory = true
    this.animateTo(next.pan, next.zoom, 220)
    applyingHistory = false
    historySink?.(true, forwardStack.length > 0)
  },
}
