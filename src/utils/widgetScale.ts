import type { WidgetSizing } from '../widgets/contracts/registry'

export type WidgetScaleState = 'full' | 'pill' | 'icon'

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
  const minWidth = sizing?.minWidth ?? fallback.minWidth
  const minHeight = sizing?.minHeight ?? fallback.minHeight
  return {
    minWidth,
    minHeight,
    maxWidth: Math.max(minWidth, sizing?.maxWidth ?? fallback.maxWidth),
    maxHeight: Math.max(minHeight, sizing?.maxHeight ?? fallback.maxHeight),
  }
}

/** World pixels beyond both axes before one scale-state change commits.
 * High enough that overshooting the minimum while merely making a card small
 * never collapses it — a state change requires a deliberate, long pull. */
export const SNAP_OVERSHOOT_PX = 90

export function crossedBothScaleAxes(
  xDistance: number,
  yDistance: number,
  threshold = SNAP_OVERSHOOT_PX,
): boolean {
  return xDistance >= threshold && yDistance >= threshold
}

