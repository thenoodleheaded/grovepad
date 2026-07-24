import { GRID_SIZE } from '../types/spatial'

const CAPSULE_PADDING_X = 16
const CAPSULE_ICON = 12
const CAPSULE_GAP = 6
const CAPSULE_FONT = '500 12px "Clash Display"'

let measureCtx: CanvasRenderingContext2D | null = null

function measureTitle(title: string): number {
  if (typeof document !== 'undefined') {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx) {
      measureCtx.font = CAPSULE_FONT
      return measureCtx.measureText(title).width
    }
  }
  return title.length * 6.2
}

/** Grid-aligned width the floating title capsule needs for a given title, so a
 * resting tile never renders narrower than its own identity. */
export function titleCapsuleWidth(title: string): number {
  const text = measureTitle(title.trim() || 'Widget')
  const raw = CAPSULE_PADDING_X * 2 + CAPSULE_ICON + CAPSULE_GAP + Math.ceil(text) + 2
  return Math.max(GRID_SIZE * 2, Math.ceil(raw / GRID_SIZE) * GRID_SIZE)
}
