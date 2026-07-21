import type { Vector2D } from '../types/spatial'

// ---------------------------------------------------------------------------
// Scripted 20-second camera tour (canvas engine contract, gate 1). A pure
// function of time → camera, so the same tour drives the old pipeline, the
// new engine, vitest, and the CLI runner identically.
//
// Segments: slow pan → fast pan → fling glide (exponential decay) → zoom out
// to overview → traverse at far zoom → deep zoom in → diagonal glide → settle.
// ---------------------------------------------------------------------------

export const TOUR_DURATION_MS = 20_000

export interface TourCamera {
  pan: Vector2D
  zoom: number
}

export interface TourWorld {
  minX: number
  minY: number
  maxX: number
  maxY: number
  viewportWidth: number
  viewportHeight: number
}

interface Segment {
  untilMs: number
  at: (t: number, world: TourWorld) => { center: Vector2D; zoom: number }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const decay = (t: number, k: number) => 1 - Math.exp(-k * t) * (1 - t)

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function worldCenter(world: TourWorld): Vector2D {
  return { x: (world.minX + world.maxX) / 2, y: (world.minY + world.maxY) / 2 }
}

/** Zoom that fits the whole world with a margin — the overview level. */
export function overviewZoom(world: TourWorld): number {
  const spanX = Math.max(1, world.maxX - world.minX)
  const spanY = Math.max(1, world.maxY - world.minY)
  return Math.min(world.viewportWidth / (spanX * 1.1), world.viewportHeight / (spanY * 1.1))
}

function segments(world: TourWorld): Segment[] {
  const c = worldCenter(world)
  const far = overviewZoom(world)
  const west = { x: world.minX + (world.maxX - world.minX) * 0.15, y: c.y }
  const east = { x: world.minX + (world.maxX - world.minX) * 0.85, y: c.y }
  const north = { x: c.x, y: world.minY + (world.maxY - world.minY) * 0.12 }
  const south = { x: c.x, y: world.minY + (world.maxY - world.minY) * 0.88 }
  return [
    // 0-3s: slow drift at working zoom — the crisp tier must hold.
    { untilMs: 3000, at: (t) => ({ center: { x: lerp(west.x, c.x, easeInOut(t)), y: west.y }, zoom: 1 }) },
    // 3-6s: fast pan west→east across clusters.
    { untilMs: 6000, at: (t) => ({ center: { x: lerp(c.x, east.x, t), y: c.y }, zoom: 1 }) },
    // 6-9s: fling glide back — high velocity decaying exponentially.
    { untilMs: 9000, at: (t) => ({ center: { x: lerp(east.x, west.x, decay(t, 6)), y: c.y }, zoom: 1 }) },
    // 9-12s: zoom out to the full-board overview.
    { untilMs: 12_000, at: (t) => ({ center: { x: lerp(west.x, c.x, easeInOut(t)), y: c.y }, zoom: lerp(1, far, easeInOut(t)) }) },
    // 12-14s: traverse north→south while fully zoomed out.
    { untilMs: 14_000, at: (t, w) => ({ center: { x: c.x, y: lerp(north.y, south.y, t) }, zoom: overviewZoom(w) }) },
    // 14-17s: deep zoom back into a corner cluster.
    { untilMs: 17_000, at: (t, w) => ({ center: { x: lerp(c.x, north.x, easeInOut(t)), y: lerp(south.y, north.y, easeInOut(t)) }, zoom: lerp(overviewZoom(w), 1.4, easeInOut(t)) }) },
    // 17-19s: diagonal glide at above-working zoom.
    { untilMs: 19_000, at: (t) => ({ center: { x: lerp(north.x, south.x, decay(t, 5)), y: lerp(north.y, c.y, decay(t, 5)) }, zoom: 1.4 }) },
    // 19-20s: settle — governor must re-crisp here.
    { untilMs: TOUR_DURATION_MS, at: () => ({ center: { x: south.x, y: c.y }, zoom: 1.4 }) },
  ]
}

/** Camera at time t (ms since tour start), as pan+zoom for setView. */
export function tourCameraAt(tMs: number, world: TourWorld): TourCamera {
  const clamped = Math.max(0, Math.min(TOUR_DURATION_MS, tMs))
  let previousEnd = 0
  for (const segment of segments(world)) {
    if (clamped <= segment.untilMs) {
      const span = segment.untilMs - previousEnd
      const local = span > 0 ? (clamped - previousEnd) / span : 1
      const { center, zoom } = segment.at(local, world)
      // pan is the screen-space translation that puts `center` mid-viewport.
      return {
        pan: {
          x: world.viewportWidth / 2 - center.x * zoom,
          y: world.viewportHeight / 2 - center.y * zoom,
        },
        zoom,
      }
    }
    previousEnd = segment.untilMs
  }
  const last = segments(world).at(-1)!
  const { center, zoom } = last.at(1, world)
  return {
    pan: {
      x: world.viewportWidth / 2 - center.x * zoom,
      y: world.viewportHeight / 2 - center.y * zoom,
    },
    zoom,
  }
}
