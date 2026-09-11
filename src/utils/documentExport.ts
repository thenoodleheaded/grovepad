/**
 * Getting the writing out of the board.
 *
 * A canvas card is not something a student can hand in, and up to now grovepad
 * could only read documents in (PDF, Markdown, TXT through the import sheet)
 * with no way back out. These are the ways out: the markdown itself, plain
 * text, a Word-readable file, and print — which is also how a PDF gets made on
 * every platform we ship on.
 *
 * The Word route is deliberately HTML wearing a `.doc` extension rather than a
 * real `.docx`. A `.docx` is a ZIP of XML parts and would mean shipping a zip
 * encoder for one button; Word, Pages, LibreOffice and Google Docs all open
 * this format and keep the headings, lists, bold and blockquotes intact, which
 * is the entire point of the export.
 */

import {
  readDocument,
  readInline,
  type DocumentLine,
  type InlineSpan,
} from '../components/widgets/modules/textEditorModel'
import {
  buildBibliography,
  inTextCitation,
  stripInline as stripInlineText,
  type CitationEntry,
  type CitationStyleName,
} from '../components/widgets/modules/textDocumentAnalysis'

export interface ExportOptions {
  title: string
  /** Sources for `[@key]` tokens. Omitted keys are left as written. */
  sources?: readonly CitationEntry[]
  style?: CitationStyleName
  /** Double-spaced body type, which is what most essay briefs ask for. */
  doubleSpaced?: boolean
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A link target we are willing to write into an exported file.
 *
 * The document may contain anything the writer typed, and an exported page is
 * opened outside the app where our own protections do not reach — so a
 * `javascript:` target is dropped rather than carried along.
 */
function safeHref(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed === '') return null
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null
  return trimmed
}

function renderInline(
  body: string,
  citation: (key: string) => string | null,
): string {
  const spans = readInline(body)
  if (spans.length === 0) return escapeHtml(body)

  let out = ''
  let cursor = 0
  for (const span of spans as InlineSpan[]) {
    out += escapeHtml(body.slice(cursor, span.start))
    const inner = renderInline(span.content, citation)
    if (span.kind === 'strong') out += `<strong>${inner}</strong>`
    else if (span.kind === 'em') out += `<em>${inner}</em>`
    else if (span.kind === 'code') out += `<code>${escapeHtml(span.content)}</code>`
    else if (span.kind === 'mark') out += `<mark>${inner}</mark>`
    else if (span.kind === 'strike') out += `<s>${inner}</s>`
    else if (span.kind === 'citation') {
      out += escapeHtml(citation(span.content) ?? `[@${span.content}]`)
    } else {
      const href = safeHref(span.value ?? '')
      out += href
        ? `<a href="${escapeHtml(href)}">${inner}</a>`
        : inner
    }
    cursor = span.end
  }
  return out + escapeHtml(body.slice(cursor))
}

/** Markdown as document HTML: headings, lists, quotes, code, and citations. */
export function markdownToHtml(text: string, options: ExportOptions): string {
  const style = options.style ?? 'APA'
  const bibliography = options.sources
    ? buildBibliography(text, options.sources, style)
    : null
  const byKey = new Map((options.sources ?? []).map((source) => [source.key, source]))
  const citation = (key: string): string | null => {
    const source = byKey.get(key)
    return source ? inTextCitation(style, source) : null
  }

  const lines = readDocument(text)
  const parts: string[] = []
  let openList: 'ul' | 'ol' | null = null
  let paragraph: string[] = []
  let code: string[] | null = null

  const closeParagraph = () => {
    if (paragraph.length === 0) return
    parts.push(`<p>${paragraph.join(' ')}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (!openList) return
    parts.push(`</${openList}>`)
    openList = null
  }
  const openListAs = (kind: 'ul' | 'ol') => {
    if (openList === kind) return
    closeList()
    parts.push(`<${kind}>`)
    openList = kind
  }

  for (const line of lines as DocumentLine[]) {
    if (line.kind === 'fence') {
      if (code) {
        parts.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = null
      } else {
        closeParagraph()
        closeList()
        code = []
      }
      continue
    }
    if (code) {
      code.push(line.raw)
      continue
    }
    if (line.kind === 'blank') {
      closeParagraph()
      closeList()
      continue
    }
    if (line.kind === 'divider') {
      closeParagraph()
      closeList()
      parts.push('<hr />')
      continue
    }
    if (line.kind === 'heading') {
      closeParagraph()
      closeList()
      const level = Math.min(6, Math.max(1, line.level))
      parts.push(`<h${level}>${renderInline(line.body, citation)}</h${level}>`)
      continue
    }
    if (line.kind === 'quote') {
      closeParagraph()
      closeList()
      parts.push(`<blockquote><p>${renderInline(line.body, citation)}</p></blockquote>`)
      continue
    }
    if (line.kind === 'bullet' || line.kind === 'ordered' || line.kind === 'todo') {
      closeParagraph()
      openListAs(line.kind === 'ordered' ? 'ol' : 'ul')
      // A checkbox exports as a box glyph rather than an input: the file is
      // going to a marker or a printer, where a live control means nothing.
      const box = line.kind === 'todo' ? (line.checked ? '☑ ' : '☐ ') : ''
      parts.push(`<li>${box}${renderInline(line.body, citation)}</li>`)
      continue
    }
    closeList()
    paragraph.push(renderInline(line.body, citation))
  }

  if (code) parts.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  closeParagraph()
  closeList()

  if (bibliography && bibliography.entries.length > 0) {
    parts.push('<h2 class="gp-doc-references">References</h2>')
    parts.push(
      `<div class="gp-doc-bibliography">${bibliography.entries
        .map((entry) => `<p>${escapeHtml(entry.formatted)}</p>`)
        .join('')}</div>`,
    )
  }

  return parts.join('\n')
}

/** Print/Word stylesheet: a manuscript, not a web page. */
function documentStyles(doubleSpaced: boolean): string {
  return `
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: ${
      doubleSpaced ? '2' : '1.5'
    }; color: #111; margin: 2.54cm; }
    h1 { font-size: 18pt; }
    h2 { font-size: 15pt; }
    h3 { font-size: 13pt; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.2em 0 0.5em; }
    p { margin: 0 0 0.9em; }
    blockquote { margin: 0.9em 0 0.9em 1.6em; padding-left: 0.9em; border-left: 2px solid #bbb; color: #333; }
    code, pre { font-family: 'SF Mono', Consolas, monospace; font-size: 10.5pt; }
    pre { background: #f4f4f4; padding: 0.8em; overflow-x: auto; line-height: 1.45; }
    mark { background: #fff2a8; }
    ul, ol { margin: 0 0 0.9em 1.4em; padding: 0; }
    li { margin: 0 0 0.3em; }
    a { color: #14487f; }
    hr { border: 0; border-top: 1px solid #ccc; margin: 1.4em 0; }
    /* A reference list hangs its second line, in all three styles we format. */
    .gp-doc-bibliography p { padding-left: 2em; text-indent: -2em; }
    @page { margin: 2.54cm; }
  `
}

/**
 * Whether the writing already opens with its own title.
 *
 * If it does, the card's title must not be printed above it — handing in a
 * page that says the same thing twice in two different sizes is exactly the
 * kind of small wrongness a marker notices.
 */
function opensWithTitle(text: string): boolean {
  // Only the FIRST written line counts. A `# Part Two` halfway down is a
  // section break, not the document's title, and letting it answer this
  // question hands in a page with no title at all.
  const first = readDocument(text).find((line) => line.kind !== 'blank')
  return first?.kind === 'heading' && first.level === 1
}

/** A complete standalone document file, ready to save or print. */
export function documentFileHtml(text: string, options: ExportOptions): string {
  const title = options.title.trim() || 'Untitled'
  const heading = opensWithTitle(text) ? '' : `<h1>${escapeHtml(title)}</h1>\n`
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${documentStyles(options.doubleSpaced ?? false)}</style>
</head>
<body>
${heading}${markdownToHtml(text, options)}
</body>
</html>`
}

/**
 * The document as prose for a plain `.txt` hand-in.
 *
 * Emphasis markers go (nothing renders them in a text file) but LIST markers
 * stay. That split matters: `plainText` strips everything because it feeds the
 * word count, and counting `- ` as a word would be wrong — but a text file
 * that silently turns a five-item list into five loose sentences has lost the
 * structure the writer put there.
 */
function documentToProse(text: string): string {
  return readDocument(text)
    .map((line) => {
      if (line.kind === 'fence') return ''
      if (line.kind === 'code' || line.kind === 'divider' || line.kind === 'blank') return line.raw
      // A heading stands alone on its line, so its hashes carry nothing here.
      if (line.kind === 'heading') return line.indent + stripInlineText(line.body)
      if (line.kind === 'paragraph') return line.indent + stripInlineText(line.body)
      return line.marker + stripInlineText(line.body)
    })
    .join('\n')
}

/** The document as prose, emphasis stripped — for a plain `.txt` hand-in. */
export function documentPlainText(text: string, options: ExportOptions): string {
  const title = options.title.trim()
  const body = documentToProse(text)
  return title ? `${title}\n\n${body}` : body
}

/** A filename that survives every filesystem we run on. */
export function exportFileName(title: string, extension: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return `${base || 'Untitled'}.${extension}`
}

export type ExportFormat = 'markdown' | 'text' | 'word' | 'html'

const MIME: Record<ExportFormat, string> = {
  markdown: 'text/markdown;charset=utf-8',
  text: 'text/plain;charset=utf-8',
  word: 'application/msword',
  html: 'text/html;charset=utf-8',
}

const EXTENSION: Record<ExportFormat, string> = {
  markdown: 'md',
  text: 'txt',
  word: 'doc',
  html: 'html',
}

/** The bytes each format writes, so the choice of body is testable on its own. */
export function exportBody(format: ExportFormat, text: string, options: ExportOptions): string {
  if (format === 'markdown') return text
  if (format === 'text') return documentPlainText(text, options)
  return documentFileHtml(text, options)
}

/** Hand the finished file to the browser as a download. */
export function downloadDocument(
  format: ExportFormat,
  text: string,
  options: ExportOptions,
): void {
  const blob = new Blob([exportBody(format, text, options)], { type: MIME[format] })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = exportFileName(options.title, EXTENSION[format])
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Freed on the next turn: revoking synchronously can beat the download in
  // some browsers and produce an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Send the document to the printer, which is also "Save as PDF" on macOS,
 * Windows, iOS and Android.
 *
 * An offscreen iframe rather than a popup window: a popup is blocked unless
 * the click is trusted all the way down, and the print sheet failing silently
 * on the one export a student actually needs is not an acceptable failure.
 */
export function printDocument(text: string, options: ExportOptions): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0'
  document.body.appendChild(frame)

  const remove = () => frame.remove()
  frame.onload = () => {
    const view = frame.contentWindow
    if (!view) {
      remove()
      return
    }
    view.focus()
    view.print()
    // The print dialog is modal in every browser we support, so by the time
    // this resolves the sheet has been dismissed one way or the other.
    setTimeout(remove, 1000)
  }

  const document_ = frame.contentDocument
  if (!document_) {
    remove()
    return
  }
  document_.open()
  document_.write(documentFileHtml(text, options))
  document_.close()
}
