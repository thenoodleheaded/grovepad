export interface ReorderSlot {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export interface Point2D {
  x: number
  y: number
}

interface ReorderRow {
  top: number
  bottom: number
  slots: ReorderSlot[]
}

/** Convert a viewport-space vector to the widget's local CSS-pixel space. */
export function screenVectorToLocal(vector: Point2D, scaleX: number, scaleY: number): Point2D {
  const safeScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1
  const safeScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1
  return { x: vector.x / safeScaleX, y: vector.y / safeScaleY }
}

/**
 * Group measured flex/grid items into visual rows. Vertical overlap, rather
 * than identical `top` values, is the row signal: content alignment can make
 * two panels in the same row differ by a few viewport pixels.
 */
function visualRows(slots: readonly ReorderSlot[]): ReorderRow[] {
  const rows: ReorderRow[] = []
  const byTop = [...slots].sort((a, b) => a.top - b.top || a.left - b.left)
  byTop.forEach((slot) => {
    const bottom = slot.top + slot.height
    const row = rows.find((candidate) => slot.top < candidate.bottom && bottom > candidate.top)
    if (row) {
      row.top = Math.min(row.top, slot.top)
      row.bottom = Math.max(row.bottom, bottom)
      row.slots.push(slot)
      row.slots.sort((a, b) => a.left - b.left)
      return
    }
    rows.push({ top: slot.top, bottom, slots: [slot] })
  })
  return rows.sort((a, b) => a.top - b.top)
}

/** Current row-major visual order for a flex, grid, or single-column flow. */
export function visualFlowOrder(slots: readonly ReorderSlot[]): string[] {
  return visualRows(slots).flatMap((row) => row.slots.map((slot) => slot.id))
}

/**
 * Insert the dragged island at the two-dimensional visual slot under the
 * pointer. The input contains only the other islands in the same flow domain;
 * DOM measurement and animation stay in FocusModeLayer.
 */
export function insertDraggedAtPointer(
  draggedId: string,
  otherSlots: readonly ReorderSlot[],
  pointer: Point2D,
): string[] {
  const rows = visualRows(otherSlots)
  if (rows.length === 0) return [draggedId]
  const ordered = rows.flatMap((row) => row.slots)
  if (pointer.y < rows[0]!.top) return [draggedId, ...ordered.map((slot) => slot.id)]
  if (pointer.y >= rows.at(-1)!.bottom) return [...ordered.map((slot) => slot.id), draggedId]

  let rowIndex = rows.length - 1
  for (let index = 0; index < rows.length - 1; index += 1) {
    const row = rows[index]!
    const next = rows[index + 1]!
    if (pointer.y < (row.bottom + next.top) / 2) {
      rowIndex = index
      break
    }
  }

  const targetRow = rows[rowIndex]!
  let columnIndex = targetRow.slots.length
  for (let index = 0; index < targetRow.slots.length; index += 1) {
    const slot = targetRow.slots[index]!
    if (pointer.x < slot.left + slot.width / 2) {
      columnIndex = index
      break
    }
  }

  const target = rows.slice(0, rowIndex).reduce((count, row) => count + row.slots.length, 0) + columnIndex
  const result = ordered.map((slot) => slot.id)
  result.splice(target, 0, draggedId)
  return result
}

/**
 * Replace only one sibling flow domain inside the card-wide saved order.
 * Islands in other wrappers retain their relative positions, and newly
 * mounted islands are appended deterministically.
 */
export function mergeReorderDomain(
  savedOrder: readonly string[],
  allIds: readonly string[],
  siblingOrder: readonly string[],
): string[] {
  const knownIds = new Set(allIds)
  const baseOrder = [
    ...savedOrder.filter((id) => knownIds.has(id)),
    ...allIds.filter((id) => !savedOrder.includes(id)),
  ]
  const siblingIds = new Set(siblingOrder)
  const queue = [...siblingOrder]
  return baseOrder.map((id) => (siblingIds.has(id) ? (queue.shift() ?? id) : id))
}
