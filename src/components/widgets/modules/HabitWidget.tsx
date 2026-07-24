import { Flame } from 'lucide-react'
import type { HabitData } from '../../../types/spatial'

interface HabitWidgetProps {
  data: HabitData
  onChange: (data: HabitData) => void
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** One habit, one week — tap the day dots to keep the streak alive. */
export function HabitWidget({ data, onChange }: HabitWidgetProps) {
  const days = data.days.length === 7 ? data.days : [...data.days, ...Array(7)].slice(0, 7).map(Boolean)
  const doneCount = days.filter(Boolean).length
  const toggleDay = (index: number) => {
    const next = days.map((done, i) => (i === index ? !done : done))
    onChange({ ...data, days: next, streak: next.filter(Boolean).length })
  }

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2">
        <input
          value={data.label}
          placeholder="Habit…"
          aria-label="Habit name"
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
        />
        <span

          className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5  text-[10px] tabular-nums transition-colors duration-300 ${
            doneCount >= 5
              ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
              : 'gp-hairline text-neutral-500'
          }`}
        >
          <Flame size={10} aria-hidden />
          {doneCount}/7
        </span>
      </div>

      <div className="relative flex items-center justify-between gap-1">
        {doneCount===7&&<span aria-hidden className="absolute left-[6%] right-[6%] top-[13px] h-0.5 bg-[color-mix(in_oklab,var(--gp-widget-accent),transparent_70%)] gp-route-reveal"/>}
        {days.map((done, index) => (
          <button
            key={index}
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={`Day ${index + 1}`}
            onClick={() => toggleDay(index)}
            className="gp-check-free flex flex-1 flex-col items-center gap-1"
          >
            <span className={`relative grid h-7 w-7 place-items-center rounded-full border border-white/[.08] bg-neutral-900/80 shadow-[inset_0_2px_5px_rgba(0,0,0,.5)] ${done?'border-[color-mix(in_oklab,var(--gp-widget-accent),transparent_60%)]':''}`}>
              {done&&<span aria-hidden className="h-[18px] w-[18px] rounded-full bg-[var(--gp-widget-accent)] opacity-85 shadow-[0_0_10px_color-mix(in_oklab,var(--gp-widget-accent),transparent_55%)]" style={{animation:'gp-check-pop 260ms cubic-bezier(0.16, 1, 0.3, 1)'}}/>}
            </span>
            <span className=" text-[9px] text-neutral-600">{DAY_LABELS[index]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
