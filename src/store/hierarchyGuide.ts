import type { Relation, Widget } from '../types/spatial'
import { GRID_SIZE } from '../types/spatial'
import {
  hierarchyChildrenGuardedBy,
  hierarchyGuardiansForChild,
} from './widgetCollection'

export interface HierarchyBoundaryGuide {
  childId: string
  guardianId: string
  x1: number
  x2: number
  y: number
}
/**
 * The closest strict hierarchy boundary touched by this drag. It appears once
 * the child is within one direct grid cell of the parent-row boundary.
 */
export function hierarchyBoundaryGuide(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  movingIds: string[],
): HierarchyBoundaryGuide | null {
  const pairs = new Map<string, { childId: string; guardianId: string }>()
  for (const movingId of movingIds) {
    for (const guardianId of hierarchyGuardiansForChild(movingId, relations)) {
      pairs.set(`${movingId}\u0000${guardianId}`, { childId: movingId, guardianId })
    }
    for (const childId of hierarchyChildrenGuardedBy(movingId, relations)) {
      pairs.set(`${childId}\u0000${movingId}`, { childId, guardianId: movingId })
    }
  }

  let closest: (HierarchyBoundaryGuide & { gap: number }) | null = null
  for (const { childId, guardianId } of pairs.values()) {
    const child = widgets[childId]
    const guardian = widgets[guardianId]
    if (!child || !guardian || child.canvasId !== guardian.canvasId) continue
    const guardianBottom = guardian.position.y + guardian.size.height
    const gap = child.position.y - guardianBottom
    if (gap < 0 || gap > GRID_SIZE) continue
    const guide = {
      childId,
      guardianId,
      x1: Math.min(child.position.x, guardian.position.x),
      x2: Math.max(
        child.position.x + child.size.width,
        guardian.position.x + guardian.size.width,
      ),
      y: guardianBottom + gap / 2,
      gap,
    }
    if (!closest || guide.gap < closest.gap) closest = guide
  }

  if (!closest) return null
  const { gap: _gap, ...guide } = closest
  return guide
}
