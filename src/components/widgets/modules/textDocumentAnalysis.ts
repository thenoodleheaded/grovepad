/**
 * What a document says about itself: how long it is, what its headings are,
 * where a search term sits, and which sources it cites.
 *
 * Split from `textEditorModel` because these answer questions ABOUT the text
 * rather than changing it — the editor commands run on every keystroke, these
 * run when a panel is open — and because a word count is the one number a
 * school assignment is actually graded against, so it deserves to be read
 * from the words a reader sees rather than from the markdown that produces
 * them.
 */

import { readDocument, readInline, type DocumentLine } from './textEditorModel'

// ---------------------------------------------------------------------------
// Plain reading
// ---------------------------------------------------------------------------

/**
 * The document as a reader receives it: markers gone, structure kept.
 *
 * Counting words on the raw markdown would score `**word**` as one word (fine)
 * but `- [ ] task` as three (not fine), and a heading's `##` as a word of its
 * own. A word limit is a promise about prose, so the count is taken here.
 */
export function plainText(text: string): string {
  return readDocument(text)
    .map((line) => {
      if (line.kind === 'fence' || line.kind === 'divider') return ''
      if (line.kind === 'code') return line.body
      return stripInline(line.body)
    })
    .join('\n')
}

/** One line's body with its emphasis markers removed. */
export function stripInline(body: string): string {
  const spans = readInline(body)
  if (spans.length === 0) return body
  let out = ''
  let cursor = 0
  for (const span of spans) {
    out += body.slice(cursor, span.start)
    // A citation reads as its own marker in prose — the bibliography carries
    // the source — so it contributes no words to the count.
    out += span.kind === 'citation' ? '' : stripInline(span.content)
    cursor = span.end
  }
  return out + body.slice(cursor)
}

export interface DocumentStats {
  words: number
  characters: number
  charactersNoSpaces: number
  sentences: number
  paragraphs: number
  /** Whole minutes at 200 wpm, the figure most reading-time labels quote. */
  readingMinutes: number
}

export function documentStats(text: string): DocumentStats {
  const plain = plainText(text)
  const words = plain.match(/[^\s]+/g)?.length ?? 0
  const sentences = plain.match(/[^.!?\n]+[.!?]+(?=\s|$)/g)?.length ?? 0
  const paragraphs = plain
    .split(/\n{2,}/)
    .filter((block) => block.trim().length > 0).length
  const characters = plain.replace(/\n/g, '').length
  return {
    words,
    characters,
    charactersNoSpaces: plain.replace(/\s/g, '').length,
    sentences,
    paragraphs,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / 200)),
  }
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export interface OutlineEntry {
  level: number
  title: string
  /** Offset of the heading line, so clicking one can put the caret there. */
  start: number
  /** Words between this heading and the next, for a sense of section weight. */
  words: number
}

/** Every heading in order, each carrying the size of the section it opens. */
export function documentOutline(text: string): OutlineEntry[] {
  const lines = readDocument(text)
  const headings: { index: number; line: DocumentLine }[] = []
  lines.forEach((line, index) => {
    if (line.kind === 'heading') headings.push({ index, line })
  })

  return headings.map(({ index, line }, position) => {
    const nextIndex = headings[position + 1]?.index ?? lines.length
    const body = lines
      .slice(index + 1, nextIndex)
      .map((entry) => stripInline(entry.body))
      .join(' ')
    return {
      level: line.level,
      title: stripInline(line.body).trim() || 'Untitled section',
      start: line.start,
      words: body.match(/[^\s]+/g)?.length ?? 0,
    }
  })
}

// ---------------------------------------------------------------------------
// Find and replace
// ---------------------------------------------------------------------------

export interface FindOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
}

export interface FindMatch {
  start: number
  end: number
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every occurrence of `query`, left to right. An empty query matches nothing. */
export function findMatches(
  text: string,
  query: string,
  options: FindOptions = {},
): FindMatch[] {
  if (query === '') return []
  const body = escapeForRegex(query)
  const source = options.wholeWord ? `\\b${body}\\b` : body
  const pattern = new RegExp(source, options.caseSensitive ? 'g' : 'gi')
  const matches: FindMatch[] = []
  for (const found of text.matchAll(pattern)) {
    const start = found.index ?? 0
    matches.push({ start, end: start + found[0].length })
    // A zero-width match would spin here forever; nothing else can produce one
    // now that the empty query returns early, but the guard costs nothing.
    if (found[0].length === 0) break
  }
  return matches
}

/** Replace one located match, leaving every other occurrence alone. */
export function replaceMatch(text: string, match: FindMatch, replacement: string): string {
  return text.slice(0, match.start) + replacement + text.slice(match.end)
}

/** Replace every occurrence in one pass, right to left so offsets stay valid. */
export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  options: FindOptions = {},
): string {
  const matches = findMatches(text, query, options)
  let next = text
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    next = replaceMatch(next, matches[index] as FindMatch, replacement)
  }
  return next
}

/** The match at or after `offset`, wrapping to the top — ⌘G's behaviour. */
export function nextMatchFrom(
  matches: readonly FindMatch[],
  offset: number,
  direction: 1 | -1 = 1,
): number {
  if (matches.length === 0) return -1
  if (direction === 1) {
    const found = matches.findIndex((match) => match.start >= offset)
    return found === -1 ? 0 : found
  }
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if ((matches[index] as FindMatch).start < offset) return index
  }
  return matches.length - 1
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

/** One entry a `[@key]` token can resolve against. */
export interface CitationEntry {
  key: string
  author: string
  year: string
  title: string
}

export type CitationStyleName = 'APA' | 'MLA' | 'Chicago'

/** Every `[@key]` in the document, in order, deduplicated. */
export function citationKeys(text: string): string[] {
  const keys: string[] = []
  for (const line of readDocument(text)) {
    if (line.kind === 'code' || line.kind === 'fence') continue
    for (const span of readInline(line.body)) {
      if (span.kind !== 'citation') continue
      if (!keys.includes(span.content)) keys.push(span.content)
    }
  }
  return keys
}

/**
 * A short key for a source, matching how a writer would type it: the author's
 * surname, lowercased, with the year appended when there is one.
 */
export function citationKeyFor(entry: { author: string; year: string }): string {
  const surname = entry.author.trim().split(/[\s,]+/).filter(Boolean).pop() ?? 'source'
  const slug = surname.toLowerCase().replace(/[^a-z0-9]/g, '')
  const year = entry.year.trim().replace(/[^0-9]/g, '')
  return year ? `${slug}${year}` : slug || 'source'
}

/** One source written out in a style. Mirrors the Citation card's formatter. */
export function formatCitation(style: CitationStyleName, entry: CitationEntry): string {
  const author = entry.author.trim() || 'Author'
  const year = entry.year.trim() || 'n.d.'
  const title = entry.title.trim() || 'Title'
  if (style === 'MLA') return `${author}. "${title}." ${year}.`
  if (style === 'Chicago') return `${author}. ${title}. ${year}.`
  return `${author} (${year}). ${title}.`
}

/** The in-text mark a `[@key]` becomes when the document is exported. */
export function inTextCitation(style: CitationStyleName, entry: CitationEntry): string {
  const surname = entry.author.trim().split(/[\s,]+/).filter(Boolean).pop() ?? entry.author.trim()
  const year = entry.year.trim() || 'n.d.'
  if (style === 'MLA') return `(${surname || 'Author'})`
  return `(${surname || 'Author'}, ${year})`
}

export interface Bibliography {
  style: CitationStyleName
  /** Resolved sources, alphabetical — how a reference list is ordered. */
  entries: { key: string; formatted: string }[]
  /** Keys used in the writing with no source behind them. */
  missing: string[]
}

/**
 * The reference list a document earns from the sources available to it.
 *
 * Unresolved keys are reported rather than silently dropped: a citation that
 * points at nothing is exactly the thing a student needs told before they hand
 * the essay in, and a bibliography that quietly omits it hides the problem.
 */
export function buildBibliography(
  text: string,
  sources: readonly CitationEntry[],
  style: CitationStyleName,
): Bibliography {
  const used = citationKeys(text)
  const byKey = new Map(sources.map((source) => [source.key, source]))
  const entries: { key: string; formatted: string }[] = []
  const missing: string[] = []

  for (const key of used) {
    const source = byKey.get(key)
    if (!source) {
      missing.push(key)
      continue
    }
    entries.push({ key, formatted: formatCitation(style, source) })
  }

  entries.sort((left, right) => left.formatted.localeCompare(right.formatted))
  return { style, entries, missing }
}
