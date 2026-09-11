import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import {
  INLINE_MARKERS,
  continueBlock,
  duplicateLines,
  deleteLines,
  insertLink,
  lineRange,
  moveLines,
  readDocument,
  shiftIndent,
  toggleBlock,
  toggleInline,
  toggleTodoAt,
  type BlockCommand,
  type EditorSelection,
} from './textEditorModel'
import {
  EMPTY_HISTORY,
  recordEdit,
  shouldCoalesce,
  stepBack,
  stepForward,
  type HistoryState,
} from './textEditorHistory'
import { TextMarkdownLayer, TextMatchLayer } from './TextMarkdownLayer'
import type { FindMatch } from './textDocumentAnalysis'

/**
 * The writing surface every Text skin is built on.
 *
 * One textarea, one paint layer behind it, and the keyboard map that turns
 * both into an editor: ⌘B, Enter continuing a list, Tab indenting, ⌥↑ moving a
 * line, ⌘Z undoing a whole command rather than one character of it.
 *
 * The keyboard map is shared by every skin ON PURPOSE — a sticky note whose
 * Enter refused to continue a list would simply be broken. What each skin
 * chooses is which of the surrounding tools it shows (see
 * `textSkinCapabilities`), never whether markdown works.
 */

export interface EditorCommandApi {
  inline: (marker: string) => void
  block: (command: BlockCommand) => void
  link: () => void
  undo: () => void
  redo: () => void
  focus: () => void
  /** Put the caret at `offset` and scroll it into view. */
  goTo: (offset: number) => void
  canUndo: boolean
  canRedo: boolean
}

interface TextEditorSurfaceProps {
  value: string
  onChange: (next: string) => void
  label: string
  placeholder: string
  className?: string
  /** Class for the text control itself, when a skin styles its own. */
  editorClassName?: string
  /** Somebody else is in this card right now. */
  collaborating?: boolean
  /** Paint markdown behind the caret. Off means a bare textarea. */
  markdown?: boolean
  /** Dim every line but the one being written. */
  focusMode?: boolean
  /** Keep the caret line vertically centred in its scroller. */
  typewriterScroll?: boolean
  /** Clicking a `- [ ]` marker flips it. */
  checkboxes?: boolean
  matches?: readonly FindMatch[]
  currentMatch?: number
  autoFocus?: boolean
  rows?: number
  onFocus?: () => void
  onBlur?: () => void
  onCaretChange?: (offset: number) => void
  /** Handed the command surface so a toolbar outside can drive this editor. */
  onReady?: (api: EditorCommandApi) => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

/** Grow the control to its content — a note has no scrollbar of its own. */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [ref, value])
}

export function TextEditorSurface({
  value,
  onChange,
  label,
  placeholder,
  className = '',
  editorClassName = 'gp-note-editor',
  collaborating = false,
  markdown = true,
  focusMode = false,
  typewriterScroll = false,
  checkboxes = false,
  matches,
  currentMatch = 0,
  autoFocus = false,
  rows = 3,
  onFocus,
  onBlur,
  onCaretChange,
  onReady,
  textareaRef,
}: TextEditorSurfaceProps) {
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const areaRef = textareaRef ?? ownRef
  const rootRef = useRef<HTMLDivElement>(null)
  const [caret, setCaret] = useState<number | null>(null)
  const historyRef = useRef<HistoryState>(EMPTY_HISTORY)
  const lastEditRef = useRef(0)
  const composingRef = useRef(false)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  /**
   * Whether there is anything to undo or redo. Kept as state rather than read
   * from the ref during render, because it is the ONLY thing about the history
   * a toolbar outside this component can see — and the only reason the command
   * surface below ever has to change identity.
   */
  const [reach, setReach] = useState({ canUndo: false, canRedo: false })

  /** Publish the stack's reach, and only when it actually moved. */
  const syncReach = useCallback(() => {
    const canUndo = historyRef.current.past.length > 0
    const canRedo = historyRef.current.future.length > 0
    setReach((previous) =>
      previous.canUndo === canUndo && previous.canRedo === canRedo
        ? previous
        : { canUndo, canRedo },
    )
  }, [])

  useAutoGrow(areaRef, value)

  const currentSelection = useCallback((): EditorSelection => {
    const element = areaRef.current
    return {
      text: value,
      start: element?.selectionStart ?? value.length,
      end: element?.selectionEnd ?? value.length,
    }
  }, [areaRef, value])

  /** Apply a command's result: new text now, caret restored after the render. */
  const commit = useCallback(
    (next: EditorSelection, options: { coalesce?: boolean } = {}) => {
      const before = currentSelection()
      historyRef.current = recordEdit(
        historyRef.current,
        { text: before.text, start: before.start, end: before.end },
        options.coalesce ?? false,
      )
      lastEditRef.current = performance.now()
      pendingSelectionRef.current = { start: next.start, end: next.end }
      syncReach()
      onChange(next.text)
    },
    [currentSelection, onChange, syncReach],
  )

  // A command rewrites the whole value, so the browser drops the caret at the
  // end. Putting it back has to wait for the new value to be painted.
  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current
    const element = areaRef.current
    if (!pending || !element) return
    pendingSelectionRef.current = null
    element.setSelectionRange(pending.start, pending.end)
    setCaret(pending.start)
    onCaretChange?.(pending.start)
  }, [value, areaRef, onCaretChange])

  const restore = useCallback(
    (direction: 'back' | 'forward') => {
      const before = currentSelection()
      const snapshot = { text: before.text, start: before.start, end: before.end }
      const step = direction === 'back'
        ? stepBack(historyRef.current, snapshot)
        : stepForward(historyRef.current, snapshot)
      if (!step) return
      historyRef.current = step.state
      pendingSelectionRef.current = { start: step.restored.start, end: step.restored.end }
      syncReach()
      onChange(step.restored.text)
    },
    [currentSelection, onChange, syncReach],
  )

  const runInline = useCallback(
    (marker: string) => commit(toggleInline(currentSelection(), marker)),
    [commit, currentSelection],
  )
  const runBlock = useCallback(
    (command: BlockCommand) => commit(toggleBlock(currentSelection(), command)),
    [commit, currentSelection],
  )

  const goTo = useCallback(
    (offset: number) => {
      const element = areaRef.current
      if (!element) return
      element.focus()
      element.setSelectionRange(offset, offset)
      setCaret(offset)
      onCaretChange?.(offset)
    },
    [areaRef, onCaretChange],
  )

  /**
   * The commands, for a toolbar or a panel outside this component.
   *
   * Held behind a ref rather than rebuilt from the live callbacks, and that is
   * not a micro-optimisation: the parent stores this object in state, so an
   * object with a new identity on every render is an infinite render loop —
   * `onReady` sets state, the re-render builds another object, and around it
   * goes. The identity may only change when something the caller can SEE
   * changes, which is the undo/redo reach and nothing else.
   */
  const liveRef = useRef({ runInline, runBlock, commit, currentSelection, restore, goTo })
  liveRef.current = { runInline, runBlock, commit, currentSelection, restore, goTo }

  const api = useMemo<EditorCommandApi>(
    () => ({
      inline: (marker) => liveRef.current.runInline(marker),
      block: (command) => liveRef.current.runBlock(command),
      link: () => liveRef.current.commit(insertLink(liveRef.current.currentSelection())),
      undo: () => liveRef.current.restore('back'),
      redo: () => liveRef.current.restore('forward'),
      focus: () => areaRef.current?.focus(),
      goTo: (offset) => liveRef.current.goTo(offset),
      canUndo: reach.canUndo,
      canRedo: reach.canRedo,
    }),
    [areaRef, reach.canUndo, reach.canRedo],
  )

  useEffect(() => {
    onReady?.(api)
  }, [onReady, api])

  useEffect(() => {
    if (!autoFocus) return
    const element = areaRef.current
    if (!element) return
    element.focus()
    element.setSelectionRange(value.length, value.length)
    setCaret(value.length)
    // Only on mount: re-running would yank the caret back to the end mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

  /**
   * Keep the line being written in the middle of its scroller.
   *
   * The paint layer mirrors the textarea character for character, so the
   * active line's own box IS the caret's line box — no measuring, no hidden
   * clone, and it stays correct when the text wraps.
   */
  useLayoutEffect(() => {
    if (!typewriterScroll || caret === null) return
    const line = rootRef.current?.querySelector<HTMLElement>('.gp-md-line[data-active]')
    const scroller = rootRef.current?.closest<HTMLElement>('[data-typewriter-scroller]')
    if (!line || !scroller) return
    const target =
      line.offsetTop + line.offsetHeight / 2 - scroller.clientHeight / 2 + (rootRef.current?.offsetTop ?? 0)
    scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [caret, typewriterScroll, value])

  const trackCaret = useCallback(() => {
    const element = areaRef.current
    if (!element) return
    setCaret(element.selectionStart)
    onCaretChange?.(element.selectionStart)
  }, [areaRef, onCaretChange])

  /**
   * A click that lands on a `- [ ]` marker flips it.
   *
   * Read from where the browser put the caret rather than by hit-testing the
   * paint layer: the textarea is on top and owns the pointer, and asking the
   * document which character sits under a point does not work inside a
   * textarea in every engine we ship on.
   */
  const handleClick = useCallback(() => {
    const element = areaRef.current
    if (!element) return
    trackCaret()
    if (!checkboxes) return
    const offset = element.selectionStart
    const { from, to } = lineRange(value, offset, offset)
    const line = readDocument(value.slice(from, to))[0]
    if (!line || line.kind !== 'todo') return
    if (offset > from + line.marker.length) return
    const next = toggleTodoAt(value, offset)
    if (next === value) return
    commit({ text: next, start: offset, end: offset })
  }, [areaRef, checkboxes, commit, trackCaret, value])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (composingRef.current) return
      const modifier = event.metaKey || event.ctrlKey
      const selection = currentSelection()

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        // The canvas already stands aside while a text field has focus, so
        // this is the document's own undo rather than the board's.
        restore(event.shiftKey ? 'forward' : 'back')
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        commit(shiftIndent(selection, event.shiftKey ? -1 : 1))
        return
      }

      if (event.key === 'Enter' && !modifier && !event.shiftKey) {
        const continued = continueBlock(selection)
        if (continued) {
          event.preventDefault()
          commit(continued)
        }
        return
      }

      if (event.altKey && !modifier && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        commit(moveLines(selection, event.key === 'ArrowUp' ? -1 : 1))
        return
      }

      if (modifier && event.shiftKey) {
        const key = event.key.toLowerCase()
        if (key === 'd') {
          event.preventDefault()
          commit(duplicateLines(selection))
          return
        }
        if (key === 'k') {
          event.preventDefault()
          commit(deleteLines(selection))
          return
        }
        if (key === 'h') {
          event.preventDefault()
          runInline(INLINE_MARKERS.highlight)
          return
        }
        if (key === 'x') {
          event.preventDefault()
          runInline(INLINE_MARKERS.strike)
          return
        }
        // Google Docs' list shortcuts, which is where students will have met
        // them: 7 numbered, 8 bulleted, 9 checklist.
        if (event.key === '&' || key === '7') {
          event.preventDefault()
          runBlock('ordered')
          return
        }
        if (event.key === '*' || key === '8') {
          event.preventDefault()
          runBlock('bullet')
          return
        }
        if (event.key === '(' || key === '9') {
          event.preventDefault()
          runBlock('todo')
          return
        }
        if (event.key === '>' || key === '.') {
          event.preventDefault()
          runBlock('quote')
          return
        }
      }

      if (modifier && event.altKey) {
        const level = event.code
        if (level === 'Digit1' || level === 'Digit2' || level === 'Digit3') {
          event.preventDefault()
          runBlock((`h${level.slice(-1)}`) as BlockCommand)
          return
        }
      }

      if (modifier && !event.altKey && !event.shiftKey) {
        const key = event.key.toLowerCase()
        if (key === 'b') {
          event.preventDefault()
          runInline(INLINE_MARKERS.bold)
          return
        }
        if (key === 'i') {
          event.preventDefault()
          runInline(INLINE_MARKERS.italic)
          return
        }
        if (key === 'e') {
          event.preventDefault()
          runInline(INLINE_MARKERS.code)
          return
        }
        if (key === 'k') {
          event.preventDefault()
          commit(insertLink(selection))
          return
        }
      }
    },
    [commit, currentSelection, restore, runBlock, runInline],
  )

  const handleChange = useCallback(
    (next: string, start: number) => {
      const before = currentSelection()
      const elapsed = performance.now() - lastEditRef.current
      historyRef.current = recordEdit(
        historyRef.current,
        { text: before.text, start: before.start, end: before.end },
        composingRef.current || shouldCoalesce(before.text, next, elapsed),
      )
      lastEditRef.current = performance.now()
      syncReach()
      setCaret(start)
      onCaretChange?.(start)
      onChange(next)
    },
    [currentSelection, onChange, onCaretChange, syncReach],
  )

  return (
    <div
      ref={rootRef}
      className={`gp-md-field gp-bare-field ${className}`}
      data-focus-mode={focusMode || undefined}
      data-painted={markdown || undefined}
    >
      {/* Search hits first, so the formatting paints OVER them: the highlight
          is a background behind the writing, not a second copy of it. */}
      {matches && matches.length > 0 && (
        <TextMatchLayer text={value} matches={matches} current={currentMatch} />
      )}
      {markdown && <TextMarkdownLayer text={value} caret={caret} />}
      <textarea
        ref={areaRef}
        value={value}
        rows={rows}
        spellCheck
        aria-label={label}
        placeholder={placeholder}
        className={editorClassName}
        data-collaboration-editing={collaborating || undefined}
        onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
        onKeyDown={handleKeyDown}
        onKeyUp={trackCaret}
        onClick={handleClick}
        onSelect={trackCaret}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={() => {
          composingRef.current = false
        }}
        onFocus={() => {
          trackCaret()
          onFocus?.()
        }}
        onBlur={() => {
          setCaret(null)
          onBlur?.()
        }}
      />
    </div>
  )
}
