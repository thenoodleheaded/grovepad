/**
 * The writing engine behind every Text skin.
 *
 * Everything here is a pure function over `{ text, start, end }`. That is the
 * whole point: a Text card stores ONE plain string, and the board's search,
 * the collaboration sync, "Copy as Markdown", the MCP connector and the
 * importer all read that string directly. A rich-text document model would
 * have bought a prettier caret and broken all five, so the caret stays in a
 * textarea and the formatting lives in the characters themselves — markdown,
 * painted live by `TextMarkdownLayer` and edited by the commands below.
 *
 * Nothing in this file touches the DOM, so all of it is testable in a runner
 * with no browser.
 */

/** A caret or a selection inside a document. `start === end` is a caret. */
export interface EditorSelection {
  text: string
  start: number
  end: number
}

/** What one line of the document IS, structurally. */
type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'bullet'
  | 'ordered'
  | 'todo'
  | 'quote'
  | 'code'
  | 'fence'
  | 'divider'
  | 'blank'

export interface DocumentLine {
  kind: BlockKind
  /** Heading depth 1–6, or list nesting depth for the list kinds. */
  level: number
  /** The literal markdown prefix, indentation included. */
  marker: string
  /** Everything after the marker. */
  body: string
  /** Todo state; undefined for every other kind. */
  checked?: boolean
  /** Leading whitespace, kept verbatim so indentation survives a rewrite. */
  indent: string
  raw: string
  /** Character offset of the line's first character in the whole document. */
  start: number
}

const HEADING = /^(\s*)(#{1,6})[ \t](.*)$/
const TODO = /^(\s*)([-*])[ \t]\[([ xX])\][ \t](.*)$/
const BULLET = /^(\s*)([-*])[ \t](.*)$/
const ORDERED = /^(\s*)(\d{1,9})([.)])[ \t](.*)$/
const QUOTE = /^(\s*)>[ \t]?(.*)$/
const DIVIDER = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const FENCE = /^\s*```/

/** One indent step. Two spaces reads as a nesting level without a tab stop. */
const INDENT = '  '

/** Nesting depth from leading whitespace. A tab counts as one full step. */
function depthOf(indent: string): number {
  let columns = 0
  for (const character of indent) columns += character === '\t' ? INDENT.length : 1
  return Math.min(6, Math.floor(columns / INDENT.length))
}

/**
 * Every line of the document, classified.
 *
 * Fenced code is tracked across lines rather than matched per line, because a
 * `# heading` inside a code fence is code — painting it as a heading is the
 * classic markdown-highlighter bug, and a student pasting a shell snippet into
 * their notes hits it immediately.
 */
export function readDocument(text: string): DocumentLine[] {
  const lines: DocumentLine[] = []
  let offset = 0
  let insideFence = false

  for (const raw of text.split('\n')) {
    const start = offset
    offset += raw.length + 1

    if (FENCE.test(raw)) {
      insideFence = !insideFence
      lines.push({ kind: 'fence', level: 0, marker: raw, body: '', indent: '', raw, start })
      continue
    }
    if (insideFence) {
      lines.push({ kind: 'code', level: 0, marker: '', body: raw, indent: '', raw, start })
      continue
    }
    if (raw.trim() === '') {
      lines.push({ kind: 'blank', level: 0, marker: '', body: '', indent: '', raw, start })
      continue
    }
    if (DIVIDER.test(raw)) {
      lines.push({ kind: 'divider', level: 0, marker: raw, body: '', indent: '', raw, start })
      continue
    }

    const heading = HEADING.exec(raw)
    if (heading) {
      const [, indent, hashes, body] = heading as unknown as [string, string, string, string]
      lines.push({
        kind: 'heading',
        level: hashes.length,
        marker: `${indent}${hashes} `,
        body,
        indent,
        raw,
        start,
      })
      continue
    }

    // Todo is checked before bullet on purpose: `- [ ] x` matches both, and a
    // checkbox is the more specific reading.
    const todo = TODO.exec(raw)
    if (todo) {
      const [, indent, bullet, box, body] = todo as unknown as [string, string, string, string, string]
      lines.push({
        kind: 'todo',
        level: depthOf(indent),
        marker: `${indent}${bullet} [${box}] `,
        body,
        checked: box.toLowerCase() === 'x',
        indent,
        raw,
        start,
      })
      continue
    }

    const bullet = BULLET.exec(raw)
    if (bullet) {
      const [, indent, glyph, body] = bullet as unknown as [string, string, string, string]
      lines.push({
        kind: 'bullet',
        level: depthOf(indent),
        marker: `${indent}${glyph} `,
        body,
        indent,
        raw,
        start,
      })
      continue
    }

    const ordered = ORDERED.exec(raw)
    if (ordered) {
      const [, indent, number, dot, body] = ordered as unknown as [string, string, string, string, string]
      lines.push({
        kind: 'ordered',
        level: depthOf(indent),
        marker: `${indent}${number}${dot} `,
        body,
        indent,
        raw,
        start,
      })
      continue
    }

    const quote = QUOTE.exec(raw)
    if (quote) {
      const [, indent, body] = quote as unknown as [string, string, string]
      lines.push({
        kind: 'quote',
        level: depthOf(indent),
        marker: raw.slice(0, raw.length - body.length),
        body,
        indent,
        raw,
        start,
      })
      continue
    }

    const indent = /^\s*/.exec(raw)?.[0] ?? ''
    lines.push({
      kind: 'paragraph',
      level: depthOf(indent),
      marker: indent,
      body: raw.slice(indent.length),
      indent,
      raw,
      start,
    })
  }

  return lines
}

// ---------------------------------------------------------------------------
// Inline spans
// ---------------------------------------------------------------------------

type InlineKind = 'strong' | 'em' | 'code' | 'mark' | 'strike' | 'link' | 'citation'

export interface InlineSpan {
  kind: InlineKind
  /** Offsets within the line body the span was read from. */
  start: number
  end: number
  /** Marker width at each end, so the painter can dim the syntax. */
  openLength: number
  closeLength: number
  /** The readable part: the label of a link, the key of a citation. */
  content: string
  /** A link's target, a citation's key. */
  value?: string
}

/** `**a**` before `*a*`, so the longer fence wins its own characters. */
const PAIRED: readonly { kind: InlineKind; marker: string }[] = [
  { kind: 'code', marker: '`' },
  { kind: 'strong', marker: '**' },
  { kind: 'mark', marker: '==' },
  { kind: 'strike', marker: '~~' },
  { kind: 'em', marker: '*' },
  { kind: 'em', marker: '_' },
]

const CITATION = /^\[@([^\]\s]+)\]/
const LINK = /^\[([^\]]*)\]\(([^)\s]*)\)/

/**
 * The emphasis inside one line's body, left to right, never overlapping.
 *
 * A single forward scan rather than a nest of regexes: the scanner takes the
 * first marker it can close and jumps past it, which is what stops `**bold**`
 * from also being read as two italics and keeps `` `*not italic*` `` literal.
 */
export function readInline(body: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let index = 0

  while (index < body.length) {
    const rest = body.slice(index)

    const citation = CITATION.exec(rest)
    if (citation) {
      const key = citation[1] as string
      spans.push({
        kind: 'citation',
        start: index,
        end: index + citation[0].length,
        openLength: 2,
        closeLength: 1,
        content: key,
        value: key,
      })
      index += citation[0].length
      continue
    }

    const link = LINK.exec(rest)
    if (link) {
      const label = link[1] as string
      spans.push({
        kind: 'link',
        start: index,
        end: index + link[0].length,
        openLength: 1,
        closeLength: link[0].length - label.length - 1,
        content: label,
        value: link[2] as string,
      })
      index += link[0].length
      continue
    }

    let matched = false
    for (const { kind, marker } of PAIRED) {
      if (!rest.startsWith(marker)) continue
      const close = body.indexOf(marker, index + marker.length)
      if (close === -1) continue
      const content = body.slice(index + marker.length, close)
      // An empty fence is two literal asterisks, and a fence that opens on a
      // space is a bullet or a multiplication sign, not emphasis.
      if (content.length === 0 || /^\s|\s$/.test(content)) continue
      spans.push({
        kind,
        start: index,
        end: close + marker.length,
        openLength: marker.length,
        closeLength: marker.length,
        content,
        value: undefined,
      })
      index = close + marker.length
      matched = true
      break
    }
    if (!matched) index += 1
  }

  return spans
}

// ---------------------------------------------------------------------------
// Commands — every one takes a selection and returns the next selection
// ---------------------------------------------------------------------------

/** The full-line range covering a selection, so line commands never split one. */
export function lineRange(text: string, start: number, end: number): { from: number; to: number } {
  const from = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nextBreak = text.indexOf('\n', end)
  return { from, to: nextBreak === -1 ? text.length : nextBreak }
}

const WORD = /[\p{L}\p{N}_'’-]/u

/** The word under a caret, so ⌘B with nothing selected still bolds something. */
export function wordAt(text: string, offset: number): { start: number; end: number } {
  let start = offset
  let end = offset
  while (start > 0 && WORD.test(text[start - 1] as string)) start -= 1
  while (end < text.length && WORD.test(text[end] as string)) end += 1
  return { start, end }
}

export const INLINE_MARKERS: Record<'bold' | 'italic' | 'code' | 'highlight' | 'strike', string> = {
  bold: '**',
  italic: '*',
  code: '`',
  highlight: '==',
  strike: '~~',
}

/**
 * Wrap or unwrap the selection in an inline marker.
 *
 * Unwrapping handles both shapes people produce: markers inside the selection
 * (`|**word**|`) and markers hugging it (`**|word|**`). Missing the second one
 * is why so many editors need two presses of ⌘B to undo one.
 */
export function toggleInline(selection: EditorSelection, marker: string): EditorSelection {
  const { text } = selection
  let { start, end } = selection
  if (start === end) {
    const word = wordAt(text, start)
    start = word.start
    end = word.end
  }

  const inner = text.slice(start, end)
  const width = marker.length

  if (inner.length >= width * 2 && inner.startsWith(marker) && inner.endsWith(marker)) {
    const stripped = inner.slice(width, inner.length - width)
    return {
      text: text.slice(0, start) + stripped + text.slice(end),
      start,
      end: start + stripped.length,
    }
  }

  if (text.slice(start - width, start) === marker && text.slice(end, end + width) === marker) {
    return {
      text: text.slice(0, start - width) + inner + text.slice(end + width),
      start: start - width,
      end: end - width,
    }
  }

  if (start === end) {
    // Nothing to wrap: leave an empty pair with the caret between the markers.
    return {
      text: `${text.slice(0, start)}${marker}${marker}${text.slice(start)}`,
      start: start + width,
      end: start + width,
    }
  }

  return {
    text: `${text.slice(0, start)}${marker}${inner}${marker}${text.slice(end)}`,
    start: start + width,
    end: end + width,
  }
}

/** Strip whatever block marker a line wears, keeping its indentation. */
export function stripMarker(raw: string): string {
  const line = readDocument(raw)[0] as DocumentLine
  if (line.kind === 'paragraph' || line.kind === 'blank') return raw
  if (line.kind === 'code' || line.kind === 'fence' || line.kind === 'divider') return raw
  return line.indent + line.body
}

export type BlockCommand = 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'todo' | 'quote'

function markerFor(command: BlockCommand, ordinal: number): string {
  if (command === 'h1') return '# '
  if (command === 'h2') return '## '
  if (command === 'h3') return '### '
  if (command === 'bullet') return '- '
  if (command === 'todo') return '- [ ] '
  if (command === 'quote') return '> '
  return `${ordinal}. `
}

function wearsCommand(line: DocumentLine, command: BlockCommand): boolean {
  if (command === 'h1') return line.kind === 'heading' && line.level === 1
  if (command === 'h2') return line.kind === 'heading' && line.level === 2
  if (command === 'h3') return line.kind === 'heading' && line.level === 3
  if (command === 'bullet') return line.kind === 'bullet'
  if (command === 'ordered') return line.kind === 'ordered'
  if (command === 'todo') return line.kind === 'todo'
  return line.kind === 'quote'
}

/**
 * Put every line of the selection into a block shape, or take it back out.
 *
 * Pressing the same command twice returns the lines to plain paragraphs, which
 * is what every editor a student has used does. Numbered lists renumber from
 * one across the selection instead of repeating `1.`.
 */
export function toggleBlock(selection: EditorSelection, command: BlockCommand): EditorSelection {
  const { text } = selection
  const { from, to } = lineRange(text, selection.start, selection.end)
  const slice = text.slice(from, to)
  const rows = slice.split('\n')
  const parsed = rows.map((row) => readDocument(row)[0] as DocumentLine)
  const everyLineWearsIt = parsed.every((line) => line.kind === 'blank' || wearsCommand(line, command))

  let ordinal = 1
  const rewritten = rows.map((row, index) => {
    const line = parsed[index] as DocumentLine
    if (line.kind === 'blank') return row
    const bare = stripMarker(row)
    if (everyLineWearsIt) return bare
    const indent = /^\s*/.exec(bare)?.[0] ?? ''
    const body = bare.slice(indent.length)
    return `${indent}${markerFor(command, ordinal++)}${body}`
  })

  const next = rewritten.join('\n')
  const delta = next.length - slice.length
  return {
    text: text.slice(0, from) + next + text.slice(to),
    // Anchoring to the line start keeps the caret on its own line when the
    // marker in front of it grows or shrinks under the selection.
    start: Math.max(from, selection.start + (selection.start > from ? delta : 0)),
    end: Math.max(from, selection.end + delta),
  }
}

/** Add or remove one indent step on every line of the selection. */
export function shiftIndent(selection: EditorSelection, direction: 1 | -1): EditorSelection {
  const { text } = selection
  const { from, to } = lineRange(text, selection.start, selection.end)
  const rows = text.slice(from, to).split('\n')
  let firstDelta = 0
  let totalDelta = 0

  const rewritten = rows.map((row, index) => {
    if (row.trim() === '') return row
    let next: string
    if (direction === 1) {
      next = INDENT + row
    } else if (row.startsWith(INDENT)) {
      next = row.slice(INDENT.length)
    } else if (row.startsWith('\t')) {
      next = row.slice(1)
    } else {
      next = row.replace(/^\s/, '')
    }
    const delta = next.length - row.length
    if (index === 0) firstDelta = delta
    totalDelta += delta
    return next
  })

  return {
    text: text.slice(0, from) + rewritten.join('\n') + text.slice(to),
    start: Math.max(from, selection.start + firstDelta),
    end: Math.max(from, selection.end + totalDelta),
  }
}

/**
 * What Enter should produce, or `null` when the browser's own newline is
 * right. Returning null matters: an unhandled Enter keeps the textarea's
 * native undo entry intact, and native undo is still the cheapest correct
 * undo for ordinary typing.
 */
export function continueBlock(selection: EditorSelection): EditorSelection | null {
  const { text, start } = selection
  if (start !== selection.end) return null
  const { from } = lineRange(text, start, start)
  const line = readDocument(text.slice(from, start))[0] as DocumentLine
  if (line.kind !== 'bullet' && line.kind !== 'ordered' && line.kind !== 'todo' && line.kind !== 'quote') {
    return null
  }

  // Enter on an empty item ends the list rather than making another empty one.
  if (line.body.trim() === '') {
    const lineStart = from
    return {
      text: text.slice(0, lineStart) + text.slice(start),
      start: lineStart,
      end: lineStart,
    }
  }

  let marker: string
  if (line.kind === 'ordered') {
    const number = Number.parseInt(line.marker.trim(), 10)
    const separator = line.marker.trim().endsWith(')') ? ')' : '.'
    marker = `${line.indent}${Number.isFinite(number) ? number + 1 : 1}${separator} `
  } else if (line.kind === 'todo') {
    marker = `${line.indent}- [ ] `
  } else if (line.kind === 'quote') {
    marker = `${line.indent}> `
  } else {
    marker = line.marker
  }

  const insertion = `\n${marker}`
  return {
    text: text.slice(0, start) + insertion + text.slice(start),
    start: start + insertion.length,
    end: start + insertion.length,
  }
}

/** Flip the checkbox on the line containing `offset`. */
export function toggleTodoAt(text: string, offset: number): string {
  const { from, to } = lineRange(text, offset, offset)
  const row = text.slice(from, to)
  const line = readDocument(row)[0] as DocumentLine
  if (line.kind !== 'todo') return text
  const next = line.checked
    ? row.replace(/\[[xX]\]/, '[ ]')
    : row.replace(/\[ \]/, '[x]')
  return text.slice(0, from) + next + text.slice(to)
}

/** Move the selected lines up or down, the way ⌥↑/⌥↓ does everywhere else. */
export function moveLines(selection: EditorSelection, direction: 1 | -1): EditorSelection {
  const { text } = selection
  const rows = text.split('\n')
  const { from, to } = lineRange(text, selection.start, selection.end)
  const firstRow = text.slice(0, from).split('\n').length - 1
  const lastRow = text.slice(0, to).split('\n').length - 1
  const target = direction === -1 ? firstRow - 1 : lastRow + 1
  if (target < 0 || target >= rows.length) return selection

  const block = rows.splice(firstRow, lastRow - firstRow + 1)
  rows.splice(direction === -1 ? firstRow - 1 : firstRow + 1, 0, ...block)
  const next = rows.join('\n')
  const moved = ((rows[direction === -1 ? target : firstRow] as string) ?? '').length + 1
  const shift = direction === -1 ? -moved : moved
  return { text: next, start: selection.start + shift, end: selection.end + shift }
}

/** Copy the selected lines directly below themselves. */
export function duplicateLines(selection: EditorSelection): EditorSelection {
  const { text } = selection
  const { from, to } = lineRange(text, selection.start, selection.end)
  const block = text.slice(from, to)
  return {
    text: `${text.slice(0, to)}\n${block}${text.slice(to)}`,
    start: selection.start + block.length + 1,
    end: selection.end + block.length + 1,
  }
}

/** Delete the selected lines outright. */
export function deleteLines(selection: EditorSelection): EditorSelection {
  const { text } = selection
  const { from, to } = lineRange(text, selection.start, selection.end)
  const tail = to < text.length ? to + 1 : to
  return { text: text.slice(0, from) + text.slice(tail), start: from, end: from }
}

/** Wrap the selection as a link, or drop a link skeleton at the caret. */
export function insertLink(selection: EditorSelection, url = ''): EditorSelection {
  const { text, start, end } = selection
  const label = text.slice(start, end)
  const built = `[${label}](${url})`
  return {
    text: text.slice(0, start) + built + text.slice(end),
    // Caret lands inside the parentheses, which is the part still to fill in.
    start: start + label.length + 3,
    end: start + label.length + 3 + url.length,
  }
}
