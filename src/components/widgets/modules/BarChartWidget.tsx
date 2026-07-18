import { Plus, X } from 'lucide-react'
import type { BarChartData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface BarChartWidgetProps {
  data: BarChartData
  onChange: (data: BarChartData) => void
}

/** Horizontal bar chart — each bar's width is relative to the largest value. */
export function BarChartWidget({ data, onChange }: BarChartWidgetProps) {
  const max = Math.max(1, ...data.bars.map((b) => Math.abs(b.value)))
  const total = data.bars.reduce((sum, b) => sum + (Number.isFinite(b.value) ? b.value : 0), 0)
  const totalRowRef = useFieldAnchor<HTMLSpanElement>('total')

  const setBar = (id: string, patch: Partial<BarChartData['bars'][number]>) =>
    onChange({
      ...data,
      bars: data.bars.map((bar) => (bar.id === id ? { ...bar, ...patch } : bar)),
    })

  const removeBar = (id: string) =>
    onChange({ ...data, bars: data.bars.filter((bar) => bar.id !== id) })

  const addBar = () =>
    onChange({
      ...data,
      bars: [...data.bars, { id: crypto.randomUUID(), label: '', value: 0 }],
    })

  return (
    <div className="gp-flat-visual flex h-full flex-col">
      <div className="flex flex-1 flex-col justify-center gap-2">
        {data.bars.map((bar) => (
          <div key={bar.id} className="group/row flex items-center gap-2">
            <input
              value={bar.label}
              placeholder="Label…"
              aria-label="Bar label"
              onChange={(e) => setBar(bar.id, { label: e.target.value })}
              className="w-16 shrink-0 truncate bg-transparent text-[11px] text-neutral-400 outline-none placeholder:text-neutral-700"
            />
            <div className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-neutral-800/70">
              <div
                className="h-full rounded bg-gradient-to-r from-sky-600 to-sky-400 transition-[width] duration-200"
                style={{ width: `${Math.min(100, (Math.abs(bar.value) / max) * 100)}%` }}
              />
            </div>
            <input
              type="number"
              value={bar.value}
              aria-label="Bar value"
              onChange={(e) => setBar(bar.id, { value: Number(e.target.value) })}
              className="w-10 shrink-0 bg-transparent text-right  text-[11px] text-neutral-300 outline-none"
            />
            <button
              type="button"
              aria-label="Remove bar"
              onClick={() => removeBar(bar.id)}
              className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
            >
              <X size={11} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-auto flex h-8 items-center justify-between border-t gp-hairline">
        <button
          type="button"
          onClick={addBar}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add bar
        </button>
        <span ref={totalRowRef} className=" text-[11px] tabular-nums text-neutral-500">
          Σ {total}
        </span>
      </div>
    </div>
  )
}
