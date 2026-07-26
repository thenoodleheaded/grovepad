import { CalendarClock, CalendarDays, Flag } from 'lucide-react'
import type { CountdownData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { deadlineReading } from './timeSkinModel'

interface CountdownWidgetProps {
  data: CountdownData
  onChange: (data: CountdownData) => void
}

/** A deadline is a calendar horizon, not a short-duration dial. */
export function CountdownWidget({ data, onChange }: CountdownWidgetProps) {
  const now = new Date(useSharedClock(60_000, true, true))
  const reading = deadlineReading(data.targetDate, now)

  return (
    <div
      className="gp-time-deadline"
      data-overdue={reading.overdue || undefined}
      data-invalid={!reading.valid || undefined}
    >
      <header>
        <span><CalendarClock size={13} /></span>
        <label className="gp-bare-field">
          <small>Countdown to</small>
          <input
            value={data.label}
            placeholder="Name the moment"
            aria-label="Countdown label"
            onChange={(event) => onChange({ ...data, label: event.target.value })}
          />
        </label>
        <label className="gp-time-date-control gp-bare-field">
          <CalendarDays size={11} />
          <input
            type="date"
            value={data.targetDate}
            aria-label="Target date"
            onChange={(event) => onChange({ ...data, targetDate: event.target.value })}
          />
        </label>
      </header>

      <main aria-live="polite">
        <span className="gp-time-deadline-orbit" aria-hidden="true"><i /><i /><i /></span>
        <span className="gp-time-deadline-kicker">
          <Flag size={10} />
          {reading.valid ? reading.targetLabel : 'Date required'}
        </span>
        <strong>{reading.valid ? reading.days : '—'}<small>{reading.overdue ? 'days since' : 'days left'}</small></strong>
        <div>
          <span><b>{String(reading.hours).padStart(2, '0')}</b><small>Hours</small></span>
          <i>:</i>
          <span><b>{String(reading.minutes).padStart(2, '0')}</b><small>Minutes</small></span>
        </div>
      </main>

      <footer>
        <span><i />{reading.overdue ? 'Deadline passed' : reading.valid ? 'On the horizon' : 'Waiting for a date'}</span>
        <small>Updates every minute</small>
      </footer>
    </div>
  )
}
