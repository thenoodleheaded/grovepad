import { Plus, X } from 'lucide-react'
import type { ProsConsData, ProsConsItem } from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'

interface ProsConsWidgetProps {
  data: ProsConsData
  onChange: (data: ProsConsData) => void
}

function Column({
  title,
  accent,
  items,
  onChange,
}: {
  title: string
  accent: 'pro' | 'con'
  items: ProsConsItem[]
  onChange: (items: ProsConsItem[]) => void
}) {
  const setItem = (id: string, text: string) =>
    onChange(items.map((item) => (item.id === id ? { ...item, text } : item)))
  const removeItem = (id: string) => onChange(items.filter((item) => item.id !== id))
  const addItem = () => onChange([...items, { id: crypto.randomUUID(), text: '' }])

  const headerClass = accent === 'pro' ? 'text-emerald-400' : 'text-red-400'
  const dotClass = accent === 'pro' ? 'bg-emerald-400/70' : 'bg-red-400/70'
  return (
    // Paired alternatives never scale asymmetrically (glass constitution symmetry rule).
    <WidgetPanel grip={false} floor="rigid" className="flex min-w-0 flex-1 flex-col p-3">
      <div className="flex items-center justify-between pb-1.5">
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${headerClass}`}>
          {title}
        </span>
        <span className=" text-[10px] tabular-nums text-neutral-600">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col">
        {items.map((item) => (
          <div key={item.id} className="group/row flex h-7 items-center gap-1.5">
            <span aria-hidden className={`h-1 w-1 shrink-0 rounded-full ${dotClass}`} />
            <input
              value={item.text}
              placeholder="Point…"
              aria-label={`${title} point`}
              onChange={(e) => setItem(item.id, e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-neutral-200 outline-none placeholder:text-neutral-700"
            />
            <button
              type="button"
              aria-label="Remove point"
              onClick={() => removeItem(item.id)}
              className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
            >
              <X size={10} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          aria-label={`Add ${title.toLowerCase()} point`}
          className="mt-0.5 flex h-6 items-center gap-1 text-[10px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={10} aria-hidden />
          Add
        </button>
      </div>
    </WidgetPanel>
  )
}

/** Two-column argument sheet — weigh a decision at a glance. */
export function ProsConsWidget({ data, onChange }: ProsConsWidgetProps) {
  return (
    <div className="flex h-full flex-col gap-1.5">
      <WidgetPanel grip={false} className="shrink-0 px-3 py-2.5">
        <input
          value={data.topic}
          placeholder="What's the decision?"
          aria-label="Decision topic"
          onChange={(e) => onChange({ ...data, topic: e.target.value })}
          className="w-full bg-transparent text-[13px] font-medium text-neutral-200 outline-none placeholder:text-neutral-700"
        />
      </WidgetPanel>
      <div className="gp-pros-cons-columns flex min-h-0 flex-1 gap-1.5">
        <Column
          title="Pros"
          accent="pro"
          items={data.pros}
          onChange={(pros) => onChange({ ...data, pros })}
        />
        <Column
          title="Cons"
          accent="con"
          items={data.cons}
          onChange={(cons) => onChange({ ...data, cons })}
        />
      </div>
    </div>
  )
}
