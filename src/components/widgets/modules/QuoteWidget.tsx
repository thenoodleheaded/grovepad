import { useLayoutEffect, useRef } from 'react'
import type { QuoteData } from '../../../types/spatial'
import { useCollaborationStore } from '../../../store/useCollaborationStore'

interface QuoteWidgetProps {
  data: QuoteData
  onChange: (data: QuoteData) => void
  onHeightChange?: (height: number) => void
  widgetId?: string
}

/** A pull-quote card — oversized quotation mark, italic body, attribution. */
export function QuoteWidget({ data, onChange, onHeightChange, widgetId }: QuoteWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const remoteEditor = useCollaborationStore((state) =>
    state.participants.find((participant) =>
      participant.clientId !== state.localClientId && participant.editingWidgetId === widgetId,
    ),
  )

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '0px'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data.text, data.attribution, onHeightChange])

  return (
    <div ref={rootRef} className="gp-note-quote gp-bare-field">
      <span aria-hidden className="gp-note-quote-mark" />
      <textarea
        ref={textareaRef}
        value={data.text}
        rows={3}
        placeholder="A line worth keeping…"
        aria-label="Quote"
        onChange={(e) => onChange({ ...data, text: e.target.value })}
        data-collaboration-editing={Boolean(remoteEditor)}
        className="gp-note-quote-editor"
      />
      {/* The rule is the attribution's dash, so it only exists once there is
          an attribution to dash — or once someone is reaching for the field. */}
      <footer className="gp-note-quote-footer" data-attributed={data.attribution.trim() ? 'true' : undefined}>
        <span aria-hidden />
        <input
          value={data.attribution}
          placeholder="Attribution"
          aria-label="Attribution"
          onChange={(e) => onChange({ ...data, attribution: e.target.value })}
          className="gp-note-quote-attribution"
        />
      </footer>
      {remoteEditor && (
        <span className="gp-note-collaborator" style={{ color: remoteEditor.color }}>
          <span aria-hidden style={{ backgroundColor: remoteEditor.color }} />
          {remoteEditor.name} is editing
        </span>
      )}
    </div>
  )
}
