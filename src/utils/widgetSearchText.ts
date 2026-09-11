/**
 * Flatten the human-authored strings inside a widget's data into one
 * searchable line, so search can find what a card SAYS, not just what it is
 * called. Keys are never included — only values a user could have typed.
 * Machine blobs (data URIs, long unbroken tokens like base64 or hashes) are
 * skipped so they cannot soak up substring matches.
 */
const MAX_CONTENT_LENGTH = 4000
const MAX_TOKEN_LENGTH = 200

export function widgetContentText(data: unknown): string {
  const parts: string[] = []
  let budget = MAX_CONTENT_LENGTH
  const walk = (value: unknown) => {
    if (budget <= 0) return
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return
      if (trimmed.startsWith('data:')) return
      if (trimmed.length > MAX_TOKEN_LENGTH && !trimmed.includes(' ')) return
      parts.push(trimmed)
      budget -= trimmed.length + 1
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry)
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const entry of Object.values(value)) walk(entry)
    }
  }
  walk(data)
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, MAX_CONTENT_LENGTH)
}

/**
 * A short window of content around the first occurrence of `query`, for the
 * result row's subtitle — shows WHY a content match surfaced. Falls back to
 * the head of the content when the match was word-by-word rather than one
 * contiguous run.
 */
export function contentExcerpt(content: string, query: string, radius = 32): string {
  const needle = query.toLowerCase().trim()
  const index = needle ? content.toLowerCase().indexOf(needle) : -1
  const start = index >= 0 ? Math.max(0, index - radius) : 0
  const end = Math.min(content.length, (index >= 0 ? index + needle.length : 0) + radius)
  const slice = content.slice(start, Math.max(end, start + radius * 2)).trim()
  const prefix = start > 0 ? '…' : ''
  const suffix = start + slice.length < content.length ? '…' : ''
  return `${prefix}${slice}${suffix}`
}
