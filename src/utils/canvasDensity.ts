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

