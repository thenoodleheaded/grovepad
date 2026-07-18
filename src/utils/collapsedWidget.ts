import type { Size } from '../types/spatial'
import { COLLAPSED_SIZE, GRID_SIZE } from '../types/spatial'

const PILL_PADDING_X = 16
const PILL_ICON = 12
const PILL_GAP = 6
const PILL_FONT = '500 12px "Clash Display"'

let measureCtx: CanvasRenderingContext2D | null = null

function measureTitle(title: string): number {
  if (typeof document !== 'undefined') {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx) {
      measureCtx.font = PILL_FONT
      return measureCtx.measureText(title).width
    }
  }
  return title.length * 6.2
}

/** Keeps the interactive collapsed representation aligned when its title changes. */
export function pillSizeForTitle(title: string): Size {
  const text = measureTitle(title.trim() || 'Widget')
  const raw = PILL_PADDING_X * 2 + PILL_ICON + PILL_GAP + Math.ceil(text) + 2
  const width = Math.max(GRID_SIZE * 2, Math.ceil(raw / GRID_SIZE) * GRID_SIZE)
  return { width, height: COLLAPSED_SIZE.height }
}
