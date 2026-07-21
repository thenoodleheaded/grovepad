interface InteractiveResidencyInput {
  renderedIds: readonly string[]
  pinnedIds: ReadonlySet<string>
  selectedIds: ReadonlySet<string>
  circuitMode: boolean
  forceInteractive?: (widgetId: string) => boolean
}

/** Rich editors are a bounded interaction resource. A marquee selection is
 * represented by shared chrome and must not wake every selected widget. */
export function interactiveResidentWidgetIds({
  renderedIds,
  pinnedIds,
  selectedIds,
  circuitMode,
  forceInteractive,
}: InteractiveResidencyInput): Set<string> {
  if (circuitMode) return new Set(renderedIds)
  const ids = new Set(pinnedIds)
  if (selectedIds.size === 1) {
    const selectedId = selectedIds.values().next().value
    if (selectedId) ids.add(selectedId)
  }
  if (forceInteractive) {
    for (const id of renderedIds) {
      if (forceInteractive(id)) ids.add(id)
    }
  }
  return ids
}
