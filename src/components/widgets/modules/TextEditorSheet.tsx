import { Search, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DialogShell } from '../../ui/DialogShell'
import { useWidgetStore } from '../../../store/useWidgetStore'
import { useToastStore } from '../../../store/useToastStore'
import type { CitationData } from '../../../types/spatial'
import type { SheetOrigin } from '../../../utils/widgetSheet'
import { downloadDocument, printDocument } from '../../../utils/documentExport'
import {
  buildBibliography,
  citationKeyFor,
  documentStats,
  findMatches,
  nextMatchFrom,
  replaceAll,
  replaceMatch,
  type CitationEntry,
  type CitationStyleName,
} from './textDocumentAnalysis'
import {
  BibliographyPanel,
  ExportRow,
  FindReplaceBar,
  FormattingToolbar,
  GoalPanel,
  OutlinePanel,
  StatsPanel,
  type ExportChoice,
  type FindState,
} from './TextEditorChrome'
import { TextEditorSurface, type EditorCommandApi } from './TextEditorSurface'
import type { TextSkinCapabilities } from './textSkinCapabilities'
import type { TextSkinMode } from './textSkinModel'

/**
 * The full-screen writing view.
 *
 * Nobody writes fifteen hundred words in a card on a board — the card grows
 * down the canvas while the rest of the board sits around it. This is the room
 * to write in: the same string, the same editor surface, given a page.
 *
 * It is a sheet rather than a mode. The canvas keeps its own state underneath,
 * Escape returns to exactly where the board was, and nothing about the card is
 * changed by opening it.
 */

/** What each skin calls itself in the sheet's eyebrow. */
const SKIN_NAMES: Record<TextSkinMode, string> = {
  plain: 'Document',
  sticky: 'Note',
  typewriter: 'Draft',
}

/**
 * Every source on this canvas a `[@key]` can point at.
 *
 * Read from the Citation cards already on the board rather than from a store
 * of its own: the card is where a student collects sources, and asking them to
 * keep a second list inside the essay would guarantee the two disagree.
 */
function useCanvasCitations(): { sources: CitationEntry[]; style: CitationStyleName; hasCards: boolean } {
  const widgets = useWidgetStore((state) => state.widgets)
  const canvasId = useWidgetStore((state) => state.activeCanvasId)
  return useMemo(() => {
    const cards = Object.values(widgets).filter(
      (widget) => widget.type === 'citation' && widget.canvasId === canvasId,
    )
    const sources: CitationEntry[] = []
    for (const card of cards) {
      const data = card.data as CitationData
      for (const source of data.sources ?? []) {
        sources.push({
          key: citationKeyFor(source),
          author: source.author,
          year: source.year,
          title: source.title,
        })
      }
    }
    const style = (cards[0]?.data as CitationData | undefined)?.style ?? 'APA'
    return { sources, style, hasCards: cards.length > 0 }
  }, [widgets, canvasId])
}

const EMPTY_FIND: FindState = { query: '', replacement: '', caseSensitive: false, wholeWord: false }

/**
 * Where the sheet grows FROM, as a transform origin.
 *
 * The card's own centre, expressed in the sheet's coordinates, so the view
 * appears to come out of the card that was clicked rather than out of nowhere.
 * Percentages, not pixels: the sheet is centred in the viewport, so a ratio
 * survives the resize that a pixel offset would not.
 */
function growthOrigin(origin: SheetOrigin | null): React.CSSProperties {
  if (!origin) return {}
  const x = ((origin.left + origin.width / 2) / window.innerWidth) * 100
  const y = ((origin.top + origin.height / 2) / window.innerHeight) * 100
  return { transformOrigin: `${x.toFixed(2)}% ${y.toFixed(2)}%` }
}

interface TextEditorSheetProps {
  open: boolean
  onClose: () => void
  title: string
  skin: TextSkinMode
  capabilities: TextSkinCapabilities
  /** The card's on-screen rectangle, so the sheet grows out of it. */
  origin?: SheetOrigin | null
  /** The card's accent, carried across the portal boundary. */
  accent?: string
  value: string
  onChange: (next: string) => void
  focusMode?: boolean
  goal?: number | null
  onGoal?: (next: number | null) => void
}

export function TextEditorSheet({
  open,
  onClose,
  title,
  skin,
  capabilities,
  origin = null,
  accent,
  value,
  onChange,
  focusMode = false,
  goal = null,
  onGoal,
}: TextEditorSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState<EditorCommandApi | null>(null)
  const [find, setFind] = useState<FindState>(EMPTY_FIND)
  const [findOpen, setFindOpen] = useState(false)
  const [current, setCurrent] = useState(0)
  const caretRef = useRef(0)
  const { sources, style, hasCards } = useCanvasCitations()

  const matches = useMemo(
    () =>
      findOpen
        ? findMatches(value, find.query, {
            caseSensitive: find.caseSensitive,
            wholeWord: find.wholeWord,
          })
        : [],
    [findOpen, value, find.query, find.caseSensitive, find.wholeWord],
  )

  const bibliography = useMemo(
    () => buildBibliography(value, sources, style),
    [value, sources, style],
  )
  const stats = useMemo(() => documentStats(value), [value])

  // Stable by necessity, not by taste: this is handed to the editor surface,
  // which builds its command object from its props — an arrow rebuilt on every
  // render would give that object a new identity every time and loop.
  const rememberCaret = useCallback((offset: number) => {
    caretRef.current = offset
  }, [])

  // A search starts from where the caret already is rather than from the top
  // of the document — jumping to the first match on page one when you are
  // working on page four is the classic wrong answer here.
  useEffect(() => {
    if (!findOpen) return
    setCurrent(Math.max(0, nextMatchFrom(matches, caretRef.current, 1)))
    // Only when the query or its flags change: re-running on every keystroke
    // in the document would drag the selection around while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen, find.query, find.caseSensitive, find.wholeWord])

  const step = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return
      const next = (current + direction + matches.length) % matches.length
      setCurrent(next)
      const match = matches[next]
      if (match) api?.goTo(match.start)
    },
    [api, current, matches],
  )

  const handleReplace = useCallback(() => {
    const match = matches[current]
    if (!match) return
    onChange(replaceMatch(value, match, find.replacement))
    setCurrent(0)
  }, [current, find.replacement, matches, onChange, value])

  const handleReplaceAll = useCallback(() => {
    const count = matches.length
    onChange(
      replaceAll(value, find.query, find.replacement, {
        caseSensitive: find.caseSensitive,
        wholeWord: find.wholeWord,
      }),
    )
    setCurrent(0)
    useToastStore
      .getState()
      .addToast(`Replaced ${count} ${count === 1 ? 'match' : 'matches'}`)
  }, [find, matches.length, onChange, value])

  const handleExport = useCallback(
    (choice: ExportChoice) => {
      const options = { title, sources, style, doubleSpaced: true }
      if (choice === 'print') {
        printDocument(value, options)
        return
      }
      downloadDocument(choice, value, options)
      useToastStore.getState().addToast(`Saved ${title || 'the document'}`)
    },
    [sources, style, title, value],
  )

  if (!open) return null

  const showRail =
    capabilities.outline || capabilities.statistics || capabilities.writingGoal ||
    capabilities.citations || capabilities.export

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      labelledBy="gp-text-sheet-title"
      panelRef={panelRef}
      wrapperClassName="gp-md-stage fixed inset-0 z-[300] flex items-center justify-center"
      scrimClassName="gp-md-scrim"
      escape={!findOpen}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="gp-md-sheet gp-widget-ui gp-note-skin"
        data-note-skin={skin}
        style={{
          ...growthOrigin(origin),
          ...(accent ? ({ '--gp-widget-accent': accent } as React.CSSProperties) : {}),
        }}
        onKeyDown={(event) => {
          const modifier = event.metaKey || event.ctrlKey
          if (modifier && event.key.toLowerCase() === 'f' && capabilities.findReplace) {
            event.preventDefault()
            setFindOpen(true)
            return
          }
          if (event.key === 'Escape' && findOpen) {
            event.preventDefault()
            event.stopPropagation()
            setFindOpen(false)
            setFind(EMPTY_FIND)
            api?.focus()
          }
        }}
      >
        <header className="gp-md-sheet-head">
          <div className="gp-md-sheet-name">
            <p className="gp-md-sheet-eyebrow">{SKIN_NAMES[skin] ?? 'Document'}</p>
            <h2 id="gp-text-sheet-title" className="gp-md-sheet-title">
              {title || 'Untitled'}
            </h2>
          </div>
          <p className="gp-md-sheet-count">
            <strong>{stats.words}</strong> {stats.words === 1 ? 'word' : 'words'}
          </p>
          {capabilities.findReplace && (
            <button
              type="button"
              className="gp-md-sheet-action"
              aria-label="Find and replace"
              title="Find and replace (⌘F)"
              aria-pressed={findOpen}
              onClick={() => setFindOpen((wasOpen) => !wasOpen)}
            >
              <Search size={15} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="gp-md-sheet-action gp-md-sheet-close"
            aria-label="Close writing view"
            title="Close (Esc)"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        {capabilities.formattingToolbar && <FormattingToolbar api={api} />}

        {findOpen && capabilities.findReplace && (
          <FindReplaceBar
            state={find}
            onState={setFind}
            matches={matches}
            current={current}
            onStep={step}
            onReplace={handleReplace}
            onReplaceAll={handleReplaceAll}
            onClose={() => {
              setFindOpen(false)
              setFind(EMPTY_FIND)
              api?.focus()
            }}
          />
        )}

        <div className="gp-md-sheet-body">
          <div
            className="gp-md-sheet-page"
            data-typewriter-scroller=""
            data-tail={capabilities.typewriterScroll || undefined}
          >
            <div className="gp-md-sheet-measure" data-note-skin={skin}>
              <TextEditorSurface
                value={value}
                onChange={onChange}
                label={`${title || 'Note'} — writing view`}
                placeholder="Start writing…"
                className="gp-md-sheet-surface"
                markdown={capabilities.liveMarkdown}
                focusMode={focusMode && capabilities.focusMode}
                typewriterScroll={capabilities.typewriterScroll}
                checkboxes={capabilities.checkboxes}
                matches={matches}
                currentMatch={current}
                autoFocus
                rows={12}
                onReady={setApi}
                onCaretChange={rememberCaret}
              />
            </div>
          </div>

          {showRail && (
            <aside className="gp-md-sheet-rail">
              {capabilities.writingGoal && onGoal && (
                <GoalPanel words={stats.words} goal={goal} onGoal={onGoal} />
              )}
              {capabilities.outline && (
                <OutlinePanel
                  text={value}
                  onJump={(offset) => {
                    api?.goTo(offset)
                  }}
                />
              )}
              {capabilities.statistics && <StatsPanel text={value} />}
              {capabilities.citations && (
                <BibliographyPanel bibliography={bibliography} hasSources={hasCards} />
              )}
              {capabilities.export && <ExportRow onExport={handleExport} />}
            </aside>
          )}
        </div>
      </div>
    </DialogShell>
  )
}
