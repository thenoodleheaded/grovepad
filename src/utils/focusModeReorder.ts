export interface ReorderSlot {
  id: string
  top: number
  height: number
}

/**
 * Insert the dragged island at the slot indicated by the pointer's vertical
 * position. The input contains only the other islands in the same flow
 * domain; DOM measurement and animation stay in FocusModeLayer.
 */
export function insertDraggedAtPointer(
  draggedId: string,
  otherSlots: readonly ReorderSlot[],
  pointerY: number,
): string[] {
  const ordered = [...otherSlots].sort((a, b) => a.top - b.top)
  let target = ordered.length
  for (let index = 0; index < ordered.length; index += 1) {
    const slot = ordered[index]!
    if (pointerY < slot.top + slot.height / 2) {
      target = index
      break
    }
  }
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
