import type { QuoteData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface QuoteWidgetProps {
  data: QuoteData
  onChange: (data: QuoteData) => void
}

/** A pull-quote card — oversized quotation mark, italic body, attribution. */
export function QuoteWidget({ data, onChange }: QuoteWidgetProps) {
  const textFieldRef = useFieldAnchor<HTMLTextAreaElement>('text')
  return (
    <div className="gp-bare-field relative flex h-full flex-col justify-between gap-2 pl-5">
      <span
        aria-hidden
        className="pointer-events-none absolute -left-0.5 -top-2 select-none  text-5xl leading-none text-emerald-400/25"
      >
        “
      </span>
      <textarea
        ref={textFieldRef}
        value={data.text}
        placeholder="A line worth keeping…"
        aria-label="Quote"
        onChange={(e) => onChange({ ...data, text: e.target.value })}
        className="w-full flex-1 resize-none bg-transparent text-[15px] italic leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-700"
      />
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-px w-5 shrink-0 bg-emerald-400/40" />
        <input
          value={data.attribution}
          placeholder="Attribution"
          aria-label="Attribution"
          onChange={(e) => onChange({ ...data, attribution: e.target.value })}
          className="w-full bg-transparent text-[11px] font-medium uppercase tracking-wider text-neutral-500 outline-none placeholder:text-neutral-700"
        />
      </div>
    </div>
  )
}
