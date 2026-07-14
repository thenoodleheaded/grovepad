import { useLayoutEffect, useRef } from 'react'
import type { StickyNoteColor, StickyNoteData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { WidgetPanel } from '../WidgetPanel'

interface StickyNoteWidgetProps {
  data: StickyNoteData
  onChange: (data: StickyNoteData) => void
  onHeightChange?: (height: number) => void
}

/* Text stays on the theme-aware neutral scale (readable in dark AND light
   mode); the color lives in the panel tint, caret, and swatch. */
const COLOR_STYLES: Record<StickyNoteColor, { panel: string; swatch: string; caret: string }> = {
  yellow: {
    panel: 'border-amber-400/25 bg-amber-400/10',
    swatch: 'bg-amber-400',
    caret: 'caret-amber-400',
  },
  pink: {
    panel: 'border-pink-400/25 bg-pink-400/10',
    swatch: 'bg-pink-400',
    caret: 'caret-pink-400',
  },
  blue: {
    panel: 'border-sky-400/25 bg-sky-400/10',
    swatch: 'bg-sky-400',
    caret: 'caret-sky-400',
  },
  green: {
    panel: 'border-emerald-400/25 bg-emerald-400/10',
    swatch: 'bg-emerald-400',
    caret: 'caret-emerald-400',
  },
  purple: {
    panel: 'border-violet-400/25 bg-violet-400/10',
    swatch: 'bg-violet-400',
    caret: 'caret-violet-400',
  },
}

const COLOR_ORDER: StickyNoteColor[] = ['yellow', 'pink', 'blue', 'green', 'purple']

/**
 * A sticky note is two glued subdivisions: the tinted text plate (notes
 * behavior — it grows with the text, never hiding or padding), and a color
 * chooser panel beneath it that decides the plate's tint.
 */
export function StickyNoteWidget({ data, onChange, onHeightChange }: StickyNoteWidgetProps) {
  const style = COLOR_STYLES[data.color] ?? COLOR_STYLES.yellow
  const textRowRef = useFieldAnchor('text')
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  }, [data.text, onHeightChange])

  return (
    <div ref={rootRef} className="flex flex-col gap-1">
      <div ref={textRowRef}>
        <WidgetPanel className={`p-2.5 ${style.panel}`}>
          <textarea
            ref={textareaRef}
            value={data.text}
            rows={2}
            placeholder="Jot something down…"
            aria-label="Sticky note text"
            onChange={(e) => onChange({ ...data, text: e.target.value })}
            className={`w-full resize-none bg-transparent text-[13px] leading-[1.6] text-neutral-100 outline-none placeholder:text-neutral-600 ${style.caret}`}
          />
        </WidgetPanel>
      </div>
      <WidgetPanel className="flex h-8 items-center gap-1.5 px-2.5 pr-5">
        {COLOR_ORDER.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${color} note`}
            aria-pressed={data.color === color}
            onClick={() => onChange({ ...data, color })}
            className={`h-3.5 w-3.5 shrink-0 rounded-full ${COLOR_STYLES[color].swatch} transition-transform ${
              data.color === color
                ? 'scale-100 ring-2 ring-neutral-100 ring-offset-2 ring-offset-transparent'
                : 'scale-90 opacity-60 hover:scale-100 hover:opacity-100'
            }`}
          />
        ))}
      </WidgetPanel>
    </div>
  )
}
