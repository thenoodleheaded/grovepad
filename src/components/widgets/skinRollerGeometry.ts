/**
 * The physics and layout maths behind the widget skin roller, kept free of
 * React and the DOM so the drum's behavior can be tested directly.
 *
 * One number drives everything: `offset`, the distance the drum has been
 * rolled, in pixels. `offset / ROW_HEIGHT` is the (fractional) index sitting
 * in the selection lane, so offset 0 is the first skin and the drum always
 * settles on a whole multiple of ROW_HEIGHT.
 */

/** Height of one skin row, and therefore the travel between two detents. */
export const ROW_HEIGHT = 52

/** Degrees of barrel rotation between neighbouring rows. */
export const ANGLE_STEP = 20

/**
 * Barrel radius that makes ANGLE_STEP of rotation advance the surface by
 * exactly one row, so the curved drum and the flat fallback move in step.
 */
export const DRUM_RADIUS = ROW_HEIGHT / (2 * Math.tan((ANGLE_STEP * Math.PI) / 360))

/** Rows further than this from the lane have rotated past the horizon. */
const HORIZON = 90 / ANGLE_STEP

/** Resistance constant for the stretch past either end. Lower drags harder. */
const RUBBER = 0.55

/**
 * How far a drag past the end is actually allowed to move the drum: the pull
 * is fed through a curve that approaches `limit` but never reaches it, so the
 * end always feels like a wall with give rather than a wall.
 */
export function rubberBand(overshoot: number, limit = ROW_HEIGHT): number {
  if (overshoot <= 0) return 0
  return (1 - 1 / ((overshoot / limit) * RUBBER + 1)) * limit
}

/** Applies the end resistance to a raw dragged offset. */
export function resistOffset(rawOffset: number, count: number, rowHeight = ROW_HEIGHT): number {
  const max = Math.max(0, count - 1) * rowHeight
  if (rawOffset < 0) return -rubberBand(-rawOffset, rowHeight)
  if (rawOffset > max) return max + rubberBand(rawOffset - max, rowHeight)
  return rawOffset
}

/** True while the drum is stretched past either end. */
export function isPastEnd(offset: number, count: number, rowHeight = ROW_HEIGHT): boolean {
  return offset < 0 || offset > Math.max(0, count - 1) * rowHeight
}

/** Which row is in the lane right now — always a real, in-range index. */
export function indexForOffset(offset: number, count: number, rowHeight = ROW_HEIGHT): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.round(offset / rowHeight)))
}

/** Where the drum comes to rest from here: the nearest whole row. */
export function settledOffset(offset: number, count: number, rowHeight = ROW_HEIGHT): number {
  return indexForOffset(offset, count, rowHeight) * rowHeight
}

/** Rows this far from the lane or nearer stay perfectly sharp. */
const SHARP_ROWS = 3

/** The full out-of-focus blur, in pixels, worn by every row past the ramp. */
const EDGE_BLUR = 6

/** How many rows past the sharp zone it takes to reach the full blur. */
const BLUR_RAMP_ROWS = 1

export interface RowPlacement {
  /** Barrel rotation for this row, in degrees. 0 means it is in the lane. */
  rotateX: number
  /** Flat-list fallback travel, in pixels, used when motion is reduced. */
  translateY: number
  opacity: number
  /** Softening at the drum's far edges, so it dissolves instead of ending. */
  blur: number
  /** Rows nearer the lane paint over rows behind them. */
  zIndex: number
  /** Rotated past the horizon — skip it entirely rather than paint a sliver. */
  hidden: boolean
}

/** Places one row relative to the current offset. */
export function placeRow(index: number, offset: number, rowHeight = ROW_HEIGHT): RowPlacement {
  const distance = index - offset / rowHeight
  const away = Math.abs(distance)
  return {
    // `|| 0` only normalises the -0 the lane row would otherwise produce.
    rotateX: -distance * ANGLE_STEP || 0,
    translateY: distance * rowHeight,
    // Fades to nothing by the time a row reaches the horizon, so rows leave
    // the drum rather than blinking out.
    opacity: away >= HORIZON ? 0 : Math.max(0, 1 - (away / HORIZON) ** 1.4),
    // The lane and three choices each way are sharp; just past the third the
    // blur ramps up over one row and then holds flat, so everything further
    // out is plainly out of focus rather than merely hinted at.
    blur: Math.min(EDGE_BLUR, Math.max(0, (away - SHARP_ROWS) / BLUR_RAMP_ROWS) * EDGE_BLUR),
    zIndex: Math.max(0, 100 - Math.round(away * 10)),
    hidden: away >= HORIZON,
  }
}

/** Wheel travel that counts as one deliberate notch of scrolling. */
export const WHEEL_NOTCH = 40

/**
 * Wheel scrolling moves the drum one whole row at a time rather than dragging
 * it continuously: accumulated wheel travel is converted into whole steps, and
 * whatever is left over stays banked for the next event. A trackpad flick and
 * a mouse notch therefore both advance in clean, animated single rows.
 */
export function wheelSteps(accumulated: number, notch = WHEEL_NOTCH): { steps: number; remainder: number } {
  const steps = Math.trunc(accumulated / notch)
  return { steps, remainder: accumulated - steps * notch }
}

/**
 * One frame of the settle spring: a critically damped pull toward `target`
 * that never overshoots enough to cross a detent it did not earn.
 */
export function stepSettle(offset: number, target: number, elapsedMs: number): number {
  const remaining = target - offset
  if (Math.abs(remaining) < 0.5) return target
  // Frame-rate independent exponential approach (~150 ms to arrive).
  const t = 1 - Math.exp(-elapsedMs / 55)
  return offset + remaining * t
}
