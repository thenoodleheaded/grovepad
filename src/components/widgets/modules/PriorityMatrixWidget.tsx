import { Plus, X } from 'lucide-react'
import type { MatrixItem, PriorityMatrixData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { WidgetPanel } from '../WidgetPanel'

interface PriorityMatrixWidgetProps {
  data: PriorityMatrixData
  onChange: (data: PriorityMatrixData) => void
}

const QUADRANTS: Array<{ q: MatrixItem['quadrant']; label: string; hint: string; cls: string }> = [
  { q: 0, label: 'Do first', hint: 'urgent · important', cls: 'text-red-400' },
  { q: 1, label: 'Schedule', hint: 'important', cls: 'text-sky-400' },
  { q: 2, label: 'Delegate', hint: 'urgent', cls: 'text-amber-400' },
  { q: 3, label: 'Drop', hint: 'neither', cls: 'text-neutral-500' },
]

/** Eisenhower 2×2 — click an item's dot to move it clockwise to the next quadrant. */
export function PriorityMatrixWidget({ data, onChange }: PriorityMatrixWidgetProps) {
  const doFirstRef = useFieldAnchor('do_first_count')

  const setItem = (id: string, patch: Partial<MatrixItem>) =>
    onChange({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })

  const removeItem = (id: string) =>
    onChange({ items: data.items.filter((item) => item.id !== id) })

  const addItem = (quadrant: MatrixItem['quadrant']) =>
    onChange({ items: [...data.items, { id: crypto.randomUUID(), text: '', quadrant }] })

  const cycle = (item: MatrixItem) =>
    setItem(item.id, { quadrant: ((item.quadrant + 1) % 4) as MatrixItem['quadrant'] })

  return (
    <div className="gp-priority-grid grid h-full grid-cols-2 grid-rows-2 gap-1.5">
      {QUADRANTS.map(({ q, label, hint, cls }) => {
        const items = data.items.filter((item) => item.quadrant === q)
        return (
          <WidgetPanel
            key={q}
            grip={false}
            ref={q === 0 ? doFirstRef : undefined}
            island={`q${q}`}
            sizing="fixed"
            className="group/quad flex min-h-0 flex-col p-2.5"
          >
            <div className="flex shrink-0 items-baseline justify-between pb-1">
              <span className={`text-[9px] font-semibold uppercase tracking-widest ${cls}`}>
                {label}
              </span>
              <span className="text-[8px] text-neutral-700">{hint}</span>
            </div>
            <div className="min-h-0 flex-1">
              {items.map((item) => (
                <div key={item.id} className="group/row flex h-[22px] items-center gap-1">
                  <button
                    type="button"
                    title="Move to next quadrant"
                    aria-label="Move to next quadrant"
                    onClick={() => cycle(item)}
                    className={`h-1.5 w-1.5 shrink-0 rounded-full transition-transform hover:scale-150 ${cls.replace('text-', 'bg-')}`}
                  />
                  <input
                    value={item.text}
                    placeholder="Item…"
                    aria-label={`${label} item`}
                    onChange={(e) => setItem(item.id, { text: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-[11px] text-neutral-200 outline-none placeholder:text-neutral-700"
                  />
                  <button
                    type="button"
                    aria-label="Remove item"
                    onClick={() => removeItem(item.id)}
                    className="shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
                  >
                    <X size={9} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              aria-label={`Add to ${label}`}
              onClick={() => addItem(q)}
              className={`flex h-4 shrink-0 items-center gap-1 text-[9px] text-neutral-700 transition-all hover:text-neutral-400 ${
                items.length === 0 ? '' : 'opacity-0 group-hover/quad:opacity-100'
              }`}
            >
              <Plus size={8} aria-hidden />
              Add
            </button>
          </WidgetPanel>
        )
      })}
    </div>
  )
}
