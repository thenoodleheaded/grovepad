export type NoteSkinMode =
  | 'plain'
  | 'sticky'
  | 'quote'
  | 'daily_log'
  | 'markdown_page'
  | 'typewriter'
  | 'callout'
  | 'versioned_note'

export type NoteCalloutTone = 'info' | 'tip' | 'warning' | 'decision' | 'important'

export interface NoteVersionSnapshot {
  id: string
  label: string
  text: string
  createdAt: string
}

export type NoteMarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[] }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'rule' }

const CALLOUT_TONES = new Set<NoteCalloutTone>([
  'info',
  'tip',
  'warning',
  'decision',
  'important',
])

export function noteCalloutTone(raw: unknown): NoteCalloutTone {
  return typeof raw === 'string' && CALLOUT_TONES.has(raw as NoteCalloutTone)
    ? raw as NoteCalloutTone
    : 'info'
}

export function noteVersionSnapshots(raw: unknown): NoteVersionSnapshot[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const snapshot = item as Partial<NoteVersionSnapshot>
    if (
      typeof snapshot.id !== 'string' ||
      typeof snapshot.label !== 'string' ||
      typeof snapshot.text !== 'string' ||
      typeof snapshot.createdAt !== 'string'
    ) return []
    return [{
      id: snapshot.id,
      label: snapshot.label.slice(0, 80),
      text: snapshot.text,
      createdAt: snapshot.createdAt,
    }]
  })
}

export function noteWordDiff(
  current: string,
  previous: string,
): { added: number; removed: number; unchanged: number } {
  const frequencies = (value: string) => {
    const counts = new Map<string, number>()
    for (const word of value.toLocaleLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []) {
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
    return counts
  }
  const currentWords = frequencies(current)
  const previousWords = frequencies(previous)
  const words = new Set([...currentWords.keys(), ...previousWords.keys()])
  let added = 0
  let removed = 0
  let unchanged = 0
  for (const word of words) {
    const nextCount = currentWords.get(word) ?? 0
    const previousCount = previousWords.get(word) ?? 0
    unchanged += Math.min(nextCount, previousCount)
    added += Math.max(0, nextCount - previousCount)
    removed += Math.max(0, previousCount - nextCount)
  }
  return { added, removed, unchanged }
}

export function parseNoteMarkdown(markdown: string): NoteMarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: NoteMarkdownBlock[] = []
  let index = 0

  const isSpecial = (line: string) =>
    /^(```|#{1,3}\s+|>\s?|[-*+]\s+|\d+[.)]\s+|(?:---+|___+|\*\*\*+)\s*$)/.test(line)

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = line.match(/^```([\w-]*)\s*$/)
    if (fence) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ kind: 'code', language: fence[1] ?? '', code: code.join('\n') })
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      })
      index += 1
      continue
    }

    if (/^(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push({ kind: 'rule' })
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ kind: 'quote', text: quote.join(' ') })
      continue
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*+]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^[-*+]\s+/, ''))
        index += 1
      }
      blocks.push({ kind: 'unordered-list', items })
      continue
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\d+[.)]\s+/, ''))
        index += 1
      }
      blocks.push({ kind: 'ordered-list', items })
      continue
    }

    const paragraph = [line.trim()]
    index += 1
    while (
      index < lines.length &&
      Boolean((lines[index] ?? '').trim()) &&
      !isSpecial(lines[index] ?? '')
    ) {
      paragraph.push((lines[index] ?? '').trim())
      index += 1
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}
