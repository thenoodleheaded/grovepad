export type TextSkinMode = 'plain' | 'sticky' | 'typewriter'

/**
 * Sticky ink. One colour, one nib, no layers — the pen is for circling a word
 * and crossing something out, not for drawing.
 *
 * Points are fractions of the note's own surface, so the scribble lands on the
 * same word at every card size and shrinks with the card into its resting
 * tile. Storing pixels would have pinned the ink to whatever width the note
 * happened to be when the pen was down.
 */
export interface StickyStroke {
  /** Flat `[x, y, x, y, …]` in 0–1 surface fractions. */
  points: readonly number[]
}

export const STICKY_STROKE_LIMIT = 48
export const STICKY_STROKE_POINT_LIMIT = 320

function fraction(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(1, Math.max(0, Math.round(raw * 1000) / 1000))
    : null
}

/** Bounded read of untrusted ink: anything malformed is dropped, never thrown. */
export function stickyStrokes(raw: unknown): StickyStroke[] {
  if (!Array.isArray(raw)) return []
  const strokes: StickyStroke[] = []
  for (const item of raw.slice(0, STICKY_STROKE_LIMIT)) {
    const source = item && typeof item === 'object' && !Array.isArray(item)
      ? (item as { points?: unknown }).points
      : null
    if (!Array.isArray(source)) continue
    const points: number[] = []
    for (const value of source.slice(0, STICKY_STROKE_POINT_LIMIT * 2)) {
      const coordinate = fraction(value)
      if (coordinate === null) break
      points.push(coordinate)
    }
    // An odd tail is half a point, and half a point is not a position.
    if (points.length >= 4) strokes.push({ points: points.slice(0, points.length - (points.length % 2)) })
  }
  return strokes
}

/** The SVG path for one stroke in the 0–1 box the points were sampled in. */
export function stickyStrokePath(stroke: StickyStroke): string {
  const { points } = stroke
  let path = ''
  for (let index = 0; index + 1 < points.length; index += 2) {
    path += `${index === 0 ? 'M' : 'L'}${points[index]!.toFixed(3)} ${points[index + 1]!.toFixed(3)}`
  }
  return path
}

/** Strokes that pass within `radius` (surface fractions) of the eraser. */
export function eraseStickyStrokes(
  strokes: readonly StickyStroke[],
  x: number,
  y: number,
  radius: number,
): StickyStroke[] {
  const limit = radius * radius
  return strokes.filter((stroke) => {
    const { points } = stroke
    for (let index = 0; index + 1 < points.length; index += 2) {
      const dx = points[index]! - x
      const dy = points[index + 1]! - y
      if (dx * dx + dy * dy <= limit) return false
    }
    return true
  })
}
