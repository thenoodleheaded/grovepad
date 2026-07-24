import type { SketchpadPoint, SketchpadStroke } from '../types/widgetDataCore'

export interface SketchSurfaceRect {
  left: number
  top: number
  width: number
  height: number
}

export interface SketchPointerSample {
  clientX: number
  clientY: number
  pressure: number
  pointerType: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function shouldStartSketchStroke(pointerType: string): boolean {
  return pointerType === 'pen' || pointerType === 'mouse'
}

export function normalizedSketchPressure(pointerType: string, pressure: number): number {
  if (pointerType === 'mouse') return pressure > 0 ? clamp(pressure, 0.2, 1) : 0.5
  return pressure > 0 ? clamp(pressure, 0.08, 1) : 0.35
}

export function sketchPointFromPointer(
  rect: SketchSurfaceRect,
  sample: SketchPointerSample,
): SketchpadPoint {
  return {
    x: clamp((sample.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
    y: clamp((sample.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    pressure: normalizedSketchPressure(sample.pointerType, sample.pressure),
  }
}

export function sketchStrokeWidth(size: number, pressure: number): number {
  return Math.max(0.75, size * (0.38 + clamp(pressure, 0, 1) * 1.24))
}

export function sketchPointDistancePixels(
  a: SketchpadPoint,
  b: SketchpadPoint,
  width: number,
  height: number,
): number {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height)
}

function pointToSegmentDistance3d(
  point: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const denominator = dx * dx + dy * dy + dz * dz
  if (denominator === 0) {
    return Math.hypot(point[0] - a[0], point[1] - a[1], point[2] - a[2])
  }
  const t = clamp(
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy + (point[2] - a[2]) * dz) /
      denominator,
    0,
    1,
  )
  return Math.hypot(
    point[0] - (a[0] + dx * t),
    point[1] - (a[1] + dy * t),
    point[2] - (a[2] + dz * t),
  )
}

/** Ramer–Douglas–Peucker in x/y/pressure space. Pressure is treated as a
 * small visible dimension, so simplification preserves intentional weight
 * changes while removing polling-rate noise from straight segments. */
export function simplifySketchPoints(
  points: readonly SketchpadPoint[],
  width: number,
  height: number,
  tolerancePx = 0.8,
): readonly SketchpadPoint[] {
  if (points.length <= 2) return points
  const pressureScale = 7
  const coordinates = points.map((point) => [
    point.x * width,
    point.y * height,
    point.pressure * pressureScale,
  ] as const)
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const ranges: Array<readonly [number, number]> = [[0, points.length - 1]]
  while (ranges.length > 0) {
    const [start, end] = ranges.pop()!
    let furthest = -1
    let furthestDistance = tolerancePx
    for (let index = start + 1; index < end; index += 1) {
      const distance = pointToSegmentDistance3d(
        coordinates[index]!,
        coordinates[start]!,
        coordinates[end]!,
      )
      if (distance > furthestDistance) {
        furthest = index
        furthestDistance = distance
      }
    }
    if (furthest !== -1) {
      keep[furthest] = 1
      ranges.push([start, furthest], [furthest, end])
    }
  }
  return points.filter((_, index) => keep[index] === 1)
}

function distanceToSegment(
  pointX: number,
  pointY: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(pointX - ax, pointY - ay)
  const t = clamp(((pointX - ax) * dx + (pointY - ay) * dy) / (dx * dx + dy * dy), 0, 1)
  return Math.hypot(pointX - (ax + dx * t), pointY - (ay + dy * t))
}

function sketchStrokeHitsPoint(
  stroke: SketchpadStroke,
  point: SketchpadPoint,
  radiusPx: number,
  width: number,
  height: number,
): boolean {
  if (stroke.points.length === 0) return false
  const px = point.x * width
  const py = point.y * height
  if (stroke.points.length === 1) {
    const only = stroke.points[0]!
    return Math.hypot(px - only.x * width, py - only.y * height) <= radiusPx
  }
  return stroke.points.slice(1).some((current, index) => {
    const previous = stroke.points[index]!
    return distanceToSegment(
      px,
      py,
      previous.x * width,
      previous.y * height,
      current.x * width,
      current.y * height,
    ) <= radiusPx + stroke.size / 2
  })
}

export function eraseSketchStrokes(
  strokes: readonly SketchpadStroke[],
  point: SketchpadPoint,
  radiusPx: number,
  width: number,
  height: number,
): readonly SketchpadStroke[] {
  return strokes.filter((stroke) =>
    !sketchStrokeHitsPoint(stroke, point, radiusPx, width, height),
  )
}
