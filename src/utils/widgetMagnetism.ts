export interface MagneticRect {
  left: number
  top: number
  width: number
  height: number
}

export interface MagneticPoint {
  x: number
  y: number
}

const MAX_X = 3
const MAX_Y = 2
const RESTING_LIFT = 1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Converts the real pointer position into a deliberately restrained visual
 * offset. The widget remains anchored while leaning toward the pointer.
 */
export function magneticWidgetOffset(
  rect: MagneticRect,
  pointer: MagneticPoint,
): MagneticPoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: -RESTING_LIFT }
  const normalizedX = clamp((pointer.x - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1)
  const normalizedY = clamp((pointer.y - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1)
  return {
    x: normalizedX * MAX_X,
    y: normalizedY * MAX_Y - RESTING_LIFT,
  }
}
