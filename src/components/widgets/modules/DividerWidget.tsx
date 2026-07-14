import type { DividerData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface DividerWidgetProps {
  data: DividerData
  onChange: (data: DividerData) => void
}

/** A labeled section break — organizes the canvas without holding content. */
export function DividerWidget({ data, onChange }: DividerWidgetProps) {
  const labelRef = useFieldAnchor<HTMLInputElement>('label')
  return (
    <div className="flex h-full items-center gap-3">
      <span aria-hidden className="h-px min-w-4 flex-1 bg-neutral-700" />
      <input
        ref={labelRef}
        value={data.label}
        placeholder="Section…"
        aria-label="Divider label"
        onChange={(e) => onChange({ label: e.target.value })}
        className="w-auto max-w-[70%] shrink-0 bg-transparent text-center text-[11px] font-medium uppercase tracking-widest text-neutral-500 outline-none placeholder:text-neutral-700"
        style={{ width: `${Math.max(6, data.label.length)}ch` }}
      />
      <span aria-hidden className="h-px min-w-4 flex-1 bg-neutral-700" />
    </div>
  )
}
