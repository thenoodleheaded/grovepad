import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { WorldClockData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'

interface WorldClockWidgetProps {
  data: WorldClockData
  onChange: (data: WorldClockData) => void
}

/** A curated set keeps the picker simple; the list covers every populated region. */
const ZONE_CHOICES: Array<{ tz: string; label: string }> = [
  { tz: 'America/Los_Angeles', label: 'Los Angeles' },
  { tz: 'America/Denver', label: 'Denver' },
  { tz: 'America/Chicago', label: 'Chicago' },
  { tz: 'America/New_York', label: 'New York' },
  { tz: 'America/Sao_Paulo', label: 'São Paulo' },
  { tz: 'UTC', label: 'UTC' },
  { tz: 'Europe/London', label: 'London' },
  { tz: 'Europe/Paris', label: 'Paris' },
  { tz: 'Europe/Berlin', label: 'Berlin' },
  { tz: 'Europe/Moscow', label: 'Moscow' },
  { tz: 'Asia/Dubai', label: 'Dubai' },
  { tz: 'Asia/Karachi', label: 'Karachi' },
  { tz: 'Asia/Kolkata', label: 'Mumbai' },
  { tz: 'Asia/Shanghai', label: 'Shanghai' },
  { tz: 'Asia/Singapore', label: 'Singapore' },
  { tz: 'Asia/Tokyo', label: 'Tokyo' },
  { tz: 'Australia/Sydney', label: 'Sydney' },
  { tz: 'Pacific/Auckland', label: 'Auckland' },
]

function labelFor(tz: string): string {
  return ZONE_CHOICES.find((z) => z.tz === tz)?.label ?? tz.split('/').pop()!.replace(/_/g, ' ')
}

function timeIn(tz: string, now: Date): { time: string; dayDelta: string } {
  try {
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: tz,
    }).format(now)
    // en-CA yields sortable yyyy-mm-dd strings, so tomorrow/yesterday falls
    // out of a plain comparison — correct across month and year boundaries.
    const localDate = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short' }).format(now)
    const zoneDate = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: tz }).format(now)
    const dayDelta = zoneDate === localDate ? '' : zoneDate > localDate ? '+1' : '−1'
    return { time, dayDelta }
  } catch {
    return { time: '--:--', dayDelta: '' }
  }
}

/** Clocks around the world — updates once a minute, no per-frame cost. */
export function WorldClockWidget({ data, onChange }: WorldClockWidgetProps) {
  const now = new Date(useSharedClock(60_000, true, true))
  const [picking, setPicking] = useState(false)

  const removeZone = (tz: string) => onChange({ zones: data.zones.filter((z) => z !== tz) })
  const addZone = (tz: string) => {
    if (!data.zones.includes(tz)) onChange({ zones: [...data.zones, tz] })
    setPicking(false)
  }

  const available = ZONE_CHOICES.filter((z) => !data.zones.includes(z.tz))

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col">
        {data.zones.map((tz) => {
          const { time, dayDelta } = timeIn(tz, now)
          return (
            <div key={tz} className="group/row flex h-8 items-center gap-2 border-b gp-hairline last:border-0">
              <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-300">
                {labelFor(tz)}
              </span>
              {dayDelta && (
                <span className="shrink-0 font-mono text-[9px] text-neutral-600">{dayDelta}d</span>
              )}
              <span className="shrink-0 font-mono text-[14px] font-semibold tabular-nums text-neutral-100">
                {time}
              </span>
              <button
                type="button"
                aria-label={`Remove ${labelFor(tz)}`}
                onClick={() => removeZone(tz)}
                className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
              >
                <X size={10} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      {picking ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {available.map((z) => (
            <button
              key={z.tz}
              type="button"
              onClick={() => addZone(z.tz)}
              className="rounded-full border gp-hairline px-2 py-0.5 text-[10px] text-neutral-400 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
            >
              {z.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="rounded-full px-2 py-0.5 text-[10px] text-neutral-600 transition-colors hover:text-neutral-400"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-auto flex h-8 items-center border-t gp-hairline">
          <button
            type="button"
            disabled={available.length === 0}
            onClick={() => setPicking(true)}
            className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400 disabled:opacity-40"
          >
            <Plus size={11} aria-hidden />
            Add city
          </button>
        </div>
      )}
    </div>
  )
}
