import type { Size } from '../types/spatial'
import { COLLAPSED_SIZE, GRID_SIZE } from '../types/spatial'

// ---------------------------------------------------------------------------
// Widget scale states — full → pill → icon.
//
// A pill is exactly one grid cell tall and exactly as wide as its icon + name
// need (rounded UP to a whole cell). An icon tile is a compact 2×2-cell tile.
// Between states there are no intermediate layouts: the resize gesture shows
// an elastic "strain" (Apple rubber-band) at a state's size floor, and past
// SNAP_OVERSHOOT_PX it commits the next state in one springy jump.
// ---------------------------------------------------------------------------

export type WidgetScaleState = 'full' | 'pill' | 'icon'

/** Pointer overshoot (world px) past a size floor that commits a state snap. */
export const SNAP_OVERSHOOT_PX = 36

/** Pill layout constants — keep in sync with the pill row in WidgetCard. */
const PILL_PADDING_X = 16 // px-4 on each side
const PILL_ICON = 12
const PILL_GAP = 6
const PILL_FONT = '500 12px ui-sans-serif, system-ui, sans-serif'

let measureCtx: CanvasRenderingContext2D | null = null

function measureTitle(title: string): number {
  if (typeof document !== 'undefined') {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx) {
      measureCtx.font = PILL_FONT
      return measureCtx.measureText(title).width
    }
  }
  // Headless (tests): approximate at ~6.2px per character.
  return title.length * 6.2
}

/** One cell tall; wide enough for icon + name, rounded up to whole cells. */
export function pillSizeForTitle(title: string): Size {
  const text = measureTitle(title.trim() || 'Widget')
  const raw = PILL_PADDING_X * 2 + PILL_ICON + PILL_GAP + Math.ceil(text) + 2
  const width = Math.max(GRID_SIZE * 2, Math.ceil(raw / GRID_SIZE) * GRID_SIZE)
  return { width, height: COLLAPSED_SIZE.height }
}

/**
 * Rubber-band compression for a pointer overshoot past a hard size floor —
 * diminishing returns, capped, so the card visibly "tries" to shrink without
 * ever entering an in-between layout.
 */
export function rubberStrainPx(overshootPx: number, maxPx = 14): number {
  if (overshootPx <= 0) return 0
  return maxPx * (1 - 1 / (overshootPx / 110 + 1))
}
