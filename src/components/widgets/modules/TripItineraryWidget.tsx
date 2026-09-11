import {
  BedDouble,
  Bus,
  CalendarPlus,
  CalendarRange,
  Check,
  FileBadge,
  Landmark,
  Map,
  Plus,
  Route,
  TicketCheck,
  UtensilsCrossed,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type {
  TripDay,
  TripItineraryData,
  TripItinerarySkinMode,
  TripLeg,
} from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'
import {
  addTripDay,
  addTripLeg,
  bufferedLeaveBy,
  chronologicalTripLegs,
  dataWithTripLegDetails,
  legInvolvesPerson,
  orderedTripDays,
  removeTripDay,
  removeTripLeg,
  tripDayNumber,
  tripDays,
  tripItinerarySkinMode,
  tripLegCount,
  tripLegDetails,
  tripPeople,
  tripPhase,
  tripZoneGroups,
  unbookedTripLegs,
  TRIP_STOP_KINDS,
  type TripLegDetails,
  type TripStopKind,
} from './tripItinerarySkinModel'

interface TripItineraryWidgetProps {
  data: TripItineraryData
  onChange: (data: TripItineraryData) => void
}

const SKIN_COPY: Record<TripItinerarySkinMode, {
  eyebrow: string
  emptyTitle: string
  emptyHint: string
}> = {
  days: {
    eyebrow: 'Itinerary',
    emptyTitle: 'No days planned',
    emptyHint: 'Add a day, then fill it leg by leg — time, plan, place.',
  },
  timeline: {
    eyebrow: 'One line of travel',
    emptyTitle: 'The route is empty',
    emptyHint: 'Every leg lands on one continuous thread, day after day.',
  },
  bookings: {
    eyebrow: 'Booking desk',
    emptyTitle: 'Nothing to confirm',
    emptyHint: 'Legs that still need booking rise to the top with their gaps.',
  },
  offline: {
    eyebrow: 'Essentials sheet',
    emptyTitle: 'Nothing to carry',
    emptyHint: 'A dense read-only sheet of times, places, and codes.',
  },
  map: {
    eyebrow: 'Route by area',
    emptyTitle: 'No stops to place',
    emptyHint: 'File each stop under an area and the route clusters itself.',
  },
  group: {
    eyebrow: 'Travelling together',
    emptyTitle: 'No one is assigned',
    emptyHint: 'Give each leg an owner and companions, then filter by person.',
  },
  travel_day: {
    eyebrow: 'Transfer plan',
    emptyTitle: 'No transfers planned',
    emptyHint: 'Buffers, gates, documents, and local times for the heavy days.',
  },
}

const STOP_KIND_ICONS: Record<TripStopKind, ReactNode> = {
  sight: <Landmark size={9} aria-hidden />,
  food: <UtensilsCrossed size={9} aria-hidden />,
  stay: <BedDouble size={9} aria-hidden />,
  transit: <Bus size={9} aria-hidden />,
}

function skinIcon(skin: TripItinerarySkinMode, size = 11): ReactNode {
  if (skin === 'days') return <CalendarRange size={size} aria-hidden />
  if (skin === 'timeline') return <Route size={size} aria-hidden />
  if (skin === 'bookings') return <TicketCheck size={size} aria-hidden />
  if (skin === 'offline') return <WifiOff size={size} aria-hidden />
  if (skin === 'map') return <Map size={size} aria-hidden />
  if (skin === 'group') return <Users size={size} aria-hidden />
  return <FileBadge size={size} aria-hidden />
}

function dayHeading(day: TripDay, startDate: string): string {
  if (!day.date) return 'Undated day'
  const number = tripDayNumber(startDate, day.date)
  const words = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${day.date}T12:00:00`))
  return number === null || number < 1 ? words : `Day ${number} · ${words}`
}

function nextIn<T>(values: readonly T[], current: T): T {
  const index = values.indexOf(current)
  return values[(index + 1) % values.length] ?? values[0]!
}

export function TripItineraryWidget({ data, onChange }: TripItineraryWidgetProps) {
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set())
  const [person, setPerson] = useState('')
  const skin = tripItinerarySkinMode(data.skin)
  const days = tripDays(data.days)
  const ordered = orderedTripDays(days)
  const chronological = chronologicalTripLegs(days)
  const details = tripLegDetails(data, skin)
  const legCount = tripLegCount(days)
  const unbooked = unbookedTripLegs(days)
  const phase = tripPhase(data.startDate, days)
  const copy = SKIN_COPY[skin]

  const baseData = (): TripItineraryData => ({ ...data, skin, days })

  const patchLeg = (dayId: string, legId: string, patch: Partial<TripLeg>) => {
    onChange({
      ...baseData(),
      days: days.map((day) => (
        day.id === dayId
          ? { ...day, legs: day.legs.map((leg) => leg.id === legId ? { ...leg, ...patch } : leg) }
          : day
      )),
    })
  }

  const patchDetails = (legId: string, patch: Partial<TripLegDetails>) => {
    onChange(dataWithTripLegDetails(baseData(), skin, legId, patch))
  }

  const beginRemove = (id: string) => {
    setRemovingIds((previous) => new Set(previous).add(id))
  }

  const settleRemove = (id: string, next: TripItineraryData) => {
    setRemovingIds((previous) => {
      const set = new Set(previous)
      set.delete(id)
      return set
    })
    onChange(next)
  }

  const bookedToggle = (dayId: string, leg: TripLeg) => (
    <button
      type="button"
      data-booked={leg.booked}
      aria-label={leg.booked ? `${leg.what || 'Leg'} is booked` : `Mark ${leg.what || 'leg'} as booked`}
      title={leg.booked ? 'Booked — click to unbook' : 'Not booked yet'}
      onClick={() => patchLeg(dayId, leg.id, { booked: !leg.booked })}
      className="gp-trip-booked"
    >
      {leg.booked ? <Check size={9} aria-hidden /> : <span aria-hidden />}
    </button>
  )

  const removeLegButton = (leg: TripLeg) => (
    <button
      type="button"
      aria-label={`Remove ${leg.what || 'empty leg'}`}
      title="Remove leg"
      onClick={() => beginRemove(leg.id)}
      className="gp-trip-remove"
    >
      <X size={10} aria-hidden />
    </button>
  )

  const legRow = (
    dayId: string,
    leg: TripLeg,
    content: ReactNode,
    className = '',
    removable = true,
  ) => (
    <WidgetPanel
      key={leg.id}
      grip={false}
      floor="controls"
      removing={removingIds.has(leg.id)}
      onExitComplete={() => settleRemove(leg.id, removeTripLeg(baseData(), dayId, leg.id))}
      className={`gp-trip-row ${className}`.trim()}
    >
      {content}
      {removable && removeLegButton(leg)}
    </WidgetPanel>
  )

  const timeInput = (dayId: string, leg: TripLeg) => (
    <input
      type="time"
      value={leg.time}
      aria-label="Leg time"
      onChange={(event) => patchLeg(dayId, leg.id, { time: event.target.value })}
      className="gp-trip-time"
    />
  )

  const whatInput = (dayId: string, leg: TripLeg, placeholder = 'What happens') => (
    <input
      value={leg.what}
      aria-label="Leg activity"
      placeholder={placeholder}
      onChange={(event) => patchLeg(dayId, leg.id, { what: event.target.value })}
      className="gp-trip-what"
    />
  )

  const whereInput = (dayId: string, leg: TripLeg, placeholder = 'Where') => (
    <input
      value={leg.where}
      aria-label="Leg place"
      placeholder={placeholder}
      onChange={(event) => patchLeg(dayId, leg.id, { where: event.target.value })}
      className="gp-trip-where"
    />
  )

  const detailInput = (
    legId: string,
    key: 'zone' | 'who' | 'owner' | 'transfer' | 'document',
    label: string,
    placeholder: string,
  ) => (
    <label className="gp-trip-detail gp-bare-field">
      <span>{label}</span>
      <input
        value={details[legId]?.[key] ?? ''}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => patchDetails(legId, { [key]: event.target.value })}
      />
    </label>
  )

  const addDayButton = (
    <button
      type="button"
      onClick={() => onChange(addTripDay(baseData()))}
      title="Add the next day"
      className="gp-trip-add"
    >
      <CalendarPlus size={11} aria-hidden />
      Add day
    </button>
  )

  let content: ReactNode

  if (skin === 'timeline') {
    content = (
      <div className="gp-trip-list gp-trip-timeline">
        {chronological.map(({ day, leg }, index) => {
          const previous = chronological[index - 1]
          const newDay = !previous || previous.day.id !== day.id
          return (
            <div key={leg.id} className="gp-trip-thread">
              {newDay && (
                <header className="gp-trip-thread-day">
                  <i aria-hidden />
                  <strong>{dayHeading(day, data.startDate)}</strong>
                </header>
              )}
              {legRow(day.id, leg, (
                <>
                  <span className="gp-trip-dot" data-booked={leg.booked} aria-hidden />
                  {timeInput(day.id, leg)}
                  <div className="gp-trip-copy gp-bare-field">
                    {whatInput(day.id, leg)}
                    {whereInput(day.id, leg)}
                  </div>
                  {bookedToggle(day.id, leg)}
                </>
              ), 'gp-trip-timeline-row')}
            </div>
          )
        })}
      </div>
    )
  } else if (skin === 'bookings') {
    const confirmed = chronological.filter(({ leg }) => leg.booked)
    content = (
      <div className="gp-trip-list gp-trip-bookings">
        <section className="gp-trip-booking-block" data-tone={unbooked.length > 0 ? 'gap' : 'clear'}>
          <header>
            <strong>{unbooked.length > 0 ? 'Needs booking' : 'Nothing left to book'}</strong>
            {unbooked.length > 0 && <span>{unbooked.length}</span>}
          </header>
          {unbooked.map(({ day, leg }) => legRow(day.id, leg, (
            <>
              {bookedToggle(day.id, leg)}
              <div className="gp-trip-copy gp-bare-field">
                {whatInput(day.id, leg, 'What needs booking')}
                {whereInput(day.id, leg, 'Address or venue')}
              </div>
              <span className="gp-trip-when">{dayHeading(day, data.startDate)}</span>
            </>
          ), 'gp-trip-booking-row'))}
        </section>
        {confirmed.length > 0 && (
          <section className="gp-trip-booking-block" data-tone="confirmed">
            <header>
              <strong>Confirmed</strong>
              <span>{confirmed.length}</span>
            </header>
            {confirmed.map(({ day, leg }) => legRow(day.id, leg, (
              <>
                {bookedToggle(day.id, leg)}
                <div className="gp-trip-copy gp-bare-field">
                  {whatInput(day.id, leg)}
                  {whereInput(day.id, leg, 'Address or venue')}
                </div>
                <label className="gp-trip-code gp-bare-field">
                  <span className="gp-sr-only">Confirmation code</span>
                  <input
                    value={leg.confirmation}
                    aria-label="Confirmation code"
                    placeholder="Code"
                    onChange={(event) => patchLeg(day.id, leg.id, { confirmation: event.target.value })}
                  />
                </label>
              </>
            ), 'gp-trip-booking-row'))}
          </section>
        )}
      </div>
    )
  } else if (skin === 'offline') {
    content = (
      <div className="gp-trip-list gp-trip-offline">
        {ordered.map((day) => (
          <section key={day.id} className="gp-trip-offline-day">
            <header>{dayHeading(day, data.startDate)}</header>
            {[...day.legs].sort((a, b) => a.time.localeCompare(b.time)).map((leg) => (
              <div key={leg.id} className="gp-trip-offline-row">
                <span className="gp-trip-offline-time">{leg.time || '——:——'}</span>
                <span className="gp-trip-offline-what">
                  {leg.what || 'Unnamed leg'}
                  {leg.where && <i>{leg.where}</i>}
                </span>
                {leg.confirmation && <code>{leg.confirmation}</code>}
              </div>
            ))}
          </section>
        ))}
        <p className="gp-trip-offline-note">Read-only — edit in any other view.</p>
      </div>
    )
  } else if (skin === 'map') {
    content = (
      <div className="gp-trip-list gp-trip-map">
        {tripZoneGroups(days, details).map((group) => (
          <section key={group.zone} className="gp-trip-zone">
            <header>
              <i aria-hidden />
              <strong>{group.zone}</strong>
              <span>{group.legs.length} {group.legs.length === 1 ? 'stop' : 'stops'}</span>
            </header>
            <div className="gp-trip-zone-track">
              {group.legs.map(({ day, leg }) => {
                const kind = details[leg.id]?.kind ?? 'sight'
                return legRow(day.id, leg, (
                  <>
                    <button
                      type="button"
                      data-kind={kind}
                      aria-label={`Stop kind: ${kind}`}
                      title="Cycle stop kind"
                      onClick={() => patchDetails(leg.id, { kind: nextIn(TRIP_STOP_KINDS, kind) })}
                      className="gp-trip-kind"
                    >
                      {STOP_KIND_ICONS[kind]}
                    </button>
                    <div className="gp-trip-copy gp-bare-field">
                      {whatInput(day.id, leg, 'Stop')}
                    </div>
                    {detailInput(leg.id, 'zone', 'Area', 'Name an area')}
                  </>
                ), 'gp-trip-map-row')
              })}
            </div>
          </section>
        ))}
      </div>
    )
  } else if (skin === 'group') {
    const people = tripPeople(details)
    const visible = person
      ? chronological.filter(({ leg }) => legInvolvesPerson(details[leg.id], person))
      : chronological
    content = (
      <div className="gp-trip-list gp-trip-group">
        {people.length > 0 && (
          <div className="gp-trip-people" role="group" aria-label="Filter by person">
            <button
              type="button"
              data-active={person === ''}
              onClick={() => setPerson('')}
              className="gp-trip-person"
            >
              Everyone
            </button>
            {people.map((name) => (
              <button
                key={name}
                type="button"
                data-active={person === name}
                onClick={() => setPerson(person === name ? '' : name)}
                className="gp-trip-person"
              >
                <i aria-hidden>{name[0]?.toLocaleUpperCase()}</i>
                {name}
              </button>
            ))}
          </div>
        )}
        {visible.map(({ day, leg }) => legRow(day.id, leg, (
          <>
            {timeInput(day.id, leg)}
            <div className="gp-trip-copy gp-bare-field">
              {whatInput(day.id, leg)}
            </div>
            {detailInput(leg.id, 'owner', 'Owner', 'Who books it')}
            {detailInput(leg.id, 'who', 'With', 'Names')}
          </>
        ), 'gp-trip-group-row'))}
        {visible.length === 0 && legCount > 0 && (
          <p className="gp-trip-filter-empty">Nothing assigned to {person}.</p>
        )}
      </div>
    )
  } else if (skin === 'travel_day') {
    content = (
      <div className="gp-trip-list gp-trip-travel-day">
        {ordered.map((day) => day.legs.length > 0 && (
          <section key={day.id} className="gp-trip-day">
            <header className="gp-trip-day-head">
              <strong>{dayHeading(day, data.startDate)}</strong>
            </header>
            {[...day.legs].sort((a, b) => a.time.localeCompare(b.time)).map((leg) => {
              const detail = details[leg.id] ?? {}
              const leaveBy = bufferedLeaveBy(leg.time, detail.bufferMinutes ?? 0)
              return legRow(day.id, leg, (
                <>
                  <header className="gp-trip-transfer-head">
                    {timeInput(day.id, leg)}
                    {detail.localTime && (
                      <span className="gp-trip-local" title="Local time at destination">
                        {detail.localTime} local
                      </span>
                    )}
                    <div className="gp-trip-copy gp-bare-field">
                      {whatInput(day.id, leg, 'Transfer or leg')}
                    </div>
                    {leaveBy && (
                      <span className="gp-trip-leaveby" title={`Leave ${detail.bufferMinutes} minutes early`}>
                        leave {leaveBy}
                      </span>
                    )}
                    {bookedToggle(day.id, leg)}
                  </header>
                  <div className="gp-trip-transfer-grid">
                    {detailInput(leg.id, 'transfer', 'Transfer', 'Gate or pickup')}
                    <label className="gp-trip-detail gp-bare-field">
                      <span>Buffer (min)</span>
                      <input
                        type="number"
                        min={0}
                        value={detail.bufferMinutes ?? ''}
                        aria-label="Buffer minutes"
                        placeholder="0"
                        onChange={(event) => patchDetails(leg.id, {
                          bufferMinutes: Math.max(0, Number(event.target.value) || 0),
                        })}
                      />
                    </label>
                    {detailInput(leg.id, 'document', 'Document', 'Passport, visa')}
                    <label className="gp-trip-detail gp-bare-field">
                      <span>Local time</span>
                      <input
                        type="time"
                        value={detail.localTime ?? ''}
                        aria-label="Local time at destination"
                        onChange={(event) => patchDetails(leg.id, { localTime: event.target.value })}
                      />
                    </label>
                  </div>
                </>
              ), 'gp-trip-transfer-row')
            })}
          </section>
        ))}
      </div>
    )
  } else {
    content = (
      <div className="gp-trip-list gp-trip-days">
        {ordered.map((day) => (
          <section key={day.id} className="gp-trip-day">
            <header className="gp-trip-day-head">
              <strong>{dayHeading(day, data.startDate)}</strong>
              <input
                type="date"
                value={day.date}
                aria-label="Day date"
                onChange={(event) => onChange({
                  ...baseData(),
                  days: days.map((item) => item.id === day.id ? { ...item, date: event.target.value } : item),
                })}
                className="gp-trip-day-date"
              />
              <button
                type="button"
                aria-label={`Add a leg to ${dayHeading(day, data.startDate)}`}
                title="Add leg"
                onClick={() => onChange(addTripLeg(baseData(), day.id))}
                className="gp-trip-day-add"
              >
                <Plus size={10} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Remove ${dayHeading(day, data.startDate)}`}
                title="Remove day"
                onClick={() => beginRemove(day.id)}
                className="gp-trip-remove"
              >
                <X size={10} aria-hidden />
              </button>
            </header>
            <WidgetPanel
              grip={false}
              floor="controls"
              removing={removingIds.has(day.id)}
              onExitComplete={() => settleRemove(day.id, removeTripDay(baseData(), day.id))}
              className="gp-trip-day-track"
            >
              {[...day.legs].sort((a, b) => a.time.localeCompare(b.time)).map((leg) => legRow(day.id, leg, (
                <>
                  {timeInput(day.id, leg)}
                  <div className="gp-trip-copy gp-bare-field">
                    {whatInput(day.id, leg)}
                    {whereInput(day.id, leg)}
                  </div>
                  {bookedToggle(day.id, leg)}
                </>
              ), 'gp-trip-days-row'))}
              {day.legs.length === 0 && (
                <p className="gp-trip-day-empty">A free day, so far.</p>
              )}
            </WidgetPanel>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="gp-trip" data-trip-skin={skin}>
      <header className="gp-trip-header">
        <span className="gp-trip-eyebrow">
          {skinIcon(skin)}
          {copy.eyebrow}
        </span>
        {phase && (
          <span className="gp-trip-phase" data-tone={phase.tone}>
            {phase.label}
          </span>
        )}
        <span className="gp-trip-summary">
          <strong>{legCount}</strong>
          <span>{legCount === 1 ? 'leg' : 'legs'}</span>
          {unbooked.length > 0 && (
            <em title={`${unbooked.length} not booked yet`}>{unbooked.length} open</em>
          )}
        </span>
        <label className="gp-trip-start gp-bare-field">
          <span className="gp-sr-only">Trip start date</span>
          <input
            type="date"
            value={data.startDate}
            aria-label="Trip start date"
            onChange={(event) => onChange({ ...baseData(), startDate: event.target.value })}
          />
        </label>
      </header>

      {legCount > 0 || days.length > 0 ? content : (
        <div className="gp-trip-empty">
          <span aria-hidden>{skinIcon(skin, 15)}</span>
          <strong>{copy.emptyTitle}</strong>
          <span>{copy.emptyHint}</span>
        </div>
      )}

      {skin !== 'offline' && (
        <footer className="gp-trip-footer">
          {addDayButton}
        </footer>
      )}
    </div>
  )
}
