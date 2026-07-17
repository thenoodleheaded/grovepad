import type { Size, Vector2D } from '../types/spatial'
import type { WorldRect } from './canvasView'

export interface AmbientColorSource {
  position: Vector2D
  size: Size
  accent: string
}

/** Five blooms are enough to read as a rich palette without turning a dense
 * board into a moving rainbow or adding expensive paint layers. */
export const CANVAS_AMBIENT_COLOR_LIMIT = 5

function intersectsViewport(widget: AmbientColorSource, rect: WorldRect): boolean {
  return (
    widget.position.x < rect.x + rect.width &&
    widget.position.x + widget.size.width > rect.x &&
    widget.position.y < rect.y + rect.height &&
    widget.position.y + widget.size.height > rect.y
  )
}

/**
 * Produces a stable, frequency-weighted palette from widgets actually visible
 * in the camera. Repeated accents strengthen one bloom; distinct accents earn
 * their own bloom in first-seen order, up to the visual safety limit.
 */
export function canvasAmbientPalette(
  widgets: readonly AmbientColorSource[],
  visibleRect: WorldRect,
  fallbackAccent: string,
): readonly string[] {
  const colors = new Map<string, { accent: string; count: number; order: number }>()

  for (const widget of widgets) {
    if (!intersectsViewport(widget, visibleRect)) continue
    const accent = widget.accent.trim()
    if (!accent) continue
    const key = accent.toLowerCase()
    const existing = colors.get(key)
    if (existing) existing.count += 1
    else colors.set(key, { accent, count: 1, order: colors.size })
  }

  if (colors.size === 0) return [fallbackAccent]

  return [...colors.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, CANVAS_AMBIENT_COLOR_LIMIT)
    .map(({ accent }) => accent)
}
