import type { Vector2D, Widget } from '../types/spatial'
import { LAYOUT_GAP } from './widgetLayoutConstants'

export interface LayoutRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export function withWidget(
  widgets: Record<string, Widget>,
  id: string,
  patch: (w: Widget) => Widget,
): Record<string, Widget> {
  const w = widgets[id]
  if (!w) return widgets
  return { ...widgets, [id]: patch(w) }
}

export function uniqueExistingIds(ids: Iterable<string>, widgets: Record<string, Widget>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (seen.has(id) || !widgets[id]) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export function rectsOverlap(a: LayoutRect, b: LayoutRect, gap = LAYOUT_GAP): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  )
}

export function rectCenter(rect: LayoutRect): Vector2D {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function movedIdsForWidget(
  id: string,
  selectedIds: ReadonlySet<string>,
  widgets: Record<string, Widget>,
): string[] {
  if (selectedIds.has(id) && selectedIds.size > 1) {
    return uniqueExistingIds(selectedIds, widgets)
  }
  return widgets[id] ? [id] : []
}

export function applyWidgetDelta(
  widgets: Record<string, Widget>,
  ids: string[],
  delta: Vector2D,
): Record<string, Widget> {
  if (delta.x === 0 && delta.y === 0) return widgets
  const movingIds = uniqueExistingIds(ids, widgets)
  if (movingIds.length === 0) return widgets

  const positions: Record<string, Vector2D> = {}
  for (const id of movingIds) {
    const widget = widgets[id]!
    positions[id] = {
      x: widget.position.x + delta.x,
      y: widget.position.y + delta.y,
    }
  }

  const next = { ...widgets }
  for (const id of movingIds) {
    next[id] = { ...widgets[id]!, position: positions[id]! }
  }
  return next
}

export function applyWidgetPositions(
  widgets: Record<string, Widget>,
  positions: Record<string, Vector2D>,
): Record<string, Widget> {
  const ids = uniqueExistingIds(Object.keys(positions), widgets)
  if (ids.length === 0) return widgets
  let next: Record<string, Widget> | null = null
  for (const id of ids) {
    const widget = widgets[id]!
    const position = positions[id]!
    if (widget.position.x === position.x && widget.position.y === position.y) continue
    next ??= { ...widgets }
    next[id] = { ...widget, position }
  }
  return next ?? widgets
}
