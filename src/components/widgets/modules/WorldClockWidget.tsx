import { useState, type CSSProperties } from 'react'
import {
  ArrowLeftRight,
  CalendarClock,
  Globe2,
  Moon,
  Plus,
  Search,
  Sun,
  Sunrise,
  Sunset,
  X,
} from 'lucide-react'
import type { ModuleData, WorldClockData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { zoneLabel, zoneReading } from './timeSkinModel'
import {
  DEFAULT_WORKING_WINDOW,
  hourLabel,
  meetingPlannerState,
  meetingRows,
  overlapHours,
  sunReading,
  travelClockState,
  worldClockSkin,
  zoneBands,
  zoneClockFace,
  zoneHourFraction,
  zoneOffsetMinutes,
  zoneSuggestions,
  type WorkingWindow,
  type WorldClockSkin,
} from './worldClockSkinModel'

interface WorldClockWidgetProps {
  data: WorldClockData
  onChange: (data: WorldClockData) => void
  skin?: WorldClockSkin
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** Minutes ticks are pointless on a 60s clock; hours and minutes are enough. */
const CLOCK_TICKS = [0, 90, 180, 270]

function AnalogFace({
  hourAngle,
  minuteAngle,
  night,
  size = 'md',
}: {
  hourAngle: number
  minuteAngle: number
  night: boolean
  size?: 'md' | 'lg'
}) {
  return (
    <span
      className="gp-wclock-face"
      data-night={night || undefined}
      data-size={size}
      aria-hidden
    >
      <span className="gp-wclock-dial">
        {CLOCK_TICKS.map((angle) => (
          <i
            key={angle}
            className="gp-wclock-tick"
            style={{ '--gp-wclock-angle': `${angle}deg` } as CSSProperties}
          />
        ))}
        <i
          className="gp-wclock-hand gp-wclock-hand-hour"
          style={{ '--gp-wclock-angle': `${hourAngle}deg` } as CSSProperties}
        />
        <i
          className="gp-wclock-hand gp-wclock-hand-minute"
          style={{ '--gp-wclock-angle': `${minuteAngle}deg` } as CSSProperties}
        />
        <i className="gp-wclock-cap" />
      </span>
    </span>
  )
}

function WindowStepper({
  window: hours,
  onChange,
}: {
  window: WorkingWindow
  onChange: (next: WorkingWindow) => void
}) {
  return (
    <div className="gp-wclock-window" role="group" aria-label="Working hours">
      <label>
        <span>From</span>
        <select
          value={hours.start}
          aria-label="Working hours start"
          onChange={(event) => onChange({ ...hours, start: Number(event.target.value) })}
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>{hourLabel(hour)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>To</span>
        <select
          value={hours.end}
          aria-label="Working hours end"
          onChange={(event) => onChange({ ...hours, end: Number(event.target.value) })}
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>{hourLabel(hour)}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** A compact operations-board view of the user's working time zones. */
export function WorldClockWidget({
  data,
  onChange,
  skin: requestedSkin,
}: WorldClockWidgetProps) {
  const now = new Date(useSharedClock(60_000, true, true))
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  // Overlap Band and Meeting Planner are catalogued `renderer-ready`: they
  // restate the stored cities and must not add fields to the saved card, so
  // their controls stay session-local. Travel Clock is the schema-extension
  // skin, and its pairing is the one thing here that persists.
  const [workHours, setWorkHours] = useState<WorkingWindow>(DEFAULT_WORKING_WINDOW)
  const [plannerHour, setPlannerHour] = useState<number | null>(null)
  const skin = requestedSkin ?? worldClockSkin(data.skin)
  const zones = data.zones

  const base = (next: string[] = zones): WorldClockData => ({ ...data, zones: next, skin })
  const removeZone = (tz: string) => onChange(base(zones.filter((zone) => zone !== tz)))
  const addZone = (tz: string) => {
    if (!zones.includes(tz)) onChange(base([...zones, tz]))
    setPicking(false)
    setQuery('')
  }
  const writeSkinState = (value: string, state: Record<string, unknown>) =>
    onChange(dataWithSkinState(base() as ModuleData, value, state) as WorldClockData)

  const available = zoneSuggestions(zones, query)

  const removeButton = (tz: string) => (
    <button
      type="button"
      className="gp-wclock-remove"
      aria-label={`Remove ${zoneLabel(tz)}`}
      onClick={() => removeZone(tz)}
    >
      <X size={10} aria-hidden />
    </button>
  )

  const empty = (
    <button type="button" className="gp-wclock-empty" onClick={() => setPicking(true)}>
      <Globe2 size={20} aria-hidden />
      <strong>Add your first city</strong>
      <span>Compare working hours at a glance.</span>
    </button>
  )

  let subtitle = `${zones.length} ${zones.length === 1 ? 'city' : 'cities'}`
  let body: React.ReactNode = null

  if (zones.length === 0) {
    body = empty
  } else if (skin === 'analog_wall') {
    subtitle = `${subtitle} · analog wall`
    body = (
      <div className="gp-wclock-wall">
        {zones.map((tz) => {
          const face = zoneClockFace(tz, now)
          const reading = zoneReading(tz, now)
          return (
            <article key={tz} className="gp-wclock-wall-item" data-night={face.night || undefined}>
              <AnalogFace
                hourAngle={face.hourAngle}
                minuteAngle={face.minuteAngle}
                night={face.night}
              />
              <strong>{face.label}</strong>
              <small>
                <span className="gp-wclock-tabular">{reading.time}</span>
                <em>{reading.offsetLabel}</em>
              </small>
              {removeButton(tz)}
            </article>
          )
        })}
      </div>
    )
  } else if (skin === 'overlap_band') {
    const state = { window: workHours }
    const bands = zoneBands(zones, now, state.window)
    const shared = overlapHours(bands)
    const sharedSet = new Set(shared)
    const referenceHour = Math.floor(zoneHourFraction(zones[0]!, now))
    subtitle = shared.length > 0
      ? `${shared.length} shared ${shared.length === 1 ? 'hour' : 'hours'}`
      : 'No shared hours'
    body = (
      <div className="gp-wclock-overlap">
        <WindowStepper window={state.window} onChange={setWorkHours} />
        <div className="gp-wclock-band-scroll" data-floor-overflow="scroll">
          <div className="gp-wclock-band-grid">
            <div className="gp-wclock-band-ruler" aria-hidden>
              {HOURS.map((hour) => (
                <span
                  key={hour}
                  data-shared={sharedSet.has(hour) || undefined}
                  data-now={hour === referenceHour || undefined}
                >
                  {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
                </span>
              ))}
            </div>
            {bands.map((band) => (
              <div key={band.tz} className="gp-wclock-band-row">
                <span className="gp-wclock-band-label">
                  <strong>{band.label}</strong>
                  <small>{band.shift === 0 ? 'reference' : `${band.shift > 0 ? '+' : ''}${band.shift}h`}</small>
                </span>
                <span className="gp-wclock-band-track">
                  {HOURS.map((hour) => (
                    <i
                      key={hour}
                      data-working={band.working[hour] || undefined}
                      data-shared={sharedSet.has(hour) || undefined}
                      data-now={hour === referenceHour || undefined}
                      title={`${band.label} ${hourLabel(band.localHours[hour]!)}`}
                    />
                  ))}
                </span>
                {removeButton(band.tz)}
              </div>
            ))}
          </div>
        </div>
        <p className="gp-wclock-note">
          {shared.length > 0
            ? <>Everyone is free <strong>{hourLabel(shared[0]!)}–{hourLabel(shared[shared.length - 1]! + 1)}</strong> in {zoneLabel(zones[0]!)}.</>
            : <>No hour suits every city. Widen the working window to find one.</>}
        </p>
      </div>
    )
  } else if (skin === 'meeting_planner') {
    // An untouched planner opens on the reference city's current hour; once
    // the user scrubs, their choice holds for the rest of the session.
    const state = meetingPlannerState(
      { hour: plannerHour ?? undefined, window: workHours },
      now,
      zones[0],
    )
    const rows = meetingRows(zones, now, state.hour, state.window)
    const comfortable = rows.filter((row) => row.comfortable).length
    subtitle = `${comfortable}/${rows.length} in working hours`
    body = (
      <div className="gp-wclock-planner">
        <div className="gp-wclock-scrub">
          <label htmlFor="gp-wclock-hour">
            <CalendarClock size={12} aria-hidden />
            <span>Meet at</span>
            <strong className="gp-wclock-tabular">{hourLabel(state.hour)}</strong>
            <em>{zoneLabel(zones[0]!)}</em>
          </label>
          <input
            id="gp-wclock-hour"
            type="range"
            min={0}
            max={23}
            step={1}
            value={state.hour}
            aria-label={`Meeting hour in ${zoneLabel(zones[0]!)}`}
            aria-valuetext={hourLabel(state.hour)}
            onChange={(event) => setPlannerHour(Number(event.target.value))}
          />
        </div>
        <div className="gp-wclock-planner-rows">
          {rows.map((row) => (
            <article
              key={row.tz}
              className="gp-wclock-planner-row"
              data-verdict={row.comfortable ? 'good' : row.tolerable ? 'edge' : 'asleep'}
            >
              <span className="gp-wclock-planner-place">
                <strong>{row.label}</strong>
                <small>
                  {row.dayDelta === 1 ? 'Next day' : row.dayDelta === -1 ? 'Previous day' : 'Same day'}
                </small>
              </span>
              <span className="gp-wclock-tabular gp-wclock-planner-time">
                {hourLabel(row.localHour)}
              </span>
              <span className="gp-wclock-verdict">
                {row.comfortable ? 'Working hours' : row.tolerable ? 'Outside hours' : 'Asleep'}
              </span>
              {removeButton(row.tz)}
            </article>
          ))}
        </div>
        <WindowStepper window={state.window} onChange={setWorkHours} />
      </div>
    )
  } else if (skin === 'travel_clock') {
    const pairing = travelClockState(skinStateFor(data, 'travel_clock'), zones, now)
    const homeFace = zoneClockFace(pairing.home, now)
    const awayFace = zoneClockFace(pairing.away, now)
    const homeReading = zoneReading(pairing.home, now)
    const awayReading = zoneReading(pairing.away, now)
    subtitle = pairing.shift === 0
      ? 'Same hour in both cities'
      : `${pairing.shift > 0 ? '+' : ''}${pairing.shift}h on arrival`
    const picker = (which: 'home' | 'away', value: string) => (
      <select
        value={value}
        aria-label={which === 'home' ? 'Home city' : 'Destination city'}
        onChange={(event) => writeSkinState('travel_clock', {
          ...pairing,
          [which]: event.target.value,
        })}
      >
        {zones.map((tz) => (
          <option key={tz} value={tz}>{zoneLabel(tz)}</option>
        ))}
      </select>
    )
    body = (
      <div className="gp-wclock-travel">
        <article className="gp-wclock-travel-side" data-role="home">
          <header><span>Home</span>{picker('home', pairing.home)}</header>
          <AnalogFace
            hourAngle={homeFace.hourAngle}
            minuteAngle={homeFace.minuteAngle}
            night={homeFace.night}
            size="lg"
          />
          <strong className="gp-wclock-tabular">{homeReading.time}</strong>
          <small>{homeReading.dateLabel}</small>
        </article>
        <div className="gp-wclock-travel-shift" aria-hidden>
          <ArrowLeftRight size={13} />
          <strong>{pairing.shift > 0 ? `+${pairing.shift}` : pairing.shift}h</strong>
        </div>
        <article className="gp-wclock-travel-side" data-role="away">
          <header><span>Destination</span>{picker('away', pairing.away)}</header>
          <AnalogFace
            hourAngle={awayFace.hourAngle}
            minuteAngle={awayFace.minuteAngle}
            night={awayFace.night}
            size="lg"
          />
          <strong className="gp-wclock-tabular">{awayReading.time}</strong>
          <small>{awayReading.dateLabel}</small>
        </article>
      </div>
    )
  } else if (skin === 'sunlight') {
    const lit = zones.filter((tz) => sunReading(tz, now).daylight).length
    subtitle = `${lit} of ${zones.length} in daylight`
    body = (
      <div className="gp-wclock-sun">
        {zones.map((tz) => {
          const sun = sunReading(tz, now)
          const reading = zoneReading(tz, now)
          return (
            <article key={tz} className="gp-wclock-sun-row" data-daylight={sun.daylight || undefined}>
              <span className="gp-wclock-sun-place">
                <strong>{sun.label}</strong>
                <small className="gp-wclock-tabular">{reading.time}</small>
              </span>
              <span
                className="gp-wclock-sun-track"
                style={{
                  '--gp-wclock-day-start': `${(sun.sunrise / 24) * 100}%`,
                  '--gp-wclock-day-width': `${((sun.sunset - sun.sunrise) / 24) * 100}%`,
                  '--gp-wclock-sun-at': `${(sun.hourFraction / 24) * 100}%`,
                } as CSSProperties}
              >
                <i className="gp-wclock-sun-day" aria-hidden />
                <i className="gp-wclock-sun-marker" aria-hidden>
                  {sun.daylight ? <Sun size={9} /> : <Moon size={9} />}
                </i>
              </span>
              <span className="gp-wclock-sun-edges" aria-hidden>
                <em><Sunrise size={10} />{hourLabel(sun.sunrise)}</em>
                <em><Sunset size={10} />{hourLabel(sun.sunset)}</em>
              </span>
              {removeButton(tz)}
            </article>
          )
        })}
        <p className="gp-wclock-note">
          Daylight is shown as a civil 06:00–18:00 day. Use Sun Window for true sunrise times.
        </p>
      </div>
    )
  } else {
    subtitle = `${subtitle} · synchronized now`
    body = (
      <div className="gp-wclock-grid">
        {zones.map((tz, index) => {
          const reading = zoneReading(tz, now)
          const face = zoneClockFace(tz, now)
          const offset = zoneOffsetMinutes(tz, now)
          return (
            <article
              key={tz}
              className="gp-wclock-tile"
              data-primary={index === 0 || undefined}
              data-night={face.night || undefined}
            >
              <header>
                <strong>{zoneLabel(tz)}</strong>
                {face.night ? <Moon size={11} aria-label="Night" /> : <Sun size={11} aria-label="Daytime" />}
              </header>
              <strong className="gp-wclock-tabular gp-wclock-tile-time">{reading.time}</strong>
              <footer>
                <span>{reading.dateLabel}</span>
                <em>{offset === 0 ? 'UTC' : reading.offsetLabel}</em>
              </footer>
              {reading.dayDelta !== 0 && (
                <span className="gp-wclock-daybadge">
                  {reading.dayDelta === 1 ? 'Tomorrow' : 'Yesterday'}
                </span>
              )}
              {removeButton(tz)}
            </article>
          )
        })}
      </div>
    )
  }

  return (
    <div className="gp-wclock" data-world-clock-skin={skin}>
      <header className="gp-wclock-header">
        <span className="gp-wclock-badge"><Globe2 size={13} aria-hidden /></span>
        <div>
          <strong>World clock</strong>
          <small>{subtitle}</small>
        </div>
        <button type="button" aria-label="Add city" onClick={() => setPicking(true)}>
          <Plus size={12} aria-hidden />
        </button>
      </header>

      <main className="gp-wclock-body">{body}</main>

      {picking && (
        <section className="gp-wclock-picker" aria-label="Choose a city">
          <header>
            <Search size={11} aria-hidden />
            <input
              autoFocus
              value={query}
              aria-label="Search cities"
              placeholder="Search cities or time zones"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="button" aria-label="Close city picker" onClick={() => setPicking(false)}>
              <X size={11} aria-hidden />
            </button>
          </header>
          <div data-floor-overflow="scroll">
            {available.map((zone) => (
              <button type="button" key={zone.tz} onClick={() => addZone(zone.tz)}>
                <span>{zone.label}</span>
                <small>{zone.tz.replaceAll('_', ' ')}</small>
              </button>
            ))}
            {available.length === 0 && <span className="gp-wclock-picker-empty">No matching cities</span>}
          </div>
        </section>
      )}
    </div>
  )
}
