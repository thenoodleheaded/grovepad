import type { Vector2D } from '../../types/spatial'
import type { WorldRect } from '../../utils/canvasView'

export type EdgeDetail = 'rich' | 'standard' | 'minimal'

/** Edge density is stable during camera motion; only board complexity changes it. */
export function edgeDetailFor(edgeCount: number): EdgeDetail {
  if (edgeCount > 700) return 'minimal'
  if (edgeCount > 320) return 'standard'
  return 'rich'
}

export function edgeCorridorIntersectsRect(
  start: Vector2D,
  end: Vector2D,
  rect: WorldRect,
  margin: number,
): boolean {
  const left = Math.min(start.x, end.x) - margin
  const top = Math.min(start.y, end.y) - margin
  const right = Math.max(start.x, end.x) + margin
  const bottom = Math.max(start.y, end.y) + margin
  return (
    left < rect.x + rect.width &&
    right > rect.x &&
    top < rect.y + rect.height &&
    bottom > rect.y
  )
}
