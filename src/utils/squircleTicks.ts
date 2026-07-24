// ---------------------------------------------------------------------------
// Clock-dial marks around a squircle, built the way a watch bezel is built.
//
// The governing idea, taken from a real rectangular watch face: **every mark
// is a ray from the centre**. A minute is 6° of rotation no matter what shape
// the screen is, so marks sit at equal ANGLES and each one points at the hub —
// the same direction the hands sweep. Where that ray meets the outline is
// simply where the mark is drawn.
//
// The earlier construction here walked the perimeter at equal arc-length and
// pushed each mark along the local edge normal. That looks fine on the straight
// runs and wrong at the corners: normals fan toward the corner's centre, so the
// inner ends bunch to roughly a third of their outer spacing and the corners
// read as pinched and hairy. Rays from the face centre have no such artefact —
// the fan is the clock's own geometry, not a side effect of the outline.
//
// Pure, allocation-light, no DOM.
// ---------------------------------------------------------------------------

export interface DialTick {
  x1: number
  y1: number
  x2: number
  y2: number
  /** 0 at twelve o'clock, increasing clockwise. */
  index: number
  /** Every `hourEvery`-th mark: longer and heavier, like a bezel's numerals. */
  hour: boolean
}

/** Twelve o'clock in screen coordinates, where +y points down. */
const TWELVE = -Math.PI / 2

function clampRadius(width: number, height: number, radius: number): number {
  return Math.max(0, Math.min(radius, Math.min(width, height) / 2))
}

/**
 * Where a ray leaving the centre of a rounded rectangle crosses its outline.
 *
 * Exact rather than sampled: the outline is four straight runs plus four
 * corner arcs, so the ray is tested against each straight run first (cheap),
 * and falls through to the one corner circle it can possibly meet.
 */
export function squircleRayHit(
  width: number,
  height: number,
  radius: number,
  angle: number,
): { x: number; y: number } {
  const halfW = width / 2
  const halfH = height / 2
  const r = clampRadius(width, height, radius)
  // Half-extents of the core rectangle the corner circles roll around.
  const a = halfW - r
  const b = halfH - r
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)

  let t = Infinity
  if (dy < 0) {
    const hit = -(b + r) / dy
    if (Math.abs(hit * dx) <= a) t = Math.min(t, hit)
  }
  if (dy > 0) {
    const hit = (b + r) / dy
    if (Math.abs(hit * dx) <= a) t = Math.min(t, hit)
  }
  if (dx < 0) {
    const hit = -(a + r) / dx
    if (Math.abs(hit * dy) <= b) t = Math.min(t, hit)
  }
  if (dx > 0) {
    const hit = (a + r) / dx
    if (Math.abs(hit * dy) <= b) t = Math.min(t, hit)
  }

  if (!Number.isFinite(t)) {
    // The ray leaves through a corner: solve |t·d − c| = r for the corner
    // circle in the ray's own quadrant.
    const cx = Math.sign(dx) * a
    const cy = Math.sign(dy) * b
    const dot = dx * cx + dy * cy
    const discriminant = dot * dot - (cx * cx + cy * cy) + r * r
    t = dot + Math.sqrt(Math.max(0, discriminant))
  }

  return { x: halfW + dx * t, y: halfH + dy * t }
}

/**
 * A full ring of dial marks.
 *
 * @param count       marks in the ring; `hourEvery`-th ones are hour marks
 * @param inset       gap between the outline and a mark's outer end
 * @param hourLength  length of an hour mark, drawn inwards along its ray
 * @param minuteLength length of the marks between them
 */
export function dialTicks(
  width: number,
  height: number,
  radius: number,
  count: number,
  inset: number,
  hourLength: number,
  minuteLength: number,
  hourEvery = 5,
): DialTick[] {
  if (count <= 0 || width <= 0 || height <= 0) return []

  const ticks: DialTick[] = []
  for (let index = 0; index < count; index++) {
    const angle = TWELVE + (index / count) * Math.PI * 2
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const hit = squircleRayHit(width, height, radius, angle)
    const hour = index % hourEvery === 0
    const length = hour ? hourLength : minuteLength
    const x1 = hit.x - dx * inset
    const y1 = hit.y - dy * inset
    ticks.push({
      x1,
      y1,
      x2: x1 - dx * length,
      y2: y1 - dy * length,
      index,
      hour,
    })
  }
  return ticks
}
