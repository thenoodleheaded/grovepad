import { Minus, Plus } from 'lucide-react'
import type { StudyGoalData } from '../../../types/spatial'

interface StudyGoalWidgetProps {
  data: StudyGoalData
  onChange: (data: StudyGoalData) => void
}

/** Logged vs target study hours, with a live progress ring and ± loggers. */
export function StudyGoalWidget({ data, onChange }: StudyGoalWidgetProps) {
  const target = Math.max(0, data.targetHours)
  const logged = Math.max(0, data.loggedHours)
  const percent = target > 0 ? Math.min(100, Math.round((logged / target) * 100)) : 0
  const CIRC = 2 * Math.PI * 15

  const logHours = (delta: number) =>
    onChange({ ...data, loggedHours: Math.max(0, Math.round((logged + delta) * 2) / 2) })

  return (
    <div className="flex h-full flex-col gap-2">
      <input
        value={data.subject}
        placeholder="What are you studying?"
        aria-label="Study subject"
        onChange={(e) => onChange({ ...data, subject: e.target.value })}
        className="w-full shrink-0 bg-transparent text-[13px] font-medium text-neutral-200 outline-none placeholder:text-neutral-700"
      />

      <div className="flex flex-1 items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-neutral-800" />
            <circle
              cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - percent / 100)}
              className={percent >= 100 ? 'stroke-emerald-400' : 'stroke-green-400'}
              style={{ transition: 'stroke-dashoffset 300ms' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center  text-[11px] font-semibold tabular-nums text-neutral-200">
            {percent}%
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span className=" text-2xl font-bold tabular-nums text-neutral-100">{logged}</span>
            <span className=" text-sm text-neutral-600">/ {target}h</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Log −0.5 hours"
              onClick={() => logHours(-0.5)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border gp-hairline text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200 active:scale-95"
            >
              <Minus size={13} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Log +0.5 hours"
              onClick={() => logHours(0.5)}
              className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-400/20 active:scale-[0.98]"
            >
              <Plus size={12} aria-hidden />
              Log 30 min
            </button>
          </div>
        </div>
      </div>

      <label className="flex shrink-0 items-center justify-between text-[10px] text-neutral-600">
        Target hours
        <input
          type="number"
          min={0}
          value={data.targetHours}
          aria-label="Target hours"
          onChange={(e) => onChange({ ...data, targetHours: Math.max(0, Number(e.target.value) || 0) })}
          className="w-14 bg-transparent text-right  text-neutral-400 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </label>
    </div>
  )
}
