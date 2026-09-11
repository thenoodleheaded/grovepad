import { Fragment, type ReactNode } from 'react'
import {
  readDocument,
  readInline,
  type DocumentLine,
  type InlineSpan,
} from './textEditorModel'
import type { FindMatch } from './textDocumentAnalysis'

/**
 * The formatting a writer sees.
 *
 * A textarea cannot style its own contents, so the styling is painted on a
 * second element sitting exactly behind it: same font, same measure, same
 * wrapping, every character present. The textarea on top keeps its own text
 * transparent and contributes only the caret and the selection.
 *
 * This is the same mirror-overlay technique the command line uses to colour
 * its verbs, and it is what lets a Text card show headings and bold while its
 * stored value stays one plain string — no document model, no contenteditable,
 * nothing for the collaboration sync or the board search to relearn.
 *
 * The one law here: EVERY character of the source appears in the output. Drop
 * one and the paint slides out from under the caret for the rest of the line.
 */

/** Emphasis, marker characters included so the paint keeps the source's width. */
function InlineMarkup({ body }: { body: string }): ReactNode {
  const spans = readInline(body)
  if (spans.length === 0) return body

  const out: ReactNode[] = []
  let cursor = 0

  spans.forEach((span: InlineSpan, index) => {
    if (span.start > cursor) out.push(<Fragment key={`gap-${index}`}>{body.slice(cursor, span.start)}</Fragment>)
    const open = body.slice(span.start, span.start + span.openLength)
    const close = body.slice(span.end - span.closeLength, span.end)
    const inner =
      span.kind === 'code' || span.kind === 'citation' || span.kind === 'link' ? (
        span.content
      ) : (
        <InlineMarkup body={span.content} />
      )
    out.push(
      <Fragment key={`span-${index}`}>
        <span className="gp-md-syntax">{open}</span>
        <span className={`gp-md-${span.kind}`}>{inner}</span>
        <span className="gp-md-syntax">{close}</span>
      </Fragment>,
    )
    cursor = span.end
  })

  if (cursor < body.length) out.push(<Fragment key="tail">{body.slice(cursor)}</Fragment>)
  return out
}

function LineMarkup({ line, active }: { line: DocumentLine; active: boolean }): ReactNode {
  const attributes = {
    className: 'gp-md-line',
    'data-kind': line.kind,
    'data-level': line.level || undefined,
    'data-checked': line.kind === 'todo' ? String(Boolean(line.checked)) : undefined,
    'data-active': active || undefined,
  }

  // Blank, divider, fence and code lines are painted verbatim: their `raw` is
  // the only faithful record of them (a "blank" line may be three spaces, and
  // three spaces still take up three spaces under the caret).
  if (line.kind === 'blank' || line.kind === 'divider' || line.kind === 'fence' || line.kind === 'code') {
    return <span {...attributes}>{line.raw || '​'}</span>
  }

  return (
    <span {...attributes}>
      <span className="gp-md-syntax gp-md-marker">{line.marker}</span>
      <InlineMarkup body={line.body} />
    </span>
  )
}

interface TextMarkdownLayerProps {
  text: string
  /** Offset of the caret, so the line being written can be marked. */
  caret?: number | null
}

export function TextMarkdownLayer({ text, caret }: TextMarkdownLayerProps) {
  const lines = readDocument(text)
  // A trailing newline opens a real line in the textarea; without a matching
  // empty line here the paint would end one row short of the caret.
  const trailing = text.endsWith('\n')

  return (
    <div className="gp-md-paint" aria-hidden>
      {lines.map((line, index) => {
        const end = line.start + line.raw.length
        const isActive =
          typeof caret === 'number' && caret >= line.start && caret <= end
        return (
          <Fragment key={index}>
            <LineMarkup line={line} active={isActive} />
            {index < lines.length - 1 ? '\n' : null}
          </Fragment>
        )
      })}
      {trailing ? '​' : null}
    </div>
  )
}

/**
 * The search highlight, painted on its own layer under the formatting.
 *
 * Deliberately not merged into the pass above: a match can start inside a bold
 * run and end outside it, and one pass trying to satisfy both would have to
 * split spans against each other. Two flat layers each stay obviously correct.
 */
export function TextMatchLayer({
  text,
  matches,
  current,
}: {
  text: string
  matches: readonly FindMatch[]
  current: number
}) {
  if (matches.length === 0) return null
  const out: ReactNode[] = []
  let cursor = 0

  matches.forEach((match, index) => {
    if (match.start > cursor) out.push(<Fragment key={`gap-${index}`}>{text.slice(cursor, match.start)}</Fragment>)
    out.push(
      <mark key={`hit-${index}`} className="gp-md-hit" data-current={index === current || undefined}>
        {text.slice(match.start, match.end)}
      </mark>,
    )
    cursor = match.end
  })
  if (cursor < text.length) out.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>)

  return (
    <div className="gp-md-paint gp-md-matches" aria-hidden>
      {out}
    </div>
  )
}
