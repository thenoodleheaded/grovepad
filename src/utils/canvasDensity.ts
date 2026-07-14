export type WidgetRenderMode = 'detail' | 'map'

/**
 * Full widget bodies are intentionally scarce: their inputs, observers, timers,
 * gradients, and nested controls are the expensive part of a dense board.
 * Below the map threshold, every widget collapses to a single cheap painted
 * proxy (icon + name) that preserves the board's spatial shape.
 */
const MAP_MODE_ZOOM = 0.25

export function widgetRenderMode(zoom: number): WidgetRenderMode {
  return zoom < MAP_MODE_ZOOM ? 'map' : 'detail'
}

/** Hard DOM budgets for non-pinned widgets near the viewport. */
export function widgetRenderBudget(mode: WidgetRenderMode): number {
  switch (mode) {
    case 'detail':
      return 96
    case 'map':
      return 1_600
  }
}

export interface WidgetDensitySnapshot {
  mode: WidgetRenderMode
  visibleCount: number
  renderedCount: number
  detailCount: number
}

const INITIAL_SNAPSHOT: WidgetDensitySnapshot = {
  mode: 'detail',
  visibleCount: 0,
  renderedCount: 0,
  detailCount: 0,
}

let densitySnapshot = INITIAL_SNAPSHOT
const listeners = new Set<() => void>()

export function getWidgetDensitySnapshot(): WidgetDensitySnapshot {
  return densitySnapshot
}

export function subscribeWidgetDensity(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Publish only meaningful changes so the small canvas HUD stays idle. */
export function publishWidgetDensity(next: WidgetDensitySnapshot): void {
  if (
    densitySnapshot.mode === next.mode &&
    densitySnapshot.visibleCount === next.visibleCount &&
    densitySnapshot.renderedCount === next.renderedCount &&
    densitySnapshot.detailCount === next.detailCount
  ) {
    return
  }
  densitySnapshot = next
  for (const listener of listeners) listener()
}
