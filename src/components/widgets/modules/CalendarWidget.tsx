import {
  CakeSlice,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  ListChecks,
  Moon,
  Plus,
  Sun,
  Sunset,
  Trash2,
  Users,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { CalendarData, ModuleData } from '../../../types/spatial'
import { localDayKey } from '../../../utils/localDate'
import { dataWithSkinState, skinStateFor, type WidgetSkinState } from '../../../utils/widgetSkins'
import {
  addCalendarDays,
  anchorForMonth,
  availabilityState,
  calendarMonthGrid,
  calendarSkin,
  dateFromDayKey,
  nextShift,
  occasionState,
  shiftRotaState,
  weekDayKeys,
  type AvailabilitySlot,
  type CalendarOccasion,
  type CalendarSkin,
  type OccasionKind,
} from './calendarSkinModel'

interface CalendarWidgetProps {
  data: CalendarData
  onChange: (data: CalendarData) => void
  skin?: CalendarSkin
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LONG_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const AVAILABILITY_PERIODS: Array<{
  value: AvailabilitySlot
  label: string
  short: string
  icon: typeof Sun
}> = [
  { value: 'morning', label: 'Morning', short: 'AM', icon: Sun },
  { value: 'afternoon', label: 'Afternoon', short: 'PM', icon: Sunset },
  { value: 'evening', label: 'Evening', short: 'Eve', icon: Moon },
]

function dateLabel(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = dateFromDayKey(iso)
  return date ? new Intl.DateTimeFormat(undefined, options).format(date) : iso
}

function sameMonthData(data: CalendarData, iso: string): Pick<CalendarData, 'year' | 'month'> {
  const date = dateFromDayKey(iso)
  return date
    ? { year: date.getFullYear(), month: date.getMonth() }
    : { year: data.year, month: data.month }
}

function occasionDateLabel(date: string): string {
  return dateLabel(`2000-${date}`, { month: 'short', day: 'numeric' })
}

/** Seven purposeful calendar tools sharing one marked-date core. */
export function CalendarWidget({
  data,
  onChange,
  skin: requestedSkin,
}: CalendarWidgetProps) {
  const painting = useRef<boolean | null>(null)
  const todayIso = localDayKey()
  const [agendaDraft, setAgendaDraft] = useState(todayIso)
  const [occasionName, setOccasionName] = useState('')
  const [occasionDate, setOccasionDate] = useState(todayIso)
  const [occasionKind, setOccasionKind] = useState<OccasionKind>('birthday')
  const skin = requestedSkin ?? calendarSkin(data.skin)
  const marked = new Set(data.markedDates.filter((iso) => dateFromDayKey(iso)))
  const fallbackAnchor = anchorForMonth(data.year, data.month, todayIso)

  const baseData = (patch: Partial<CalendarData> = {}): CalendarData => ({
    ...data,
    ...patch,
    skin,
  })

  const updateSkinState = (
    value: CalendarSkin,
    state: WidgetSkinState,
    patch: Partial<CalendarData> = {},
  ) => {
    onChange(dataWithSkinState(
      baseData(patch) as ModuleData,
      value,
      state,
    ) as CalendarData)
  }

  const setMarked = (next: Iterable<string>) => {
    onChange(baseData({ markedDates: [...new Set(next)].sort() }))
  }

  const toggleMarked = (iso: string) => {
    if (marked.has(iso)) {
      setMarked(data.markedDates.filter((date) => date !== iso))
    } else {
      setMarked([...data.markedDates, iso])
    }
  }

  const paintDay = (iso: string, value: boolean) => {
    if (marked.has(iso) === value) return
    setMarked(value
      ? [...data.markedDates, iso]
      : data.markedDates.filter((date) => date !== iso))
  }

  const shiftMonth = (delta: number) => {
    const next = new Date(data.year, data.month + delta, 1, 12)
    onChange(baseData({ year: next.getFullYear(), month: next.getMonth() }))
  }

  const monthHeader = (
    label: string,
    previous: () => void,
    next: () => void,
    hint?: string,
  ) => (
    <header className="gp-calendar-heading">
      <button type="button" aria-label="Previous period" onClick={previous}>
        <ChevronLeft size={13} aria-hidden />
      </button>
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" aria-label="Next period" onClick={next}>
        <ChevronRight size={13} aria-hidden />
      </button>
    </header>
  )

  let content: React.ReactNode

  if (skin === 'week') {
    const raw = skinStateFor(data, 'week')
    const anchor = typeof raw.anchorDate === 'string' && dateFromDayKey(raw.anchorDate)
      ? raw.anchorDate
      : fallbackAnchor
    const days = weekDayKeys(anchor)
    const setAnchor = (iso: string) => {
      updateSkinState('week', { anchorDate: iso }, sameMonthData(data, iso))
    }
    const rangeLabel = `${dateLabel(days[0]!, { month: 'short', day: 'numeric' })} – ${dateLabel(days[6]!, { month: 'short', day: 'numeric' })}`
    content = (
      <div className="gp-calendar-week">
        {monthHeader(
          rangeLabel,
          () => setAnchor(addCalendarDays(anchor, -7)),
          () => setAnchor(addCalendarDays(anchor, 7)),
          `${marked.size} marked`,
        )}
        <div className="gp-calendar-week-grid">
          {days.map((iso, index) => {
            const active = marked.has(iso)
            const isToday = iso === todayIso
            return (
              <button
                key={iso}
                type="button"
                aria-label={`${active ? 'Unmark' : 'Mark'} ${iso}`}
                aria-pressed={active}
                className="gp-calendar-week-lane"
                data-marked={active || undefined}
                data-today={isToday || undefined}
                onClick={() => toggleMarked(iso)}
              >
                <span className="gp-calendar-week-day">{LONG_DAY_LABELS[index]}</span>
                <strong>{dateFromDayKey(iso)?.getDate()}</strong>
                <span className="gp-calendar-all-day">{active ? 'Marked' : 'Open'}</span>
                <span className="gp-calendar-time-rail" aria-hidden>
                  <i style={{ '--gp-time': 0.16 } as React.CSSProperties}>9</i>
                  <i style={{ '--gp-time': 0.5 } as React.CSSProperties}>13</i>
                  <i style={{ '--gp-time': 0.82 } as React.CSSProperties}>17</i>
                  {active && <b />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  } else if (skin === 'agenda') {
    const dates = [...marked].sort()
    const upcoming = dates.filter((iso) => iso >= todayIso)
    const earlier = dates.filter((iso) => iso < todayIso).reverse()
    const agendaDates = [...upcoming, ...earlier]
    const addAgendaDate = () => {
      if (!dateFromDayKey(agendaDraft) || marked.has(agendaDraft)) return
      setMarked([...data.markedDates, agendaDraft])
    }
    content = (
      <div className="gp-calendar-agenda">
        <header className="gp-calendar-section-heading">
          <span><ListChecks size={13} aria-hidden /> Upcoming agenda</span>
          <small>{dates.length} dates</small>
        </header>
        <div className="gp-calendar-agenda-add">
          <input
            type="date"
            aria-label="Agenda date"
            value={agendaDraft}
            onChange={(event) => setAgendaDraft(event.target.value)}
          />
          <button type="button" onClick={addAgendaDate} disabled={marked.has(agendaDraft)}>
            <Plus size={12} aria-hidden /> Add
          </button>
        </div>
        <div className="gp-calendar-agenda-list" data-floor-overflow="scroll">
          {agendaDates.length === 0 ? (
            <div className="gp-calendar-empty">
              <CalendarDays size={20} aria-hidden />
              <strong>Your agenda is clear</strong>
              <span>Add a date above or mark one in Month.</span>
            </div>
          ) : agendaDates.map((iso, index) => {
            const month = dateLabel(iso, { month: 'short' })
            const day = dateFromDayKey(iso)?.getDate()
            const relative = iso === todayIso
              ? 'Today'
              : iso > todayIso
                ? dateLabel(iso, { weekday: 'long' })
                : 'Earlier'
            return (
              <article key={iso} className="gp-calendar-agenda-row" data-past={iso < todayIso || undefined}>
                <time dateTime={iso}>
                  <span>{month}</span>
                  <strong>{day}</strong>
                </time>
                <span>
                  <strong>{relative}</strong>
                  <small>{dateLabel(iso, { year: 'numeric', month: 'long', day: 'numeric' })}</small>
                </span>
                <button type="button" aria-label={`Remove ${iso} from agenda`} onClick={() => toggleMarked(iso)}>
                  <Trash2 size={11} aria-hidden />
                </button>
                {index < agendaDates.length - 1 && <i aria-hidden />}
              </article>
            )
          })}
        </div>
      </div>
    )
  } else if (skin === 'year_heatmap') {
    const yearMarked = data.markedDates.filter((iso) => iso.startsWith(`${data.year}-`))
    content = (
      <div className="gp-calendar-year">
        {monthHeader(
          String(data.year),
          () => onChange(baseData({ year: data.year - 1 })),
          () => onChange(baseData({ year: data.year + 1 })),
          `${yearMarked.length} active days`,
        )}
        <div className="gp-calendar-year-grid">
          {MONTH_NAMES.map((name, month) => (
            <section key={name} className="gp-calendar-mini-month" aria-label={`${name} ${data.year}`}>
              <strong>{name.slice(0, 3)}</strong>
              <div>
                {calendarMonthGrid(data.year, month).map((cell) => {
                  const active = marked.has(cell.iso)
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      tabIndex={cell.inMonth ? 0 : -1}
                      disabled={!cell.inMonth}
                      aria-label={cell.inMonth ? `${active ? 'Unmark' : 'Mark'} ${cell.iso}` : undefined}
                      aria-pressed={cell.inMonth ? active : undefined}
                      data-level={active ? 'marked' : cell.iso === todayIso ? 'today' : undefined}
                      onClick={() => cell.inMonth && toggleMarked(cell.iso)}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        <footer className="gp-calendar-heat-legend">
          <span>Quiet</span><i /><i /><i data-active /><span>Marked</span>
        </footer>
      </div>
    )
  } else if (skin === 'availability') {
    const availability = availabilityState(
      skinStateFor(data, 'availability'),
      fallbackAnchor,
    )
    const days = weekDayKeys(availability.anchorDate)
    const busyCount = Object.values(availability.busy).reduce((total, slots) => total + slots.length, 0)
    const commitAvailability = (
      next: typeof availability,
      visibleDate = next.anchorDate,
    ) => updateSkinState('availability', { ...next }, sameMonthData(data, visibleDate))
    const toggleSlot = (iso: string, slot: AvailabilitySlot) => {
      const slots = new Set(availability.busy[iso] ?? [])
      if (slots.has(slot)) slots.delete(slot)
      else slots.add(slot)
      const busy = { ...availability.busy }
      if (slots.size > 0) busy[iso] = [...slots]
      else delete busy[iso]
      commitAvailability({ ...availability, busy })
    }
    content = (
      <div className="gp-calendar-availability">
        {monthHeader(
          'Availability',
          () => commitAvailability({ ...availability, anchorDate: addCalendarDays(availability.anchorDate, -7) }),
          () => commitAvailability({ ...availability, anchorDate: addCalendarDays(availability.anchorDate, 7) }),
          `${busyCount} busy blocks`,
        )}
        <div className="gp-calendar-availability-key" aria-hidden>
          <span>Free</span><i /><span>Busy</span><i data-busy />
        </div>
        <div className="gp-calendar-availability-grid">
          <span />
          {days.map((iso, index) => (
            <time key={iso} dateTime={iso} data-today={iso === todayIso || undefined}>
              <span>{LONG_DAY_LABELS[index]}</span>
              <strong>{dateFromDayKey(iso)?.getDate()}</strong>
            </time>
          ))}
          {AVAILABILITY_PERIODS.map(({ value, label, short, icon: Icon }) => (
            <div key={value} className="gp-calendar-availability-row">
              <span title={label}><Icon size={11} aria-hidden /> {short}</span>
              {days.map((iso) => {
                const busy = availability.busy[iso]?.includes(value) ?? false
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-label={`${busy ? 'Make' : 'Mark'} ${iso} ${label.toLowerCase()} ${busy ? 'free' : 'busy'}`}
                    aria-pressed={busy}
                    data-busy={busy || undefined}
                    onClick={() => toggleSlot(iso, value)}
                  >
                    <span>{busy ? 'Busy' : 'Free'}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <p className="gp-calendar-tip">Tap blocks to share when you’re free.</p>
      </div>
    )
  } else if (skin === 'shift_rota') {
    const rota = shiftRotaState(skinStateFor(data, 'shift_rota'), fallbackAnchor)
    const days = weekDayKeys(rota.anchorDate)
    const commitRota = (next: typeof rota) => {
      updateSkinState('shift_rota', { ...next }, sameMonthData(data, next.anchorDate))
    }
    content = (
      <div className="gp-calendar-rota">
        {monthHeader(
          'Shift rota',
          () => commitRota({ ...rota, anchorDate: addCalendarDays(rota.anchorDate, -7) }),
          () => commitRota({ ...rota, anchorDate: addCalendarDays(rota.anchorDate, 7) }),
          dateLabel(days[0]!, { month: 'short', day: 'numeric' }),
        )}
        <div className="gp-calendar-rota-person">
          <span><Users size={12} aria-hidden /></span>
          <input
            value={rota.assignee}
            aria-label="Assignee"
            placeholder="Team member"
            onChange={(event) => commitRota({ ...rota, assignee: event.target.value })}
          />
          <input
            value={rota.role}
            aria-label="Role"
            placeholder="Role"
            onChange={(event) => commitRota({ ...rota, role: event.target.value })}
          />
        </div>
        <div className="gp-calendar-rota-grid">
          {days.map((iso, index) => {
            const shift = rota.shifts[iso] ?? 'off'
            return (
              <button
                key={iso}
                type="button"
                aria-label={`${LONG_DAY_LABELS[index]} ${iso}: ${shift}. Change shift`}
                className="gp-calendar-rota-day"
                data-shift={shift}
                onClick={() => commitRota({
                  ...rota,
                  shifts: { ...rota.shifts, [iso]: nextShift(shift) },
                })}
              >
                <time dateTime={iso}>
                  <span>{LONG_DAY_LABELS[index]}</span>
                  <strong>{dateFromDayKey(iso)?.getDate()}</strong>
                </time>
                <i aria-hidden />
                <span>{shift === 'off' ? 'Off' : shift}</span>
                <small>
                  {shift === 'morning' ? '07–15'
                    : shift === 'evening' ? '15–23'
                      : shift === 'night' ? '23–07' : '—'}
                </small>
              </button>
            )
          })}
        </div>
        <p className="gp-calendar-tip">Tap a day to cycle Morning, Evening, Night, and Off.</p>
      </div>
    )
  } else if (skin === 'birthday_and_anniversary') {
    const state = occasionState(skinStateFor(data, 'birthday_and_anniversary'))
    const sorted = [...state.occasions].sort((left, right) => left.date.localeCompare(right.date))
    const commitOccasions = (occasions: CalendarOccasion[]) => {
      updateSkinState('birthday_and_anniversary', { occasions })
    }
    const addOccasion = () => {
      if (!occasionName.trim() || !dateFromDayKey(occasionDate)) return
      commitOccasions([
        ...state.occasions,
        {
          id: crypto.randomUUID(),
          name: occasionName.trim(),
          date: occasionDate.slice(5),
          kind: occasionKind,
        },
      ])
      setOccasionName('')
    }
    content = (
      <div className="gp-calendar-occasions">
        <header className="gp-calendar-section-heading">
          <span><CakeSlice size={13} aria-hidden /> Celebrations</span>
          <small>{state.occasions.length} recurring</small>
        </header>
        <div className="gp-calendar-occasion-form">
          <input
            value={occasionName}
            aria-label="Person or couple"
            placeholder="Name"
            onChange={(event) => setOccasionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addOccasion()
              }
            }}
          />
          <input
            type="date"
            value={occasionDate}
            aria-label="Occasion date"
            onChange={(event) => setOccasionDate(event.target.value)}
          />
          <select
            value={occasionKind}
            aria-label="Occasion kind"
            onChange={(event) => setOccasionKind(event.target.value as OccasionKind)}
          >
            <option value="birthday">Birthday</option>
            <option value="anniversary">Anniversary</option>
          </select>
          <button type="button" aria-label="Add occasion" onClick={addOccasion} disabled={!occasionName.trim()}>
            <Plus size={12} aria-hidden />
          </button>
        </div>
        <div className="gp-calendar-occasion-list" data-floor-overflow="scroll">
          {sorted.length === 0 ? (
            <div className="gp-calendar-empty">
              <Heart size={20} aria-hidden />
              <strong>Remember the good dates</strong>
              <span>Add a birthday or anniversary above.</span>
            </div>
          ) : sorted.map((occasion) => (
            <article key={occasion.id} className="gp-calendar-occasion-row">
              <span data-kind={occasion.kind}>
                {occasion.kind === 'birthday'
                  ? <CakeSlice size={13} aria-hidden />
                  : <Heart size={13} aria-hidden />}
              </span>
              <span>
                <strong>{occasion.name}</strong>
                <small>{occasion.kind === 'birthday' ? 'Birthday' : 'Anniversary'} · every year</small>
              </span>
              <time dateTime={`2000-${occasion.date}`}>{occasionDateLabel(occasion.date)}</time>
              <button
                type="button"
                aria-label={`Remove ${occasion.name}`}
                onClick={() => commitOccasions(state.occasions.filter((item) => item.id !== occasion.id))}
              >
                <Trash2 size={11} aria-hidden />
              </button>
            </article>
          ))}
        </div>
      </div>
    )
  } else {
    const cells = calendarMonthGrid(data.year, data.month)
    content = (
      <div className="gp-calendar-month">
        {monthHeader(
          `${MONTH_NAMES[data.month]} ${data.year}`,
          () => shiftMonth(-1),
          () => shiftMonth(1),
          `${marked.size} marked`,
        )}
        <div className="gp-calendar-month-grid">
          {DAY_LABELS.map((label, index) => (
            <span key={`${label}-${index}`} className="gp-calendar-weekday">{label}</span>
          ))}
          {cells.map((cell) => {
            const isToday = cell.iso === todayIso
            const isMarked = marked.has(cell.iso)
            return (
              <button
                key={cell.iso}
                type="button"
                aria-label={`${isMarked ? 'Unmark' : 'Mark'} ${cell.iso}`}
                aria-pressed={isMarked}
                data-outside={!cell.inMonth || undefined}
                data-today={isToday || undefined}
                data-marked={isMarked || undefined}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleMarked(cell.iso)
                  }
                }}
                onPointerDown={(event) => {
                  event.preventDefault()
                  painting.current = !marked.has(cell.iso)
                  paintDay(cell.iso, painting.current)
                }}
                onPointerEnter={() => {
                  if (painting.current !== null) paintDay(cell.iso, painting.current)
                }}
              >
                <span>{cell.day}</span>
              </button>
            )
          })}
        </div>
        <footer className="gp-calendar-month-footer">
          <span><i /> Marked day</span>
          <button
            type="button"
            onClick={() => {
              const today = dateFromDayKey(todayIso)!
              onChange(baseData({ year: today.getFullYear(), month: today.getMonth() }))
            }}
          >
            Today
          </button>
        </footer>
      </div>
    )
  }

  return (
    <div
      className="gp-calendar-skin"
      data-calendar-skin={skin}
      data-floor-overflow="scroll"
      data-floor-min-w="240"
      data-floor-min-h="240"
      onPointerUp={() => { painting.current = null }}
      onPointerCancel={() => { painting.current = null }}
      onPointerLeave={() => { painting.current = null }}
    >
      {content}
    </div>
  )
}
