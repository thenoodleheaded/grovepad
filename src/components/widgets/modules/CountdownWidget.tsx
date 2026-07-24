import { CalendarClock } from 'lucide-react'
import type { CountdownData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { SplitWell } from '../instruments/GlassInstrumentParts'

interface CountdownWidgetProps {
  data: CountdownData
  onChange: (data: CountdownData) => void
}

const MS_PER_DAY = 86_400_000

/** Days-remaining readout for a target date. Turns red once overdue. */
export function CountdownWidget({ data, onChange }: CountdownWidgetProps) {
  const target = new Date(`${data.targetDate}T00:00:00`)
  const now = useSharedClock(60_000, true, true)
  const valid = !Number.isNaN(target.getTime())
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysLeft = valid ? Math.round((target.getTime() - today.getTime()) / MS_PER_DAY) : 0
  const overdue = valid && daysLeft < 0
  const remaining=Math.max(0,target.getTime()-now)
  const hours=Math.floor(remaining/3_600_000)%24
  const minutes=Math.floor(remaining/60_000)%60
  const tone=daysLeft<1?'rose':daysLeft<7?'amber':'accent'
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center gap-2">
        <input
          value={data.label}
          placeholder="What's the deadline?"
          aria-label="Countdown label"
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="w-full bg-transparent text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
        />
        <label className="flex items-center gap-1.5 text-neutral-500">
          <CalendarClock size={12} className="shrink-0" aria-hidden />
          <input
            type="date"
            value={data.targetDate}
            aria-label="Target date"
            onChange={(e) => onChange({ ...data, targetDate: e.target.value })}
            className="w-full bg-transparent  text-[11px] text-neutral-400 outline-none [color-scheme:dark]"
          />
        </label>
      </div>
      <div aria-live="polite" aria-label={overdue?'Elapsed':`${daysLeft} days, ${hours} hours left`} className="grid grid-cols-3 gap-2">
        {overdue?<div className="col-span-3"><SplitWell value="--" label="ELAPSED" tone="rose"/></div>:<><SplitWell value={daysLeft} label="DAYS" tone={tone}/><SplitWell value={hours} label="HRS" tone={tone}/><SplitWell value={minutes} label="MIN" tone={tone}/></>}
      </div>
    </div>
  )
}
