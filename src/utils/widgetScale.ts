import { ICON_MAX_EDGE, ICON_MIN_EDGE, WIDGET_MAX_EDGE, snapToGrid } from '../types/spatial'
import type { WidgetSizing } from '../widgets/contracts/registry'

export type WidgetScaleState = 'full' | 'icon'

export interface FullWidgetResizeBounds {
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

export function fullWidgetResizeBounds(
  sizing: WidgetSizing | undefined,
  fallback: FullWidgetResizeBounds,
): FullWidgetResizeBounds {
  // The absolute ceiling outranks every per-type rule, so a drag meets the
  // same wall the store would clamp it to — and the rubber band stretches
  // there instead of the gesture going quietly dead.
  const minWidth = Math.min(WIDGET_MAX_EDGE, sizing?.minWidth ?? fallback.minWidth)
  const minHeight = Math.min(WIDGET_MAX_EDGE, sizing?.minHeight ?? fallback.minHeight)
  return {
    minWidth,
    minHeight,
    maxWidth: Math.min(WIDGET_MAX_EDGE, Math.max(minWidth, sizing?.maxWidth ?? fallback.maxWidth)),
    maxHeight: Math.min(WIDGET_MAX_EDGE, Math.max(minHeight, sizing?.maxHeight ?? fallback.maxHeight)),
  }
}

// ---------------------------------------------------------------------------
// Icon charter: one square, scaled continuously across a single cell while
// held, then settled onto the nearest whole-cell square on release.
//
// An icon is not a separate size machine — no skew rule, no rubber-band.
// It is just a square whose edge follows the corner drag freely between 2×2
// and 3×3. Two plain thresholds bound the state itself:
// crush a resting tile inward far enough on both axes and it becomes an
// icon; grow an icon past 3×3 and it restores the full card.
// ---------------------------------------------------------------------------

/** World pixels of inward travel on both axes before a resting tile crushes
 * into an icon. A deliberate corner crush, not a graze — roughly one cell. */
export const ICON_CRUSH_PX = 48

/** True when a corner drag has pulled a resting tile inward far enough on
 * both axes to become an icon. */
export function crushesToIcon(xShrink: number, yShrink: number): boolean {
  return xShrink >= ICON_CRUSH_PX && yShrink >= ICON_CRUSH_PX
}

/** World pixels of growth past 3×3 before an icon lets go and restores the
 * full card. A little slack past the ceiling so 3×3 itself sits stable. */
export const ICON_ESCAPE_PX = 40

/** Whether an icon drag has grown past the ceiling and should restore the
 * full card. Escape is only ever growth — shrinking clamps at 2×2 and stays
 * an icon. */
export function iconEscapesToFull(intentEdge: number): boolean {
  return intentEdge >= ICON_MAX_EDGE + ICON_ESCAPE_PX
}

/** The live square under the pointer: exact intended edge, clamped only to the
 * continuous 2×2–3×3 range. */
export function clampIconEdge(edge: number): number {
  return Math.min(ICON_MAX_EDGE, Math.max(ICON_MIN_EDGE, edge))
}

/** The committed square after release. Because the legal range spans exactly
 * one cell, grid snapping resolves naturally to either 2×2 or 3×3. This is
 * geometry only—not a second icon state or a size-mode switch. */
export function snapIconEdgeToGrid(edge: number): number {
  return clampIconEdge(snapToGrid(edge))
}

/** Damped travel past a boundary — the rubber band the full/rest resize paints
 * when a pull runs past a hard bound. Never reaches `limit`, so it always
 * reads as resistance rather than a second, softer range. */
export function elasticOvershoot(distance: number, limit = 36): number {
  if (distance <= 0) return 0
  return limit * (1 - Math.exp(-distance / limit))
}
