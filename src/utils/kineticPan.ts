import type { Vector2D } from '../types/spatial'

export interface TimedPointerPoint extends Vector2D {
  time: number
}

const SAMPLE_WINDOW_MS = 80
const MAX_SPEED_PX_PER_MS = 2.4
const STOP_SPEED_PX_PER_MS = 0.018
const DECAY_TIME_MS = 185

export function shouldStartKineticPan(input: {
  eventType: string
  pointerType: string
  activeGesture: string | null
  touchCountBeforeRelease: number
}): boolean {
  return (
    input.eventType === 'pointerup' &&
    input.pointerType === 'touch' &&
    input.activeGesture === 'pan' &&
    input.touchCountBeforeRelease <= 1
  )
}

export function kineticVelocity(samples: readonly TimedPointerPoint[]): Vector2D {
  const last = samples.at(-1)
  if (!last) return { x: 0, y: 0 }
  const first = [...samples].reverse().find((sample) => last.time - sample.time >= SAMPLE_WINDOW_MS) ?? samples[0]
  if (!first || first === last) return { x: 0, y: 0 }
  const duration = Math.max(1, last.time - first.time)
  const raw = { x: (last.x - first.x) / duration, y: (last.y - first.y) / duration }
  const speed = Math.hypot(raw.x, raw.y)
  if (speed <= MAX_SPEED_PX_PER_MS) return raw
  const scale = MAX_SPEED_PX_PER_MS / speed
  return { x: raw.x * scale, y: raw.y * scale }
}

export function kineticPanFrame(
  velocity: Vector2D,
  elapsedMs: number,
): { delta: Vector2D; velocity: Vector2D; done: boolean } {
  const dt = Math.max(0, Math.min(32, elapsedMs))
  const decay = Math.exp(-dt / DECAY_TIME_MS)
  const next = { x: velocity.x * decay, y: velocity.y * decay }
  return {
    delta: { x: velocity.x * dt, y: velocity.y * dt },
    velocity: next,
    done: Math.hypot(next.x, next.y) < STOP_SPEED_PX_PER_MS,
  }
}
