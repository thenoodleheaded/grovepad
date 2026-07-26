import { useLayoutEffect, useRef } from 'react'
import type { StickyNoteColor, StickyNoteData } from '../../../types/spatial'
import { useCollaborationStore } from '../../../store/useCollaborationStore'

interface StickyNoteWidgetProps {
  data: StickyNoteData
  onChange: (data: StickyNoteData) => void
  onHeightChange?: (height: number) => void
  widgetId?: string
}

const COLOR_STYLES: Record<StickyNoteColor, { swatch: string; caret: string }> = {
  yellow: {
    swatch: 'bg-amber-400',
    caret: 'caret-amber-400',
  },
  pink: {
    swatch: 'bg-pink-400',
    caret: 'caret-pink-400',
  },
  blue: {
    swatch: 'bg-sky-400',
    caret: 'caret-sky-400',
  },
  green: {
    swatch: 'bg-emerald-400',
    caret: 'caret-emerald-400',
  },
  purple: {
    swatch: 'bg-violet-400',
    caret: 'caret-violet-400',
  },
}

const COLOR_ORDER: StickyNoteColor[] = ['yellow', 'pink', 'blue', 'green', 'purple']

/** A quiet full-card tint with controls cut directly into the one backplate. */
export function StickyNoteWidget({ data, onChange, onHeightChange, widgetId }: StickyNoteWidgetProps) {
  const style = COLOR_STYLES[data.color] ?? COLOR_STYLES.yellow
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const remoteEditor = useCollaborationStore((state) =>
    state.participants.find((participant) =>
      participant.clientId !== state.localClientId && participant.editingWidgetId === widgetId,
    ),
  )

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data.text, onHeightChange])

  return (
    <div ref={rootRef} className="gp-note-sticky gp-bare-field" data-note-color={data.color}>
      <span aria-hidden className="gp-note-sticky-tape" />
      {/* The ruling is painted on this sheet, not on the textarea: a text
          control never paints a fill of its own (06-field-islands.css). */}
      <div className="gp-note-sticky-sheet gp-bare-field">
        <textarea
          ref={textareaRef}
          value={data.text}
          rows={3}
          placeholder="Jot something down…"
          aria-label="Sticky note text"
          onChange={(e) => onChange({ ...data, text: e.target.value })}
          data-collaboration-editing={Boolean(remoteEditor)}
          className={`gp-note-sticky-editor ${style.caret}`}
        />
      </div>
      <footer className="gp-note-sticky-footer">
        <span className="gp-note-sticky-swatches" aria-label="Sticky note color">
        {COLOR_ORDER.map((color) => (
          <button
            key={color}
            type="button"
            title={`${color[0]!.toUpperCase()}${color.slice(1)}`}
            aria-label={`${color} note`}
            aria-pressed={data.color === color}
            onClick={() => onChange({ ...data, color })}
            className={`rounded-full ${COLOR_STYLES[color].swatch}`}
          />
        ))}
        </span>
        {remoteEditor && (
          <span className="gp-note-collaborator" style={{ color: remoteEditor.color }}>
            <span aria-hidden style={{ backgroundColor: remoteEditor.color }} />
            {remoteEditor.name}
          </span>
        )}
      </footer>
    </div>
  )
}
