import type { Vector2D, Widget, WidgetGroup } from '../types/spatial'
import type { WorldRect } from './canvasView'

/** World-space clearance between a member widget and the group band. */
export const GROUP_PAD = 38

/**
 * Single source of truth for a group's world-space bounding box. GroupLayer
 * (culling), RelationLines (edge routing), and WidgetCard (drop targeting)
 * all derive from this instead of re-summing member rects themselves.
 */
export function groupWorldBounds(
  group: WidgetGroup,
  widgets: Record<string, Widget>,
  pad: number = GROUP_PAD,
): WorldRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const widgetId of group.widgetIds) {
    const w = widgets[widgetId]
    if (!w) continue
    minX = Math.min(minX, w.position.x)
    minY = Math.min(minY, w.position.y)
    maxX = Math.max(maxX, w.position.x + w.size.width)
    maxY = Math.max(maxY, w.position.y + w.size.height)
  }
  if (!Number.isFinite(minX)) return null
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  }
}

/**
 * Finds the group directly beneath a drag cursor. Drop intent belongs to the
 * pointer, not the dragged card's center: a large widget should join exactly
 * when the user's cursor crosses the shared plate.
 */
export function groupAtWorldPoint(
  point: Vector2D,
  groups: Record<string, WidgetGroup>,
  widgets: Record<string, Widget>,
  options: { canvasId: string; excludeGroupId?: string },
): string | null {
  for (const [groupId, group] of Object.entries(groups)) {
    if (groupId === options.excludeGroupId) continue
    const anchor = group.widgetIds.map((widgetId) => widgets[widgetId]).find(Boolean)
    if (!anchor || anchor.canvasId !== options.canvasId) continue
    const bounds = groupWorldBounds(group, widgets)
    if (
      bounds &&
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return groupId
    }
  }
  return null
}
