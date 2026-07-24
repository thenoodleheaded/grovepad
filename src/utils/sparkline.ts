// ---------------------------------------------------------------------------
// Sparkline geometry for resting widget faces.
//
// Pure math, no DOM: a resting tile must be able to draw its face from data
// alone, once, and then cost nothing per frame. Everything here is bounded —
// a series of any length collapses to at most SAMPLE_LIMIT marks, so a chart
// holding thousands of points still rests as a handful of SVG nodes.
// ---------------------------------------------------------------------------

/** Upper bound on marks drawn in a resting face, whatever the series length. */
export const SAMPLE_LIMIT = 24

export interface SeriesPoint {
  value: number
  color?: string
}

export interface SparkBar {
  x: number
  y: number
  width: number
  height: number
  color?: string
}

export interface DonutSegment {
  /** Share of the positive total, 0..1. */
  fraction: number
  /** Running start of this segment, 0..1. */
  offset: number
  color?: string
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Evenly-spaced subsample that always keeps the first and last point, so the
 * face still reads as the real shape of a long series.
 */
export function sampleSeries<T>(points: readonly T[], limit = SAMPLE_LIMIT): T[] {
  if (points.length <= limit) return [...points]
  const step = (points.length - 1) / (limit - 1)
  const out: T[] = []
  for (let i = 0; i < limit; i++) out.push(points[Math.round(i * step)]!)
  return out
}

/** Polyline path across the box; flat mid-line when every value is equal. */
export function sparklinePath(values: readonly number[], width: number, height: number): string {
  const points = sampleSeries(values)
  if (points.length === 0) return ''
  if (points.length === 1) return `M 0 ${round(height / 2)} L ${round(width)} ${round(height / 2)}`

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min
  const stepX = width / (points.length - 1)

  let path = ''
  points.forEach((value, index) => {
    const x = round(index * stepX)
    // A flat series sits on the mid-line rather than collapsing onto an edge.
    const ratio = span === 0 ? 0.5 : (value - min) / span
    const y = round(height - ratio * height)
    path += `${index === 0 ? 'M' : ' L'} ${x} ${y}`
  })
  return path
}

/**
 * Bars measured from the zero baseline, so a series containing negatives
 * reads correctly instead of being flattened against the bottom edge.
 */
export function sparklineBars(
  points: readonly SeriesPoint[],
  width: number,
  height: number,
  gap = 2,
): SparkBar[] {
  const sampled = sampleSeries(points)
  if (sampled.length === 0) return []

  const values = sampled.map((point) => point.value)
  const domainMax = Math.max(0, ...values)
  const domainMin = Math.min(0, ...values)
  const span = domainMax - domainMin || 1
  const slot = width / sampled.length
  const barWidth = Math.max(1, slot - gap)
  const zeroY = height - ((0 - domainMin) / span) * height

  return sampled.map((point, index) => {
    const valueY = height - ((point.value - domainMin) / span) * height
    const top = Math.min(valueY, zeroY)
    return {
      x: round(index * slot + (slot - barWidth) / 2),
      // A zero-value bar keeps a hairline so the slot never reads as missing.
      y: round(Math.min(top, height - 1)),
      width: round(barWidth),
      height: round(Math.max(1, Math.abs(valueY - zeroY))),
      color: point.color,
    }
  })
}

/** Ring shares of the positive total. Negatives and zeroes take no arc. */
export function donutSegments(points: readonly SeriesPoint[]): DonutSegment[] {
  const positive = sampleSeries(points).filter((point) => point.value > 0)
  const total = positive.reduce((sum, point) => sum + point.value, 0)
  if (total <= 0) return []

  let offset = 0
  return positive.map((point) => {
    const fraction = point.value / total
    const segment: DonutSegment = { fraction: round(fraction), offset: round(offset), color: point.color }
    offset += fraction
    return segment
  })
}
