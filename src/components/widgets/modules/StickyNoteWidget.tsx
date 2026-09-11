import { Eraser, PenLine } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { TextEditorSurface } from './TextEditorSurface'
import { capabilitiesFor } from './textSkinCapabilities'
import type { StickyNoteColor } from '../../../types/spatial'
import { useCollaborationStore } from '../../../store/useCollaborationStore'
import {
  eraseStickyStrokes,
  stickyStrokePath,
  stickyStrokes,
  STICKY_STROKE_LIMIT,
  STICKY_STROKE_POINT_LIMIT,
  type StickyStroke,
} from './textSkinModel'

/** The slice of a Note this editor works on. Sticky is a Note skin, not a card
 * of its own, so the writing and the colour are read straight off `TextData`
 * while the ink is handed in from the skin's isolated pocket — the adapter in
 * `consolidatedWidgetRenderers.tsx` owns putting both halves back together. */
interface StickyNoteFace {
  text: string
  color: StickyNoteColor
  /** Pen ink laid over the text. Points are 0–1 fractions of the note's own
   * surface — `stickyStrokes` in `textSkinModel.ts` owns the bounded read of
   * this field, so nothing here is trusted as written. */
  strokes?: { points: number[] }[]
}

interface StickyNoteWidgetProps {
  data: StickyNoteFace
  onChange: (data: StickyNoteFace) => void
  onHeightChange?: (height: number) => void
  widgetId?: string
}

/** The pad's colours. Every tone is painted in CSS from `data-note-color`, so
 * the list here is only the order they are offered in and the name each one
 * says out loud. */
const STICKY_COLORS: readonly { value: StickyNoteColor; label: string }[] = [
  { value: 'yellow', label: 'Yellow' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'pink', label: 'Pink' },
  { value: 'blue', label: 'Blue' },
  { value: 'teal', label: 'Teal' },
  { value: 'green', label: 'Green' },
  { value: 'lime', label: 'Lime' },
  { value: 'purple', label: 'Purple' },
]

/** Fraction of the surface the pointer must travel before a point is kept. A
 * scribble is a handful of points, not one per frame — this is what keeps the
 * ink cheap to store, to validate, and to redraw inside a resting tile. */
const POINT_STEP = 0.006
/** How near the eraser has to pass a stroke to lift it. */
const ERASER_RADIUS = 0.045

type StickyTool = 'pen' | 'eraser' | null

/** Sticky's own share of the writing tools, read once. */
const STICKY = capabilitiesFor('sticky')

/** A quiet full-card tint with controls cut directly into the one backplate. */
export function StickyNoteWidget({ data, onChange, onHeightChange, widgetId }: StickyNoteWidgetProps) {
  const color: StickyNoteColor = data.color ?? 'yellow'
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<SVGPathElement>(null)
  const pointsRef = useRef<number[]>([])
  const erasedRef = useRef<StickyStroke[] | null>(null)
  const [tool, setTool] = useState<StickyTool>(null)
  const remoteEditor = useCollaborationStore((state) =>
    state.participants.find((participant) =>
      participant.clientId !== state.localClientId && participant.editingWidgetId === widgetId,
    ),
  )

  const strokes = stickyStrokes(data.strokes)

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    // `offsetHeight`, not `scrollHeight`: the colour bleeds past this box to
    // reach the card's edge, and `scrollHeight` counts that bleed — reporting
    // it left a strip of untinted card below the note that grew with it.
    if (rootRef.current) onHeightChange?.(rootRef.current.offsetHeight)
  }, [data.text, tool, onHeightChange])

  /** Surface fractions, so a scribble stays on its word at every card size. */
  const surfacePoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const startInk = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tool || event.button !== 0) return
    const point = surfacePoint(event)
    if (!point) return
    // The card's own drag arbiter must not read a pen stroke as a move.
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === 'eraser') {
      erasedRef.current = eraseStickyStrokes(strokes, point.x, point.y, ERASER_RADIUS)
      if (erasedRef.current.length !== strokes.length) {
        onChange({ ...data, color, strokes: erasedRef.current as { points: number[] }[] })
      }
      return
    }
    pointsRef.current = [point.x, point.y]
    // The live stroke is drawn straight onto its own path element. Routing a
    // pointermove through React state would re-render the whole note — and its
    // textarea — sixty times a second for a two-second scribble.
    draftRef.current?.setAttribute('d', stickyStrokePath({ points: pointsRef.current }))
  }

  const extendInk = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tool) return
    const point = surfacePoint(event)
    if (!point) return
    if (tool === 'eraser') {
      if (!erasedRef.current) return
      const kept = eraseStickyStrokes(erasedRef.current, point.x, point.y, ERASER_RADIUS)
      if (kept.length === erasedRef.current.length) return
      erasedRef.current = kept
      onChange({ ...data, color, strokes: kept as { points: number[] }[] })
      return
    }
    const points = pointsRef.current
    if (points.length === 0) return
    const lastX = points[points.length - 2] ?? 0
    const lastY = points[points.length - 1] ?? 0
    if (Math.abs(point.x - lastX) + Math.abs(point.y - lastY) < POINT_STEP) return
    if (points.length >= STICKY_STROKE_POINT_LIMIT * 2) return
    points.push(point.x, point.y)
    draftRef.current?.setAttribute('d', stickyStrokePath({ points }))
  }

  const endInk = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    erasedRef.current = null
    const points = pointsRef.current
    pointsRef.current = []
    draftRef.current?.setAttribute('d', '')
    if (points.length < 4) return
    // Oldest ink gives way first, so the pen never grows the note's record
    // without bound.
    const next = [...strokes, { points }].slice(-STICKY_STROKE_LIMIT)
    onChange({ ...data, color, strokes: next as { points: number[] }[] })
  }

  return (
    <div
      ref={rootRef}
      className="gp-note-sticky gp-bare-field"
      data-note-color={color}
      data-sticky-tool={tool ?? undefined}
    >
      <header className="gp-note-sticky-tools">
        <button
          type="button"
          aria-label="Draw on this note"
          aria-pressed={tool === 'pen'}
          title="Pen"
          onClick={() => setTool(tool === 'pen' ? null : 'pen')}
        >
          <PenLine size={12} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Erase drawing"
          aria-pressed={tool === 'eraser'}
          title="Eraser"
          disabled={strokes.length === 0}
          onClick={() => setTool(tool === 'eraser' ? null : 'eraser')}
        >
          <Eraser size={12} aria-hidden />
        </button>
      </header>
      <div ref={surfaceRef} className="gp-note-sticky-sheet gp-bare-field">
        {/* A pad is still a writing surface: markdown paints, Enter carries a
            list on, and a tapped checkbox flips. What Sticky does NOT get is
            the furniture around it — no toolbar, no panels, no sheet — because
            the whole point of a sticky note is that it is faster than opening
            something. See `textSkinCapabilities`. */}
        <TextEditorSurface
          textareaRef={textareaRef}
          value={data.text}
          onChange={(next) => onChange({ ...data, text: next })}
          label="Sticky note text"
          placeholder="Jot something down…"
          className="gp-note-sticky-field"
          editorClassName="gp-note-sticky-editor"
          markdown={STICKY.liveMarkdown}
          checkboxes={STICKY.checkboxes}
          collaborating={Boolean(remoteEditor)}
        />
        {/* One nib, one colour: the ink is a plain path set drawn in the note's
            own surface box, so it scales with the card and with the resting
            tile instead of being pinned to the pixels it was drawn at. */}
        <svg
          aria-hidden
          className="gp-note-sticky-ink"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          focusable="false"
        >
          {strokes.map((stroke, index) => (
            <path key={index} d={stickyStrokePath(stroke)} vectorEffect="non-scaling-stroke" />
          ))}
          <path ref={draftRef} d="" vectorEffect="non-scaling-stroke" />
        </svg>
        {tool && (
          <div
            className="gp-note-sticky-capture"
            data-widget-interactive="true"
            aria-hidden
            onPointerDown={startInk}
            onPointerMove={extendInk}
            onPointerUp={endInk}
            onPointerCancel={endInk}
          />
        )}
      </div>
      {/* The swatches are the one thing on this card that is not the note, so
          they sit under the tinted sheet on their own strip rather than on it.
          A resting sticky never renders this: at rest the note is a note. */}
      <footer className="gp-note-sticky-colors" aria-label="Sticky note color">
        {STICKY_COLORS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={`${option.label} note`}
            aria-pressed={color === option.value}
            data-swatch={option.value}
            onClick={() => onChange({ ...data, color: option.value })}
          />
        ))}
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
