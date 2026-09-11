const RECENTS_KEY = 'gp-recent-quick-add'

/** The context strip is one short row, so recents share it with the examples. */
export const QUICK_ADD_RECENT_LIMIT = 4

/** Longest entry worth keeping as a chip; anything longer is a paragraph, not a prompt. */
const MAX_ENTRY_LENGTH = 80

/** Trimmed, whitespace-collapsed, length-capped. Returns '' for nothing usable. */
export function normalizeQuickAddEntry(entry: string): string {
  return entry.replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_LENGTH)
}

/**
 * Most-recent-first, capped, de-duplicated case-insensitively so retyping the
 * same thought with different capitalisation does not fill the row with twins.
 */
export function promoteQuickAddRecent(
  list: readonly string[],
  entry: string,
  limit = QUICK_ADD_RECENT_LIMIT,
): string[] {
  const normalized = normalizeQuickAddEntry(entry)
  if (!normalized) return [...list]
  const folded = normalized.toLowerCase()
  return [normalized, ...list.filter((item) => item.toLowerCase() !== folded)].slice(0, limit)
}

export function readQuickAddRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map(normalizeQuickAddEntry)
      .filter(Boolean)
      .slice(0, QUICK_ADD_RECENT_LIMIT)
  } catch {
    return []
  }
}

/** Records an entry and returns the new list. Storage failure is never fatal. */
export function recordQuickAddRecent(entry: string): string[] {
  const next = promoteQuickAddRecent(readQuickAddRecents(), entry)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    // A full or blocked store must not cost the user their widgets.
  }
  return next
}
