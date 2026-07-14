/** Remove a stable entity without depending on its current array position. */
export function withoutPanelItem<T extends { id: string }>(
  items: readonly T[],
  id: string,
): T[] {
  return items.filter((item) => item.id !== id)
}
