import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileClock,
  History,
  Info,
  Lightbulb,
  Maximize2,
  Minimize2,
  Pencil,
  RotateCcw,
  Save,
  Scale,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from 'react'
import { useTransientValue } from '../../../hooks/useTransientValue'
import { useCollaborationStore } from '../../../store/useCollaborationStore'
import type { ModuleData, NotesData } from '../../../types/spatial'
import { localDayKey } from '../../../utils/localDate'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  addDailyLogTimestamp,
  autoTimestampFirstDailyLogEntry,
  noteCalloutTone,
  noteVersionSnapshots,
  noteWordDiff,
  parseNoteMarkdown,
  type NoteCalloutTone,
  type NoteMarkdownBlock,
  type NoteSkinMode,
  type NoteVersionSnapshot,
} from './noteSkinModel'

interface NotesWidgetProps {
  data: NotesData
  onChange: (data: NotesData) => void
  onHeightChange?: (height: number) => void
  widgetId?: string
  skin?: NoteSkinMode
}

interface CalloutTreatment {
  label: string
  icon: LucideIcon
}

const CALLOUT_TREATMENTS: Record<NoteCalloutTone, CalloutTreatment> = {
  info: { label: 'Info', icon: Info },
  tip: { label: 'Tip', icon: Lightbulb },
  warning: { label: 'Warning', icon: AlertTriangle },
  decision: { label: 'Decision', icon: Scale },
  important: { label: 'Important', icon: CheckCircle2 },
}

const CALLOUT_ORDER = Object.keys(CALLOUT_TREATMENTS) as NoteCalloutTone[]

function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
): void {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [ref, value])
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

function lineCount(value: string): number {
  return value ? value.split(/\r\n?|\n/).length : 0
}

function safeLink(raw: string): string | null {
  const value = raw.trim()
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value
  return null
}

function MarkdownInline({ text }: { text: string }) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return tokens.map((token, index): ReactNode => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={index}>{token.slice(1, -1)}</code>
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={index}>{token.slice(2, -2)}</strong>
    }
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = safeLink(link[2] ?? '')
      return href ? (
        <a key={index} href={href} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      ) : <span key={index}>{link[1]}</span>
    }
    return token
  })
}

function MarkdownBlock({ block }: { block: NoteMarkdownBlock }) {
  if (block.kind === 'heading') {
    if (block.level === 1) return <h1><MarkdownInline text={block.text} /></h1>
    if (block.level === 2) return <h2><MarkdownInline text={block.text} /></h2>
    return <h3><MarkdownInline text={block.text} /></h3>
  }
  if (block.kind === 'paragraph') return <p><MarkdownInline text={block.text} /></p>
  if (block.kind === 'quote') return <blockquote><MarkdownInline text={block.text} /></blockquote>
  if (block.kind === 'rule') return <hr />
  if (block.kind === 'code') {
    return (
      <pre data-language={block.language || undefined}>
        <code>{block.code}</code>
      </pre>
    )
  }
  const Tag = block.kind === 'ordered-list' ? 'ol' : 'ul'
  return (
    <Tag>
      {block.items.map((item, index) => (
        <li key={`${index}-${item}`}><MarkdownInline text={item} /></li>
      ))}
    </Tag>
  )
}

function NoteStatus({
  text,
  remoteEditor,
}: {
  text: string
  remoteEditor?: { name: string; color: string }
}) {
  return (
    <footer className="gp-note-status">
      {remoteEditor ? (
        <span className="gp-note-collaborator" style={{ color: remoteEditor.color }}>
          <span aria-hidden style={{ backgroundColor: remoteEditor.color }} />
          {remoteEditor.name} is editing
        </span>
      ) : <span />}
      {/* "18w · 3l" needed a key to read. The count that matters while writing
          is words; the lines are already on the screen being counted. */}
      {text.trim() && (
        <span aria-label={`${wordCount(text)} words, ${lineCount(text)} lines`}>
          {wordCount(text)} {wordCount(text) === 1 ? 'word' : 'words'}
        </span>
      )}
    </footer>
  )
}

function NoteTextarea({
  textareaRef,
  value,
  onChange,
  label,
  placeholder,
  className = '',
  onFocus,
  onBlur,
  onKeyDown,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string, selectionStart: number) => void
  label: string
  placeholder: string
  className?: string
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
}) {
  useAutoGrow(textareaRef, value)
  return (
    <textarea
      ref={textareaRef}
      value={value}
      rows={3}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value, event.target.selectionStart)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`gp-note-editor ${className}`}
    />
  )
}

function formatLogDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'Journal'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parsed)
}

function dailyLogTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function versionLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function NotesWidget({
  data,
  onChange,
  onHeightChange,
  widgetId,
  skin = 'plain',
}: NotesWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [editing, setEditing] = useState(false)
  const remoteEditor = useCollaborationStore((state) =>
    state.participants.find((participant) =>
      participant.clientId !== state.localClientId && participant.editingWidgetId === widgetId,
    ),
  )
  const text = data.text ?? ''

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data, editing, onHeightChange, skin])

  const setText = (nextText: string) => {
    onChange({ ...data, text: nextText, mode: skin })
  }

  const updateSkinState = (
    value: NoteSkinMode,
    next: WidgetSkinState,
  ) => {
    onChange(dataWithSkinState(
      { ...data, mode: skin } as ModuleData,
      value,
      next,
    ) as NotesData)
  }

  if (skin === 'daily_log') {
    const state = skinStateFor(data, skin)
    const date = typeof state.date === 'string' ? state.date : localDayKey()
    const focusAt = (cursor: number) => {
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(cursor, cursor)
      })
    }
    const updateDailyText = (nextText: string, cursor: number) => {
      const next = autoTimestampFirstDailyLogEntry(text, nextText, dailyLogTime())
      setText(next.text)
      if (next.cursorOffset > 0) focusAt(cursor + next.cursorOffset)
    }
    const startNextEntry: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
      event.preventDefault()
      const next = addDailyLogTimestamp(
        text,
        event.currentTarget.selectionStart,
        event.currentTarget.selectionEnd,
        dailyLogTime(),
      )
      setText(next.text)
      focusAt(next.cursor)
    }
    return (
      <div ref={rootRef} className="gp-note-skin gp-note-daily" data-note-skin={skin}>
        <header className="gp-note-daily-header">
          {/* The date itself is the picker: the native control sits invisibly
              over its own label, so the affordance is the thing you read
              instead of an 18px sliver of browser chrome beside it. */}
          <span className="gp-note-daily-date">
            <Clock3 size={13} aria-hidden />
            <strong>{formatLogDate(date)}</strong>
            <input
              type="date"
              value={date}
              aria-label="Journal date"
              onChange={(event) => updateSkinState(skin, { ...state, date: event.target.value })}
            />
          </span>
          <span className="gp-note-daily-hint">Enter adds time</span>
        </header>
        <div className="gp-note-daily-body gp-bare-field">
          <span aria-hidden className="gp-note-daily-rail" />
          <NoteTextarea
            textareaRef={textareaRef}
            value={text}
            onChange={updateDailyText}
            onKeyDown={startNextEntry}
            label="Daily log"
            placeholder="What happened today? Shift+Enter for a plain line break."
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
          />
        </div>
        <NoteStatus text={text} remoteEditor={remoteEditor} />
      </div>
    )
  }

  if (skin === 'markdown_page') {
    const state = skinStateFor(data, skin)
    const storedView = state.view === 'edit' || state.view === 'preview' ? state.view : null
    const view = storedView ?? (text.trim() ? 'preview' : 'edit')
    const blocks = parseNoteMarkdown(text)
    return (
      <div ref={rootRef} className="gp-note-skin gp-note-markdown gp-bare-field" data-note-skin={skin}>
        <header className="gp-note-toolbar">
          <span className="gp-note-eyebrow"><BookOpen size={12} aria-hidden /> Markdown</span>
          <span className="gp-note-segmented" aria-label="Markdown view">
            <button
              type="button"
              aria-pressed={view === 'edit'}
              onClick={() => updateSkinState(skin, { ...state, view: 'edit' })}
            >
              <Pencil size={10} aria-hidden /> Edit
            </button>
            <button
              type="button"
              aria-pressed={view === 'preview'}
              disabled={!text.trim()}
              onClick={() => updateSkinState(skin, { ...state, view: 'preview' })}
            >
              <Eye size={10} aria-hidden /> Read
            </button>
          </span>
        </header>
        {view === 'edit' ? (
          <NoteTextarea
            textareaRef={textareaRef}
            value={text}
            onChange={setText}
            label="Markdown note"
            placeholder={'# A clear heading\n\nStart writing in Markdown…'}
            className="gp-note-markdown-source"
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <article className="gp-note-markdown-preview">
            {blocks.map((block, index) => <MarkdownBlock key={index} block={block} />)}
          </article>
        )}
        <NoteStatus text={text} remoteEditor={remoteEditor} />
      </div>
    )
  }

  if (skin === 'typewriter') {
    const state = skinStateFor(data, skin)
    const focusMode = state.focusMode === true
    return (
      <div
        ref={rootRef}
        className="gp-note-skin gp-note-typewriter"
        data-note-skin={skin}
        data-focus-mode={focusMode || undefined}
      >
        <header className="gp-note-toolbar">
          <span className="gp-note-eyebrow">Draft · {wordCount(text)} words</span>
          <button
            type="button"
            className="gp-note-focus-toggle"
            aria-pressed={focusMode}
            onClick={() => updateSkinState(skin, { ...state, focusMode: !focusMode })}
          >
            {focusMode ? <Minimize2 size={11} aria-hidden /> : <Maximize2 size={11} aria-hidden />}
            {focusMode ? 'Ease focus' : 'Focus'}
          </button>
        </header>
        <div className="gp-note-typewriter-paper gp-bare-field">
          <NoteTextarea
            textareaRef={textareaRef}
            value={text}
            onChange={setText}
            label="Typewriter note"
            placeholder="Begin the first sentence…"
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
          />
        </div>
        <NoteStatus text={text} remoteEditor={remoteEditor} />
      </div>
    )
  }

  if (skin === 'callout') {
    const state = skinStateFor(data, skin)
    const tone = noteCalloutTone(state.tone)
    const treatment = CALLOUT_TREATMENTS[tone]
    const ToneIcon = treatment.icon
    return (
      <div
        ref={rootRef}
        className="gp-note-skin gp-note-callout gp-bare-field"
        data-note-skin={skin}
        data-callout-tone={tone}
      >
        <header className="gp-note-callout-header">
          <span className="gp-note-callout-title">
            <ToneIcon size={14} aria-hidden />
            {treatment.label}
          </span>
          <span className="gp-note-callout-tones" aria-label="Callout type">
            {CALLOUT_ORDER.map((value) => {
              const option = CALLOUT_TREATMENTS[value]
              const OptionIcon = option.icon
              return (
                <button
                  key={value}
                  type="button"
                  title={option.label}
                  aria-label={`${option.label} callout`}
                  aria-pressed={tone === value}
                  onClick={() => updateSkinState(skin, { ...state, tone: value })}
                >
                  <OptionIcon size={10} aria-hidden />
                </button>
              )
            })}
          </span>
        </header>
        <NoteTextarea
          textareaRef={textareaRef}
          value={text}
          onChange={setText}
          label={`${treatment.label} callout`}
          placeholder={
            tone === 'decision'
              ? 'Record the decision and why it matters…'
              : tone === 'warning'
                ? 'Describe what needs attention…'
                : 'Write the essential point…'
          }
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
        />
        <NoteStatus text={text} remoteEditor={remoteEditor} />
      </div>
    )
  }

  if (skin === 'versioned_note') {
    return (
      <VersionedNote
        rootRef={rootRef}
        textareaRef={textareaRef}
        data={data}
        text={text}
        remoteEditor={remoteEditor}
        setText={setText}
        updateState={(next) => updateSkinState(skin, next)}
        setEditing={setEditing}
      />
    )
  }

  return (
    <div ref={rootRef} className="gp-note-skin gp-note-plain gp-bare-field" data-note-skin="plain">
      <NoteTextarea
        textareaRef={textareaRef}
        value={text}
        onChange={setText}
        label="Note"
        placeholder="Start writing…"
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
      />
      <NoteStatus text={text} remoteEditor={remoteEditor} />
    </div>
  )
}

function VersionedNote({
  rootRef,
  textareaRef,
  data,
  text,
  remoteEditor,
  setText,
  updateState,
  setEditing,
}: {
  rootRef: RefObject<HTMLDivElement | null>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  data: NotesData
  text: string
  remoteEditor?: { name: string; color: string }
  setText: (value: string) => void
  updateState: (state: WidgetSkinState) => void
  setEditing: (value: boolean) => void
}) {
  const state = skinStateFor(data, 'versioned_note')
  const snapshots = useMemo(() => noteVersionSnapshots(state.snapshots), [state.snapshots])
  const [selectedId, setSelectedId] = useState<string | null>(snapshots[0]?.id ?? null)
  const [saved, showSaved] = useTransientValue(false)

  useEffect(() => {
    if (selectedId && snapshots.some((snapshot) => snapshot.id === selectedId)) return
    setSelectedId(snapshots[0]?.id ?? null)
  }, [selectedId, snapshots])

  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? snapshots[0]
  const diff = selected ? noteWordDiff(text, selected.text) : null
  const commitSnapshots = (next: NoteVersionSnapshot[]) => {
    updateState({ ...state, snapshots: next.slice(0, 20) })
  }
  const saveVersion = () => {
    if (!text.trim()) return
    const now = new Date()
    const snapshot: NoteVersionSnapshot = {
      id: crypto.randomUUID(),
      label: versionLabel(now),
      text,
      createdAt: now.toISOString(),
    }
    commitSnapshots([snapshot, ...snapshots])
    setSelectedId(snapshot.id)
    showSaved(true, 1000)
  }

  return (
    <div ref={rootRef} className="gp-note-skin gp-note-versioned gp-bare-field" data-note-skin="versioned_note">
      <header className="gp-note-toolbar">
        {/* "Version history" beside a "Save version" button truncated to
            "Version histoi" on any card narrower than about 260px. One word
            says the same thing and survives every width. */}
        <span className="gp-note-eyebrow"><History size={12} aria-hidden /> Versions</span>
        <button
          type="button"
          className="gp-note-save-version"
          disabled={!text.trim() || snapshots[0]?.text === text}
          onClick={saveVersion}
        >
          {saved ? <Check size={11} aria-hidden /> : <Save size={11} aria-hidden />}
          {saved ? 'Saved' : 'Save version'}
        </button>
      </header>
      <NoteTextarea
        textareaRef={textareaRef}
        value={text}
        onChange={setText}
        label="Versioned note"
        placeholder="Write something worth revisiting…"
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
      />
      {snapshots.length > 0 ? (
        <section className="gp-note-history" aria-label="Saved versions">
          <div className="gp-note-history-rail">
            {snapshots.map((snapshot) => (
              <button
                key={snapshot.id}
                type="button"
                className="gp-note-history-row"
                aria-pressed={snapshot.id === selected?.id}
                onClick={() => setSelectedId(snapshot.id)}
              >
                <FileClock size={10} aria-hidden />
                <span className="gp-note-history-label">{snapshot.label}</span>
                <span className="gp-note-history-preview">
                  {snapshot.text.trim() || 'Empty snapshot'}
                </span>
              </button>
            ))}
          </div>
          {selected && diff && (
            <div className="gp-note-history-detail">
              <div>
                <strong>{selected.label}</strong>
                <span>
                  <span className="gp-note-diff-added">+{diff.added}</span>
                  <span className="gp-note-diff-removed">−{diff.removed}</span>
                  <span>{diff.unchanged} unchanged</span>
                </span>
              </div>
              <p>{selected.text || 'Empty snapshot'}</p>
              <div>
                <button type="button" onClick={() => setText(selected.text)}>
                  <RotateCcw size={10} aria-hidden /> Restore
                </button>
                <button
                  type="button"
                  aria-label={`Delete version ${selected.label}`}
                  onClick={() => commitSnapshots(snapshots.filter((item) => item.id !== selected.id))}
                >
                  <Trash2 size={10} aria-hidden /> Delete
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="gp-note-history-empty">
          Save a version to compare changes or restore an earlier draft.
        </p>
      )}
      <NoteStatus text={text} remoteEditor={remoteEditor} />
    </div>
  )
}
