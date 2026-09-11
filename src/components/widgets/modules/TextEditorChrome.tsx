import {
  Bold,
  ChevronDown,
  ChevronUp,
  Code,
  FileDown,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Printer,
  Quote,
  Redo2,
  Strikethrough,
  Target,
  Undo2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { INLINE_MARKERS } from './textEditorModel'
import type { EditorCommandApi } from './TextEditorSurface'
import {
  documentOutline,
  documentStats,
  type Bibliography,
  type FindMatch,
} from './textDocumentAnalysis'
import { WORD_GOALS } from './textSkinCapabilities'

/**
 * The furniture around a writing surface: the formatting row, the search bar,
 * the outline, the counters, the goal, the reference list, the export row.
 *
 * Each one is a plain presentational piece taking a command surface or a
 * string. Which of them a skin puts on screen is decided once, in
 * `textSkinCapabilities` — nothing here decides anything about a skin.
 */

interface ToolButton {
  key: string
  label: string
  hint: string
  icon: LucideIcon
  run: (api: EditorCommandApi) => void
}

const INLINE_TOOLS: readonly ToolButton[] = [
  { key: 'bold', label: 'Bold', hint: '⌘B', icon: Bold, run: (api) => api.inline(INLINE_MARKERS.bold) },
  { key: 'italic', label: 'Italic', hint: '⌘I', icon: Italic, run: (api) => api.inline(INLINE_MARKERS.italic) },
  { key: 'highlight', label: 'Highlight', hint: '⌘⇧H', icon: Highlighter, run: (api) => api.inline(INLINE_MARKERS.highlight) },
  { key: 'strike', label: 'Strikethrough', hint: '⌘⇧X', icon: Strikethrough, run: (api) => api.inline(INLINE_MARKERS.strike) },
  { key: 'code', label: 'Code', hint: '⌘E', icon: Code, run: (api) => api.inline(INLINE_MARKERS.code) },
  { key: 'link', label: 'Link', hint: '⌘K', icon: Link2, run: (api) => api.link() },
]

const BLOCK_TOOLS: readonly ToolButton[] = [
  { key: 'h1', label: 'Title', hint: '⌘⌥1', icon: Heading1, run: (api) => api.block('h1') },
  { key: 'h2', label: 'Heading', hint: '⌘⌥2', icon: Heading2, run: (api) => api.block('h2') },
  { key: 'h3', label: 'Subheading', hint: '⌘⌥3', icon: Heading3, run: (api) => api.block('h3') },
  { key: 'bullet', label: 'Bulleted list', hint: '⌘⇧8', icon: List, run: (api) => api.block('bullet') },
  { key: 'ordered', label: 'Numbered list', hint: '⌘⇧7', icon: ListOrdered, run: (api) => api.block('ordered') },
  { key: 'todo', label: 'Checklist', hint: '⌘⇧9', icon: ListChecks, run: (api) => api.block('todo') },
  { key: 'quote', label: 'Quote', hint: '⌘⇧>', icon: Quote, run: (api) => api.block('quote') },
]

/**
 * The formatting row.
 *
 * Every button says its shortcut in its own tooltip, because the fastest a
 * toolbar can work is by making itself unnecessary — the point is that a
 * student who used ⌘B in Docs finds ⌘B here, and the row is where they learn
 * the two or three they did not already know.
 */
export function FormattingToolbar({ api }: { api: EditorCommandApi | null }) {
  const run = (tool: ToolButton) => {
    if (!api) return
    tool.run(api)
    api.focus()
  }
  return (
    <div className="gp-md-toolbar" role="toolbar" aria-label="Formatting">
      <div className="gp-md-toolgroup">
        {BLOCK_TOOLS.map((tool) => (
          <button
            key={tool.key}
            type="button"
            title={`${tool.label} (${tool.hint})`}
            aria-label={tool.label}
            disabled={!api}
            onClick={() => run(tool)}
          >
            <tool.icon size={14} aria-hidden />
          </button>
        ))}
      </div>
      <div className="gp-md-toolgroup">
        {INLINE_TOOLS.map((tool) => (
          <button
            key={tool.key}
            type="button"
            title={`${tool.label} (${tool.hint})`}
            aria-label={tool.label}
            disabled={!api}
            onClick={() => run(tool)}
          >
            <tool.icon size={14} aria-hidden />
          </button>
        ))}
      </div>
      <div className="gp-md-toolgroup">
        <button
          type="button"
          title="Undo (⌘Z)"
          aria-label="Undo"
          disabled={!api?.canUndo}
          onClick={() => api?.undo()}
        >
          <Undo2 size={14} aria-hidden />
        </button>
        <button
          type="button"
          title="Redo (⌘⇧Z)"
          aria-label="Redo"
          disabled={!api?.canRedo}
          onClick={() => api?.redo()}
        >
          <Redo2 size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
}

export interface FindState {
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
}

export function FindReplaceBar({
  state,
  onState,
  matches,
  current,
  onStep,
  onReplace,
  onReplaceAll,
  onClose,
}: {
  state: FindState
  onState: (next: FindState) => void
  matches: readonly FindMatch[]
  current: number
  onStep: (direction: 1 | -1) => void
  onReplace: () => void
  onReplaceAll: () => void
  onClose: () => void
}) {
  const total = matches.length
  return (
    <div className="gp-md-find" role="search">
      <div className="gp-md-find-row gp-bare-field">
        <input
          type="text"
          value={state.query}
          autoFocus
          placeholder="Find in this document"
          aria-label="Find"
          onChange={(event) => onState({ ...state, query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onStep(event.shiftKey ? -1 : 1)
          }}
        />
        <span className="gp-md-find-count" aria-live="polite">
          {state.query === '' ? '' : total === 0 ? 'No matches' : `${current + 1} of ${total}`}
        </span>
        <button type="button" aria-label="Previous match" title="Previous (⇧⏎)" disabled={total === 0} onClick={() => onStep(-1)}>
          <ChevronUp size={13} aria-hidden />
        </button>
        <button type="button" aria-label="Next match" title="Next (⏎)" disabled={total === 0} onClick={() => onStep(1)}>
          <ChevronDown size={13} aria-hidden />
        </button>
        <button type="button" aria-label="Close find" title="Close (Esc)" onClick={onClose}>
          <X size={13} aria-hidden />
        </button>
      </div>
      <div className="gp-md-find-row gp-bare-field">
        <input
          type="text"
          value={state.replacement}
          placeholder="Replace with"
          aria-label="Replace with"
          onChange={(event) => onState({ ...state, replacement: event.target.value })}
        />
        <button type="button" disabled={total === 0} onClick={onReplace} className="gp-md-find-action">
          Replace
        </button>
        <button type="button" disabled={total === 0} onClick={onReplaceAll} className="gp-md-find-action">
          All
        </button>
        <label className="gp-md-find-flag">
          <input
            type="checkbox"
            checked={state.caseSensitive}
            onChange={(event) => onState({ ...state, caseSensitive: event.target.checked })}
          />
          Aa
        </label>
        <label className="gp-md-find-flag">
          <input
            type="checkbox"
            checked={state.wholeWord}
            onChange={(event) => onState({ ...state, wholeWord: event.target.checked })}
          />
          Word
        </label>
      </div>
    </div>
  )
}

/**
 * The headings, with the size of the section each one opens.
 *
 * The word count per section is the useful part: it is how you see that the
 * argument section is four hundred words and the conclusion is forty, which is
 * a thing an essay outline should tell you and a plain list of titles cannot.
 */
export function OutlinePanel({
  text,
  onJump,
}: {
  text: string
  onJump: (offset: number) => void
}) {
  const entries = documentOutline(text)
  return (
    <nav className="gp-md-outline" aria-label="Document outline">
      <p className="gp-note-eyebrow">Outline</p>
      {entries.length === 0 ? (
        <p className="gp-md-outline-empty">
          Headings appear here. Start a line with <code>#</code> to make one.
        </p>
      ) : (
        <ol>
          {entries.map((entry, index) => (
            <li key={`${entry.start}-${index}`} data-level={entry.level}>
              <button type="button" onClick={() => onJump(entry.start)}>
                <span className="gp-md-outline-title">{entry.title}</span>
                <span className="gp-md-outline-words">{entry.words}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  )
}

/** Words, characters, sentences, paragraphs, reading time. */
export function StatsPanel({ text, compact = false }: { text: string; compact?: boolean }) {
  const stats = documentStats(text)
  if (compact) {
    return (
      <p className="gp-md-stats-compact">
        {stats.words} {stats.words === 1 ? 'word' : 'words'}
        <span aria-hidden> · </span>
        {stats.readingMinutes} min read
      </p>
    )
  }
  const rows: readonly [string, string][] = [
    ['Words', String(stats.words)],
    ['Characters', String(stats.characters)],
    ['No spaces', String(stats.charactersNoSpaces)],
    ['Sentences', String(stats.sentences)],
    ['Paragraphs', String(stats.paragraphs)],
    ['Reading time', `${stats.readingMinutes} min`],
  ]
  return (
    <div className="gp-md-stats">
      <p className="gp-note-eyebrow">Count</p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * The word goal a draft is working toward.
 *
 * Typewriter's own tool, and only Typewriter's: a goal is for the session
 * where you are trying to reach fifteen hundred words, not for a page of
 * lecture notes or a sticky reminder.
 */
export function GoalPanel({
  words,
  goal,
  onGoal,
}: {
  words: number
  goal: number | null
  onGoal: (next: number | null) => void
}) {
  const progress = goal ? Math.min(1, words / goal) : 0
  return (
    <div className="gp-md-goal">
      <p className="gp-note-eyebrow">
        <Target size={11} aria-hidden /> Goal
      </p>
      {goal !== null && (
        <>
          <div
            className="gp-md-goal-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(words, goal)}
            aria-label={`${words} of ${goal} words`}
          >
            <span style={{ width: `${progress * 100}%` }} data-complete={words >= goal || undefined} />
          </div>
          <p className="gp-md-goal-reading">
            {words >= goal
              ? `${words} words — goal met`
              : `${words} of ${goal} · ${goal - words} to go`}
          </p>
        </>
      )}
      <div className="gp-md-goal-presets">
        {WORD_GOALS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={goal === preset}
            onClick={() => onGoal(goal === preset ? null : preset)}
          >
            {preset >= 1000 ? `${preset / 1000}k` : preset}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The reference list a document's `[@key]` tokens earn.
 *
 * Keys with no source behind them are named rather than dropped: a citation
 * pointing at nothing is exactly what a student needs told before handing the
 * essay in, and a bibliography that quietly omits it hides the problem.
 */
export function BibliographyPanel({
  bibliography,
  hasSources,
}: {
  bibliography: Bibliography
  hasSources: boolean
}) {
  return (
    <div className="gp-md-bibliography">
      <p className="gp-note-eyebrow">References · {bibliography.style}</p>
      {bibliography.entries.length === 0 && bibliography.missing.length === 0 ? (
        <p className="gp-md-outline-empty">
          {hasSources
            ? 'Type [@key] where a source belongs and it is listed here.'
            : 'Add a Citation card to this canvas, then cite it with [@key].'}
        </p>
      ) : (
        <ol>
          {bibliography.entries.map((entry) => (
            <li key={entry.key}>{entry.formatted}</li>
          ))}
        </ol>
      )}
      {bibliography.missing.length > 0 && (
        <p className="gp-md-bibliography-missing">
          No source for {bibliography.missing.map((key) => `[@${key}]`).join(', ')}
        </p>
      )}
    </div>
  )
}

export type ExportChoice = 'markdown' | 'text' | 'word' | 'print'

/** Save the writing out, or send it to a printer — which is how a PDF is made. */
export function ExportRow({ onExport }: { onExport: (choice: ExportChoice) => void }) {
  const options: readonly { key: ExportChoice; label: string; hint: string }[] = [
    { key: 'word', label: 'Word', hint: 'Opens in Word, Pages, or Docs' },
    { key: 'print', label: 'Print / PDF', hint: 'Print, or save as PDF' },
    { key: 'markdown', label: 'Markdown', hint: 'The source, as written' },
    { key: 'text', label: 'Plain text', hint: 'Just the words' },
  ]
  return (
    <div className="gp-md-export">
      <p className="gp-note-eyebrow">Hand in</p>
      <div className="gp-md-export-row">
        {options.map((option) => (
          <button key={option.key} type="button" title={option.hint} onClick={() => onExport(option.key)}>
            {option.key === 'print' ? <Printer size={12} aria-hidden /> : <FileDown size={12} aria-hidden />}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
