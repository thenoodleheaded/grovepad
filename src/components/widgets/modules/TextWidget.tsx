import { Bold, Highlighter, Italic, ListChecks, Maximize2, Minimize2, Target } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCollaborationStore } from '../../../store/useCollaborationStore'
import type { ModuleData, TextData } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { documentStats } from './textDocumentAnalysis'
import { INLINE_MARKERS } from './textEditorModel'
import { TextEditorSurface, type EditorCommandApi } from './TextEditorSurface'
import { capabilitiesFor, writingGoalOf } from './textSkinCapabilities'
import type { TextSkinMode } from './textSkinModel'

interface TextWidgetProps {
  data: TextData
  onChange: (data: TextData) => void
  onHeightChange?: (height: number) => void
  widgetId?: string
  skin?: TextSkinMode
}

/**
 * A note's footer says who else is in it, and nothing else. The word count
 * that used to live here was measuring the writing rather than showing it —
 * the words are already on the screen being counted. The count belongs in the
 * writing view, where it is a tool rather than decoration.
 */
function NoteStatus({ remoteEditor }: { remoteEditor?: { name: string; color: string } }) {
  if (!remoteEditor) return null
  return (
    <footer className="gp-note-status">
      <span className="gp-note-collaborator" style={{ color: remoteEditor.color }}>
        <span aria-hidden style={{ backgroundColor: remoteEditor.color }} />
        {remoteEditor.name} is editing
      </span>
    </footer>
  )
}

/**
 * The formatting a card can carry without becoming a toolbar with a note
 * attached: the four marks people reach for, and the way into the full view.
 *
 * It floats over the writing and only appears once the card is being used, so
 * a resting Text card is still nothing but its words — which is also what
 * lets `TextRestPage` stay an honest photograph of this one.
 */
function CardChrome({ api, words }: { api: EditorCommandApi | null; words: number }) {
  const run = (action: (api: EditorCommandApi) => void) => {
    if (!api) return
    action(api)
    api.focus()
  }
  return (
    <div className="gp-note-chrome" data-widget-interactive="true">
      <span className="gp-note-chrome-count">{words}w</span>
      <button type="button" aria-label="Bold" title="Bold (⌘B)" onClick={() => run((a) => a.inline(INLINE_MARKERS.bold))}>
        <Bold size={12} aria-hidden />
      </button>
      <button type="button" aria-label="Italic" title="Italic (⌘I)" onClick={() => run((a) => a.inline(INLINE_MARKERS.italic))}>
        <Italic size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Highlight"
        title="Highlight (⌘⇧H)"
        onClick={() => run((a) => a.inline(INLINE_MARKERS.highlight))}
      >
        <Highlighter size={12} aria-hidden />
      </button>
      <button type="button" aria-label="Checklist" title="Checklist (⌘⇧9)" onClick={() => run((a) => a.block('todo'))}>
        <ListChecks size={12} aria-hidden />
      </button>
    </div>
  )
}

export function TextWidget({
  data,
  onChange,
  onHeightChange,
  widgetId,
  skin = 'plain',
}: TextWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const [api, setApi] = useState<EditorCommandApi | null>(null)
  const capabilities = capabilitiesFor(skin)
  const remoteEditor = useCollaborationStore((state) =>
    state.participants.find((participant) =>
      participant.clientId !== state.localClientId && participant.editingWidgetId === widgetId,
    ),
  )
  const text = data.text ?? ''
  const state = skinStateFor(data, skin)
  const words = useMemo(() => documentStats(text).words, [text])

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data, editing, onHeightChange, skin])

  const setText = useCallback(
    (nextText: string) => {
      onChange({ ...data, text: nextText, mode: skin })
    },
    [data, onChange, skin],
  )

  const patchState = useCallback(
    (patch: Record<string, unknown>) => {
      onChange(
        dataWithSkinState({ ...data, mode: skin } as ModuleData, skin, {
          ...state,
          ...patch,
        }) as TextData,
      )
    },
    [data, onChange, skin, state],
  )

  if (skin === 'typewriter') {
    const focusMode = state.focusMode === true
    const goal = writingGoalOf(state)
    return (
      <div
        ref={rootRef}
        className="gp-note-skin gp-note-typewriter"
        data-note-skin={skin}
        data-focus-mode={focusMode || undefined}
      >
        <header className="gp-note-toolbar">
          <span className="gp-note-eyebrow">Draft</span>
          {goal !== null && (
            <span className="gp-note-goal-chip" title={`${words} of ${goal} words`}>
              <Target size={10} aria-hidden />
              {Math.min(999, Math.round((words / goal) * 100))}%
            </span>
          )}
          <button
            type="button"
            className="gp-note-focus-toggle"
            aria-pressed={focusMode}
            onClick={() => patchState({ focusMode: !focusMode })}
          >
            {focusMode ? <Minimize2 size={11} aria-hidden /> : <Maximize2 size={11} aria-hidden />}
            {focusMode ? 'Ease focus' : 'Focus'}
          </button>
        </header>
        <div className="gp-note-typewriter-paper gp-bare-field">
          <TextEditorSurface
            value={text}
            onChange={setText}
            label="Typewriter note"
            placeholder="Begin the first sentence…"
            markdown={capabilities.liveMarkdown}
            focusMode={focusMode}
            checkboxes={capabilities.checkboxes}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
          />
        </div>
        <NoteStatus remoteEditor={remoteEditor} />
      </div>
    )
  }

  return (
    <div ref={rootRef} className="gp-note-skin gp-note-plain gp-bare-field" data-note-skin="plain">
      {capabilities.formattingToolbar && (
        <CardChrome api={api} words={words} />
      )}
      <TextEditorSurface
        value={text}
        onChange={setText}
        label="Note"
        placeholder="Start writing…"
        markdown={capabilities.liveMarkdown}
        checkboxes={capabilities.checkboxes}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onReady={setApi}
      />
      <NoteStatus remoteEditor={remoteEditor} />
    </div>
  )
}
