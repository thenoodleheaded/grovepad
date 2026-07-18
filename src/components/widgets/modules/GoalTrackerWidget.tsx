import { Plus, Target, X } from 'lucide-react'
import type { GoalTrackerData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface GoalTrackerWidgetProps {
  data: GoalTrackerData
  onChange: (data: GoalTrackerData) => void
}

/** One goal, a milestone checklist, and an auto-computed progress ring. */
export function GoalTrackerWidget({ data, onChange }: GoalTrackerWidgetProps) {
  const total = data.milestones.length
  const done = data.milestones.filter((m) => m.done).length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const percentRingRef = useFieldAnchor('percent')
  const completeRingRef = useFieldAnchor('complete')

  // SVG ring: r=15 → circumference ≈ 94.25
  const CIRC = 2 * Math.PI * 15

  const setMilestone = (id: string, patch: Partial<GoalTrackerData['milestones'][number]>) =>
    onChange({
      ...data,
      milestones: data.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })

  const removeMilestone = (id: string) =>
    onChange({ ...data, milestones: data.milestones.filter((m) => m.id !== id) })

  const addMilestone = () =>
    onChange({
      ...data,
      milestones: [...data.milestones, { id: crypto.randomUUID(), label: '', done: false }],
    })

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center gap-3">
        <div
          ref={(el) => {
            percentRingRef.current = el
            completeRingRef.current = el
          }}
          className="relative h-10 w-10 shrink-0"
        >
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-neutral-800" />
            <circle
              cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - percent / 100)}
              className="transition-[stroke-dashoffset] duration-300"
              style={{ stroke: 'var(--gp-widget-accent)' }}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center  text-[9px] font-semibold tabular-nums"
            style={{ color: 'var(--gp-widget-accent)' }}
          >
            {percent}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Target size={11} className="shrink-0 text-emerald-400/80" aria-hidden />
            <input
              value={data.goal}
              placeholder="What's the goal?"
              aria-label="Goal"
              onChange={(e) => onChange({ ...data, goal: e.target.value })}
              className="gp-input--bare w-full text-[13px] font-medium text-neutral-200 outline-none placeholder:text-neutral-700"
            />
          </div>
          <p className="mt-0.5 text-[10px] text-neutral-600">
            {done} of {total} milestones
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {data.milestones.map((m) => (
          <div key={m.id} className="group/row flex h-7 items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={m.done}
              aria-label={m.label || 'Milestone'}
              onClick={() => setMilestone(m.id, { done: !m.done })}
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] transition-colors ${
                m.done
                  ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-300'
                  : 'border-neutral-600 text-transparent hover:border-neutral-400'
              }`}
            >
              ✓
            </button>
            <input
              value={m.label}
              placeholder="Milestone…"
              aria-label="Milestone label"
              onChange={(e) => setMilestone(m.id, { label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addMilestone()
                }
              }}
              className={`gp-input--bare min-w-0 flex-1 text-[12px] outline-none placeholder:text-neutral-700 ${
                m.done ? 'text-neutral-600 line-through' : 'text-neutral-200'
              }`}
            />
            <button
              type="button"
              aria-label="Remove milestone"
              onClick={() => removeMilestone(m.id)}
              className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
            >
              <X size={10} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-auto flex h-7 shrink-0 items-center border-t gp-hairline">
        <button
          type="button"
          onClick={addMilestone}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add milestone
        </button>
      </div>
    </div>
  )
}
