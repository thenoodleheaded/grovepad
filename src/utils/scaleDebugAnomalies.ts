import { GRID_SIZE } from '../types/spatial'

export interface SizeLike {
  width: number
  height: number
}

export interface SizingBounds {
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

/**
 * Pure checks over one resize outcome. Each one names a way the scaling
 * system can misbehave; a clean resize returns an empty array. Kept
 * dependency-free (no store, no DOM) so every rule is unit-testable and the
 * hot resize path never risks a synchronous layout read.
 */
export function resizeAnomalies(
  after: SizeLike,
  bounds: SizingBounds,
  opts: { snapped: boolean; locked: boolean; changed: boolean } = { snapped: false, locked: false, changed: true },
): string[] {
  const flags: string[] = []
  const { width, height } = after

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    flags.push(Number.isNaN(width) || Number.isNaN(height) ? 'nan-size' : 'non-finite-size')
    return flags // a non-finite size makes every other check meaningless
  }
  if (width <= 0 || height <= 0) flags.push('non-positive-size')
  if (bounds.minWidth !== undefined && width < bounds.minWidth - 0.5) flags.push('below-min-width')
  if (bounds.minHeight !== undefined && height < bounds.minHeight - 0.5) flags.push('below-min-height')
  if (bounds.maxWidth !== undefined && width > bounds.maxWidth + 0.5) flags.push('above-max-width')
  if (bounds.maxHeight !== undefined && height > bounds.maxHeight + 0.5) flags.push('above-max-height')
  if (opts.snapped && (width % GRID_SIZE !== 0 || height % GRID_SIZE !== 0)) flags.push('not-grid-snapped')
  if (opts.locked && opts.changed) flags.push('locked-but-resized')

  return flags
}

/**
 * A card taller than its own content is the exact defect class the
 * load-time content-floor fit exists to reclaim (see naturalContentHeight).
 * Flags a void that a fit pass should have caught but did not — either the
 * pass has not run yet (transient) or a new content shape defeats it.
 */
export function contentFloorAnomalies(input: {
  cardHeight: number
  naturalHeight: number
  inset: number
  overflowY: number
  autoHeight: boolean
}): string[] {
  const flags: string[] = []
  const { cardHeight, naturalHeight, inset, overflowY, autoHeight } = input

  if (!autoHeight) {
    const voidPx = cardHeight - (naturalHeight + inset)
    if (voidPx > GRID_SIZE) flags.push('content-void')
  }
  if (overflowY > 4 && cardHeight <= naturalHeight + inset - 4) flags.push('overflow-not-grown')

  return flags
}

/** A run of alternating grow/shrink for the same widget within a short
 * window means the sizing system is fighting itself instead of converging —
 * the load-time fit and grow-only floor disagreeing is the classic cause. */
export function detectOscillation(
  recentHeights: readonly number[],
  withinMs: number,
  spanMs: number,
): boolean {
  if (recentHeights.length < 4 || withinMs > spanMs) return false
  let direction = 0
  let flips = 0
  for (let i = 1; i < recentHeights.length; i += 1) {
    const delta = recentHeights[i]! - recentHeights[i - 1]!
    if (delta === 0) continue
    const next = delta > 0 ? 1 : -1
    if (direction !== 0 && next !== direction) flips += 1
    direction = next
  }
  return flips >= 2
}

/** DOM px are screen space; store px are world space — compare after
 * removing zoom, or every zoomed-out board reports a false mismatch. */
export function domStoreMismatch(
  domSizePx: SizeLike,
  storeSize: SizeLike,
  zoom: number,
  toleranceWorldPx = 1.5,
): SizeLike | null {
  if (zoom <= 0) return null
  const domWorld = { width: domSizePx.width / zoom, height: domSizePx.height / zoom }
  const dw = domWorld.width - storeSize.width
  const dh = domWorld.height - storeSize.height
  if (Math.abs(dw) <= toleranceWorldPx && Math.abs(dh) <= toleranceWorldPx) return null
  return { width: dw, height: dh }
}
