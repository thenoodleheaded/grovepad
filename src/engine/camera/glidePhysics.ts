import type { Vector2D } from '../../types/spatial'

// ---------------------------------------------------------------------------
// Pure fling math for the gesture engine — separated so release-velocity
// estimation is unit-testable without pointer events.
// ---------------------------------------------------------------------------

export interface TimedPoint {
  x: number
  y: number
  time: number
}

/** Only samples inside this window count toward release velocity: a finger
 * that stopped before lifting must produce zero, not its old speed. */
export const FLING_WINDOW_MS = 140
/** Below this release speed a fling is a tap-stop, not a glide. */
export const FLING_MIN_SPEED = 60
/** Ceiling keeps a wild sample from launching the board into orbit. */
export const FLING_MAX_SPEED = 4200

/** Release velocity in screen px/s from the recent sample trail. */
export function flingVelocity(samples: readonly TimedPoint[]): Vector2D {
  if (samples.length < 2) return { x: 0, y: 0 }
  const last = samples[samples.length - 1]!
  const cutoff = last.time - FLING_WINDOW_MS
  let first = samples[0]!
  for (const sample of samples) {
    if (sample.time >= cutoff) {
      first = sample
      break
    }
  }
  const dt = last.time - first.time
  if (dt <= 0) return { x: 0, y: 0 }
  const vx = ((last.x - first.x) / dt) * 1000
  const vy = ((last.y - first.y) / dt) * 1000
  const speed = Math.hypot(vx, vy)
  if (speed < FLING_MIN_SPEED) return { x: 0, y: 0 }
  if (speed > FLING_MAX_SPEED) {
    const scale = FLING_MAX_SPEED / speed
    return { x: vx * scale, y: vy * scale }
  }
  return { x: vx, y: vy }
}

/** Trim a sample trail to the fling window around its newest entry. */
export function trimSamples(samples: TimedPoint[], now: number): void {
  const cutoff = now - FLING_WINDOW_MS
  while (samples.length > 2 && samples[0]!.time < cutoff) samples.shift()
}
