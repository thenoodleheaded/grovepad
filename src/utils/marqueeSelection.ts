/**
 * How a finished marquee combines with what was already selected.
 *
 * A plain box replaces the selection, which is what every canvas tool does and
 * what makes an empty drag a deliberate "select nothing". Shift keeps the
 * additive behaviour — shift is also the gesture that STARTS a marquee in
 * navigate mode, so a shift-drag must never throw away the selection the user
 * is building. Alt removes the boxed widgets from the selection.
 */
export type MarqueeMode = 'replace' | 'add' | 'subtract'

export function marqueeModeFor(modifiers: { shift: boolean; alt: boolean }): MarqueeMode {
  if (modifiers.alt) return 'subtract'
  if (modifiers.shift) return 'add'
  return 'replace'
}

export function mergeMarqueeSelection(
  current: Iterable<string>,
  boxed: Iterable<string>,
  mode: MarqueeMode,
): string[] {
  const boxedSet = new Set(boxed)
  if (mode === 'replace') return [...boxedSet]
  const next = new Set(current)
  for (const id of boxedSet) {
    if (mode === 'subtract') next.delete(id)
    else next.add(id)
  }
  return [...next]
}
