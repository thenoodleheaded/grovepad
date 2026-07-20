import { GRID_SIZE, type Vector2D, type Widget, type WidgetGroup } from '../types/spatial'
import type { WorldRect } from './canvasView'
import { widgetHasButtonOverflow } from './widgetButtonLayout'

/** World-space clearance between a member widget and the group band. */
export const GROUP_PAD = 38

// A card's interactive footprint is taller than its glass: the floating
// title row lives half a cell above. It's also wider than its glass exactly
// when the button cluster doesn't fit the title row and spills into the
// vertical column past the right edge — WidgetCard's own hover catch-all
// uses these same two constants and the same overflow test, so group
// geometry never disagrees with what a lone card considers hoverable.
export const WIDGET_HOVER_TOP = GRID_SIZE / 2
export const WIDGET_HOVER_RIGHT = GRID_SIZE / 2

/**
 * A widget's rect expanded by its hover chrome: always half a cell above for
 * the title row, and half a cell to the right only when its button cluster
 * actually overflows there. `grouped` must reflect whether the widget shows
 * a group's detach button in its own title row — it changes the overflow
 * math by one button slot.
 */
export function widgetHoverRect(
  widget: Pick<Widget, 'position' | 'size' | 'type' | 'metadata' | 'title'>,
  grouped: boolean,
): WorldRect {
  const extraRight = widgetHasButtonOverflow(widget, grouped) ? WIDGET_HOVER_RIGHT : 0
  return {
    x: widget.position.x,
    y: widget.position.y - WIDGET_HOVER_TOP,
    width: widget.size.width + extraRight,
    height: widget.size.height + WIDGET_HOVER_TOP,
  }
}

/**
 * Single source of truth for a group's world-space bounding box. GroupLayer
 * (culling), RelationLines (edge routing), and WidgetCard (drop targeting)
 * all derive from this instead of re-summing member rects themselves.
 * Members contribute their hover footprint, not just their glass rect.
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
    const r = widgetHoverRect(w, true)
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  if (!Number.isFinite(minX)) return null
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  }
}

export function groupWorldBoundsExcluding(
  group: WidgetGroup,
  widgets: Record<string, Widget>,
  excludedWidgetId: string,
  pad: number = GROUP_PAD,
): WorldRect | null {
  return groupWorldBounds(
    { ...group, widgetIds: group.widgetIds.filter((id) => id !== excludedWidgetId) },
    widgets,
    pad,
  )
}

export function worldRectContainsPoint(rect: WorldRect | null, point: Vector2D): boolean {
  return Boolean(
    rect &&
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height,
  )
}

/**
 * Finds the group directly beneath a drag cursor. Drop intent belongs to the
 * pointer, not the dragged card's center: a large widget should join exactly
 * when the user's cursor crosses the shared plate. Since the plate is the
 * union silhouette of padded member footprints (not their bounding box), the
 * hit test walks members — a point in a concave notch hits nothing, matching
 * the visible glass.
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
    for (const widgetId of group.widgetIds) {
      const w = widgets[widgetId]
      if (!w) continue
      const r = widgetHoverRect(w, true)
      if (
        point.x >= r.x - GROUP_PAD &&
        point.x <= r.x + r.width + GROUP_PAD &&
        point.y >= r.y - GROUP_PAD &&
        point.y <= r.y + r.height + GROUP_PAD
      ) {
        return groupId
      }
    }
  }
  return null
}
