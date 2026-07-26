import { useState } from 'react'
import { Globe2, Plus, Search, X } from 'lucide-react'
import type { WorldClockData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import {
  ZONE_CHOICES,
  zoneLabel,
  zoneReading,
} from './timeSkinModel'

interface WorldClockWidgetProps {
  data: WorldClockData
  onChange: (data: WorldClockData) => void
}

/** A compact operations-board view of the user's working time zones. */
export function WorldClockWidget({ data, onChange }: WorldClockWidgetProps) {
  const now = new Date(useSharedClock(60_000, true, true))
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')

  const removeZone = (tz: string) =>
    onChange({ ...data, zones: data.zones.filter((zone) => zone !== tz) })
  const addZone = (tz: string) => {
    if (!data.zones.includes(tz)) onChange({ ...data, zones: [...data.zones, tz] })
    setPicking(false)
    setQuery('')
  }
  const available = ZONE_CHOICES.filter((zone) =>
    !data.zones.includes(zone.tz)
    && `${zone.label} ${zone.tz}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="gp-time-world">
      <header>
        <span><Globe2 size={13} /></span>
        <div><strong>World clock</strong><small>{data.zones.length} {data.zones.length === 1 ? 'city' : 'cities'} · synchronized now</small></div>
        <button type="button" aria-label="Add city" onClick={() => setPicking(true)}><Plus size={12} /></button>
      </header>

      <main className="gp-time-world-list">
        {data.zones.length === 0 ? (
          <button type="button" className="gp-time-world-empty" onClick={() => setPicking(true)}>
            <Globe2 size={20} /><strong>Add your first city</strong><span>Compare working hours at a glance.</span>
          </button>
        ) : data.zones.map((tz, index) => {
          const reading = zoneReading(tz, now)
          return (
            <article key={tz} data-primary={index === 0 || undefined}>
              <span className="gp-time-world-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="gp-time-world-place">
                <strong>{zoneLabel(tz)}</strong>
                <small>{reading.dateLabel} · {reading.offsetLabel}</small>
              </span>
              <span className="gp-time-world-reading">
                <strong>{reading.time}</strong>
                <small>{reading.dayDelta === 1 ? 'Tomorrow' : reading.dayDelta === -1 ? 'Yesterday' : 'Today'}</small>
              </span>
              <button type="button" aria-label={`Remove ${zoneLabel(tz)}`} onClick={() => removeZone(tz)}><X size={10} /></button>
            </article>
          )
        })}
      </main>

      {picking && (
        <section className="gp-time-zone-picker" aria-label="Choose a city">
          <header>
            <Search size={11} />
            <input
              autoFocus
              value={query}
              aria-label="Search cities"
              placeholder="Search cities or time zones"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="button" aria-label="Close city picker" onClick={() => setPicking(false)}><X size={11} /></button>
          </header>
          <div>
            {available.map((zone) => (
              <button type="button" key={zone.tz} onClick={() => addZone(zone.tz)}>
                <span>{zone.label}</span><small>{zone.tz.replaceAll('_', ' ')}</small>
              </button>
            ))}
            {available.length === 0 && <span>No matching cities</span>}
          </div>
        </section>
      )}
    </div>
  )
}
