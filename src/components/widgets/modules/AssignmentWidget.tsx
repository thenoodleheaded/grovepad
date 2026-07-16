import { CalendarClock, Plus, X } from 'lucide-react'
import type { AssignmentData, AssignmentStatus } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface AssignmentWidgetProps {
  data: AssignmentData
  onChange: (data: AssignmentData) => void
}

const NEXT_STATUS: Record<AssignmentStatus, AssignmentStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'todo',
}

const STATUS_STYLES: Record<AssignmentStatus, { label: string; cls: string }> = {
  todo: { label: 'To do', cls: 'gp-hairline text-neutral-500' },
  doing: { label: 'Doing', cls: 'border-amber-400/40 bg-amber-400/10 text-amber-300' },
  done: { label: 'Done', cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' },
}

const MS_PER_DAY = 86_400_000

/** Homework tracker — title, due date, and a tap-to-cycle status chip. */
export function AssignmentWidget({ data, onChange }: AssignmentWidgetProps) {
  const doneCount = data.items.filter((i) => i.status === 'done').length
  const doneCountRef = useFieldAnchor<HTMLSpanElement>('done_count')

  const setItem = (id: string, patch: Partial<AssignmentData['items'][number]>) =>
    onChange({ items: data.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })

  const removeItem = (id: string) =>
    onChange({ items: data.items.filter((i) => i.id !== id) })

  const addItem = () =>
    onChange({ items: [...data.items, { id: crypto.randomUUID(), title: '', due: '', status: 'todo' }] })

  const dueLabel = (due: string): { text: string; urgent: boolean } | null => {
    if (!due) return null
    const target = new Date(`${due}T00:00:00`)
    if (Number.isNaN(target.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Math.round((target.getTime() - today.getTime()) / MS_PER_DAY)
    if (days < 0) return { text: `${Math.abs(days)}d late`, urgent: true }
    if (days === 0) return { text: 'today', urgent: true }
    return { text: `${days}d`, urgent: days <= 2 }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {data.items.map((item) => {
          const status = STATUS_STYLES[item.status]
          const due = dueLabel(item.due)
          return (
            <div key={item.id} className="group/row flex h-[34px] items-center gap-2">
              <input
                value={item.title}
                placeholder="Assignment…"
                aria-label="Assignment title"
                onChange={(e) => setItem(item.id, { title: e.target.value })}
                className={`min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-neutral-700 ${
                  item.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-200'
                }`}
              />
              <label className="flex shrink-0 items-center gap-1 text-neutral-600">
                <CalendarClock size={10} aria-hidden className={due?.urgent ? 'text-red-400' : ''} />
                <input
                  type="date"
                  value={item.due}
                  aria-label="Due date"
                  onChange={(e) => setItem(item.id, { due: e.target.value })}
                  className="w-[18px] bg-transparent font-mono text-[10px] text-transparent outline-none [color-scheme:dark]"
                />
                {due && (
                  <span className={`font-mono text-[9px] tabular-nums ${due.urgent ? 'text-red-400' : 'text-neutral-500'}`}>
                    {due.text}
                  </span>
                )}
              </label>
              <button
                type="button"
                aria-label={`Status: ${status.label} — click to change`}
                onClick={() => setItem(item.id, { status: NEXT_STATUS[item.status] })}
                className={`w-12 shrink-0 rounded-full border py-px text-center text-[9px] font-medium transition-colors ${status.cls}`}
              >
                {status.label}
              </button>
              <button
                type="button"
                aria-label="Remove assignment"
                onClick={() => removeItem(item.id)}
                className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
              >
                <X size={11} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-auto flex h-9 items-center justify-between border-t gp-hairline">
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add assignment
        </button>
        <span
          ref={doneCountRef}
          className={`font-mono text-[10px] tabular-nums transition-colors ${
            data.items.length > 0 && doneCount === data.items.length ? 'text-emerald-400' : 'text-neutral-600'
          }`}
        >
          {doneCount}/{data.items.length} done
        </span>
      </div>
    </div>
  )
}
