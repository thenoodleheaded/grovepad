export type CameraMotionSource = 'wheel' | 'pointer' | 'kinetic' | 'animation'

interface CameraMotionRenderer {
  show: () => void
  hide: () => void
}

type CameraMotionListener = (active: boolean) => void

const activeSources = new Set<CameraMotionSource>()
const listeners = new Set<CameraMotionListener>()
let renderer: CameraMotionRenderer | null = null

/**
 * Coordinates the temporary, single-canvas camera preview without putting
 * frame-by-frame state in React. Sources are tracked independently so a wheel
 * gesture can hand off to kinetic pan or a camera tween without a flash of the
 * full widget DOM between them.
 */
export function beginCameraMotion(source: CameraMotionSource): boolean {
  if (!renderer) return false
  const wasActive = activeSources.size > 0
  activeSources.add(source)
  if (!wasActive) {
    renderer.show()
    for (const listener of listeners) listener(true)
  }
  return true
}

export function endCameraMotion(source: CameraMotionSource): void {
  if (!activeSources.delete(source) || activeSources.size > 0) return
  for (const listener of listeners) listener(false)
}

export function isCameraMotionActive(): boolean {
  return activeSources.size > 0
}

/**
 * The infinite world element deliberately has no box of its own; its children
 * overflow into world space. Even `inset(0%)` clips that overflow to the
 * element's zero-sized border box, so the idle value must be `none`.
 */
export function cameraWorldClipPath(active: boolean): 'inset(50%)' | 'none' {
  return active ? 'inset(50%)' : 'none'
}

export function subscribeCameraMotion(listener: CameraMotionListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function registerCameraMotionRenderer(next: CameraMotionRenderer): () => void {
  renderer = next
  if (activeSources.size > 0) renderer.show()
  return () => {
    if (renderer !== next) return
    renderer = null
    activeSources.clear()
  }
}

/** The viewport calls this only after the real widget DOM is ready to reveal. */
export function hideCameraMotionPreview(): void {
  if (activeSources.size === 0) renderer?.hide()
}
