import type { CornellData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface CornellWidgetProps {
  data: CornellData
  onChange: (data: CornellData) => void
}

/**
 * Cornell note layout — a narrow cue/question column beside the main notes,
 * with a summary band pinned along the bottom.
 */
export function CornellWidget({ data, onChange }: CornellWidgetProps) {
  const notesRef = useFieldAnchor<HTMLTextAreaElement>('notes')
  const summaryRef = useFieldAnchor<HTMLTextAreaElement>('summary')

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex w-2/5 shrink-0 flex-col">
          <span className="pb-1 text-[9px] font-semibold uppercase tracking-widest text-neutral-600">
            Cues
          </span>
          <textarea
            value={data.cues}
            placeholder="Questions & keywords…"
            aria-label="Cue column"
            onChange={(e) => onChange({ ...data, cues: e.target.value })}
            className="min-h-0 flex-1 resize-none rounded-lg border gp-hairline bg-neutral-800/20 px-2 py-1.5 text-[12px] leading-relaxed text-neutral-300 outline-none placeholder:text-neutral-700"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="pb-1 text-[9px] font-semibold uppercase tracking-widest text-neutral-600">
            Notes
          </span>
          <textarea
            ref={notesRef}
            value={data.notes}
            placeholder="Main notes…"
            aria-label="Notes"
            onChange={(e) => onChange({ ...data, notes: e.target.value })}
            className="min-h-0 flex-1 resize-none rounded-lg border gp-hairline bg-neutral-800/20 px-2 py-1.5 text-[12px] leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-700"
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col">
        <span className="pb-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-400/70">
          Summary
        </span>
        <textarea
          ref={summaryRef}
          value={data.summary}
          rows={2}
          placeholder="Sum it up in a sentence…"
          aria-label="Summary"
          onChange={(e) => onChange({ ...data, summary: e.target.value })}
          className="resize-none rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-2 py-1.5 text-[12px] leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-700"
        />
      </div>
    </div>
  )
}
