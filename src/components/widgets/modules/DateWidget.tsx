import {
  CalendarClock,
  CalendarHeart,
  CalendarRange,
  Flag,
  Hourglass,
  Minus,
  Plus,
  Repeat,
  Sunrise,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { DatePickerData, DateSkinMode } from '../../../types/spatial'
import { localDayKey } from '../../../utils/localDate'
import {
  anniversaryYears,
  DEADLINE_LEAD_CHOICES,
  dateDay,
  dateReading,
  dateSkinMode,
  dateTime,
  daysUntilDay,
  deadlineLeadDays,
  deadlineProgress,
  deadlineUrgency,
  longDayText,
  mediumDayText,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUSES,
  milestoneDetail,
  monthOfDay,
  nextAnniversary,
  dataWithDateState,
  RECURRENCE_UNITS,
  recurrenceLabel,
  recurrenceOccurrences,
  recurrenceOf,
  rangeEndDay,
  rangeSpan,
  relativePhrase,
  shiftDay,
  shortDayText,
  timeText,
  weekdayText,
} from './dateSkinModel'

interface DateWidgetProps {
  data: DatePickerData
  onChange: (data: DatePickerData) => void
}

/** Month initials for the Anniversary year band — one glyph per segment. */
const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** How far either side of today the Relative Date axis reaches. */
const AXIS_DAYS = 120

const SKIN_COPY: Record<DateSkinMode, { eyebrow: string; field: string }> = {
  date_time: { eyebrow: 'Date & time', field: 'Date' },
  deadline: { eyebrow: 'Deadline', field: 'Due date' },
  relative_date: { eyebrow: 'Relative', field: 'Date' },
  anniversary: { eyebrow: 'Anniversary', field: 'First occasion' },
  range: { eyebrow: 'Range', field: 'Start' },
  recurring_date: { eyebrow: 'Recurring', field: 'First occurrence' },
  milestone: { eyebrow: 'Milestone', field: 'Target date' },
}

function skinGlyph(skin: DateSkinMode): ReactNode {
  if (skin === 'deadline') return <Hourglass size={12} aria-hidden />
  if (skin === 'relative_date') return <Sunrise size={12} aria-hidden />
  if (skin === 'anniversary') return <CalendarHeart size={12} aria-hidden />
  if (skin === 'range') return <CalendarRange size={12} aria-hidden />
  if (skin === 'recurring_date') return <Repeat size={12} aria-hidden />
  if (skin === 'milestone') return <Flag size={12} aria-hidden />
  return <CalendarClock size={12} aria-hidden />
}

/** An ordinal in words the reader expects: 1st, 2nd, 3rd, 12th. */
function ordinal(value: number): string {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) return `${value}th`
  if (value % 10 === 1) return `${value}st`
  if (value % 10 === 2) return `${value}nd`
  if (value % 10 === 3) return `${value}rd`
  return `${value}th`
}

/**
 * A day or time control sitting in its own well. The well is painted on this
 * wrapper, never on the element that holds the control — a wrapper that
 * directly contains an input is manufactured into a second pane of glass by the
 * field-island rules, so the control's own label carries `gp-bare-field` and
 * this frame owns the material (Article XIX).
 */
function DateField({
  label,
  value,
  type = 'date',
  tone,
  onChange,
}: {
  label: string
  value: string
  type?: 'date' | 'time'
  tone?: 'quiet'
  onChange: (value: string) => void
}) {
  return (
    <div className="gp-date-well" data-tone={tone} data-type={type}>
      <span className="gp-date-well-label">{label}</span>
      <label className="gp-date-well-field gp-bare-field">
        <span className="gp-sr-only">{label}</span>
        <input
          type={type}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  )
}

/** A free-text detail owned by one skin (a milestone owner, a deliverable). */
function DetailField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div className="gp-date-well">
      <span className="gp-date-well-label">{label}</span>
      <label className="gp-date-well-field gp-bare-field">
        <span className="gp-sr-only">{label}</span>
        <input
          value={value}
          aria-label={label}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  )
}

export function DateWidget({ data, onChange }: DateWidgetProps) {
  const skin = dateSkinMode(data.mode)
  const day = dateDay(data.date)
  const time = dateTime(data.time)
  const reading = dateReading({ ...data, mode: skin })
  const copy = SKIN_COPY[skin]
  const today = localDayKey()

  /**
   * Every write goes through here, so the first edit of an old card also
   * settles its normalized shape: a retired `mode`, a malformed day or a
   * half-typed time are repaired once rather than re-read forever.
   */
  const base = (): DatePickerData => ({ ...data, mode: skin, date: day, time })
  const patch = (next: Partial<DatePickerData>) => onChange({ ...base(), ...next })
  const patchState = (next: Record<string, unknown>) =>
    onChange(dataWithDateState(base(), skin, next))

  const head = (trailing?: ReactNode) => (
    <header className="gp-date-head">
      <span className="gp-date-glyph">{skinGlyph(skin)}</span>
      <div className="gp-date-name gp-bare-field">
        <input
          value={data.label}
          aria-label="Card label"
          placeholder={copy.eyebrow}
          onChange={(event) => patch({ label: event.target.value })}
        />
      </div>
      {trailing}
    </header>
  )

  const timeToggle = (
    <button
      type="button"
      aria-pressed={data.includeTime}
      aria-label={data.includeTime ? 'Hide the time' : 'Add a time'}
      title={data.includeTime ? 'Hide the time' : 'Add a time'}
      onClick={() => patch({ includeTime: !data.includeTime })}
      className="gp-date-time-toggle"
    >
      Time
    </button>
  )

  const quickDay = (label: string, value: string, title: string) => (
    <button
      key={label}
      type="button"
      title={title}
      aria-pressed={day === value}
      onClick={() => patch({ date: value })}
      className="gp-date-quick"
    >
      {label}
    </button>
  )

  let body: ReactNode

  // ------------------------------------------------------- 1 · date & time
  if (skin === 'date_time') {
    body = (
      <>
        {head(timeToggle)}
        <div className="gp-date-plate" data-empty={day ? undefined : true}>
          <div className="gp-date-plate-face">
            {day && <span className="gp-date-plate-weekday">{weekdayText(day)}</span>}
            {day && (
              <strong className="gp-date-plate-day">
                {String(Number(day.slice(8, 10)))}
              </strong>
            )}
            <span className="gp-date-plate-month">
              {day
                ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
                  .format(new Date(`${day}T12:00:00`))
                : 'No day chosen'}
            </span>
          </div>
          {data.includeTime && (
            <div className="gp-date-plate-clock">
              <span className="gp-date-well-label">At</span>
              <strong>{time ? timeText(time) : '--:--'}</strong>
            </div>
          )}
        </div>
        <div className="gp-date-fields" data-columns={data.includeTime ? 'two' : 'one'}>
          <DateField label={copy.field} value={day} onChange={(value) => patch({ date: value })} />
          {data.includeTime && (
            <DateField
              label="Time"
              type="time"
              value={time}
              onChange={(value) => patch({ time: value })}
            />
          )}
        </div>
        <footer className="gp-date-actions">
          {quickDay('Today', today, 'Set to today')}
          {quickDay('Tomorrow', shiftDay(today, 1), 'Set to tomorrow')}
          {quickDay('Next week', shiftDay(today, 7), 'Set to a week from today')}
          <button
            type="button"
            onClick={() => patch({ date: '', time: '' })}
            disabled={!day && !time}
            className="gp-date-clear"
          >
            Clear
          </button>
        </footer>
      </>
    )

  // ---------------------------------------------------------- 2 · deadline
  } else if (skin === 'deadline') {
    const lead = deadlineLeadDays(data)
    const urgency = deadlineUrgency(reading.days)
    const spent = deadlineProgress(reading.days, lead)
    const circumference = 2 * Math.PI * 19
    body = (
      <>
        {head(timeToggle)}
        <div className="gp-date-deadline" data-urgency={urgency}>
          <svg className="gp-date-ring" viewBox="0 0 44 44" aria-hidden focusable="false">
            <circle className="gp-date-ring-track" cx="22" cy="22" r="19" />
            <circle
              className="gp-date-ring-spent"
              cx="22"
              cy="22"
              r="19"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - spent)}
            />
          </svg>
          <div className="gp-date-deadline-read">
            <strong>
              {reading.days === null
                ? 'Not set'
                : reading.days === 0 ? 'Due today' : `${Math.abs(reading.days)}`}
            </strong>
            <span>
              {reading.days === null
                ? 'No due date yet'
                : reading.days === 0 ? 'The day is here'
                  : reading.days < 0
                    ? `${Math.abs(reading.days) === 1 ? 'day' : 'days'} overdue`
                    : `${reading.days === 1 ? 'day' : 'days'} left of ${lead}`}
            </span>
            <em>{day ? `${mediumDayText(day)}${data.includeTime && time ? ` · ${timeText(time)}` : ''}` : 'Pick the day it is due'}</em>
          </div>
        </div>
        <div className="gp-date-leads">
          <span className="gp-date-well-label">Runway</span>
          <div className="gp-date-segments">
            {DEADLINE_LEAD_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={lead === choice}
                aria-label={`Measure against ${choice} days`}
                onClick={() => patchState({ leadDays: choice })}
                className="gp-date-segment"
              >
                {choice}d
              </button>
            ))}
          </div>
        </div>
        <div className="gp-date-fields" data-columns={data.includeTime ? 'two' : 'one'}>
          <DateField label={copy.field} value={day} onChange={(value) => patch({ date: value })} />
          {data.includeTime && (
            <DateField
              label="Time"
              type="time"
              value={time}
              onChange={(value) => patch({ time: value })}
            />
          )}
        </div>
      </>
    )

  // ----------------------------------------------------- 3 · relative date
  } else if (skin === 'relative_date') {
    // The axis is a fixed window either side of today, so the marker's travel
    // means the same thing on every card rather than rescaling per date.
    const offset = reading.days === null
      ? 0.5
      : (Math.max(-AXIS_DAYS, Math.min(AXIS_DAYS, reading.days)) + AXIS_DAYS) / (AXIS_DAYS * 2)
    body = (
      <>
        {head()}
        <div className="gp-date-relative" data-state={reading.state}>
          <strong>{reading.phrase}</strong>
          <span>{day ? longDayText(day) : 'Pick a day to place it in time'}</span>
        </div>
        <div className="gp-date-axis" aria-hidden>
          <span className="gp-date-axis-line" />
          <span className="gp-date-axis-now" />
          <span
            className="gp-date-axis-mark"
            data-state={reading.state}
            style={{ left: `${offset * 100}%` }}
          />
          <span className="gp-date-axis-caption" data-side="start">−{AXIS_DAYS}d</span>
          <span className="gp-date-axis-caption" data-side="now">Today</span>
          <span className="gp-date-axis-caption" data-side="end">+{AXIS_DAYS}d</span>
        </div>
        <div className="gp-date-actions" data-wrap="true">
          {quickDay('Yesterday', shiftDay(today, -1), 'Set to yesterday')}
          {quickDay('Today', today, 'Set to today')}
          {quickDay('Tomorrow', shiftDay(today, 1), 'Set to tomorrow')}
          {quickDay('Next week', shiftDay(today, 7), 'Set to a week from today')}
          {quickDay('Next month', shiftDay(today, 30), 'Set to 30 days from today')}
        </div>
        <div className="gp-date-fields" data-columns="one">
          <DateField label={copy.field} value={day} onChange={(value) => patch({ date: value })} />
        </div>
      </>
    )

  // ------------------------------------------------------ 4 · anniversary
  } else if (skin === 'anniversary') {
    const next = day ? nextAnniversary(day, Date.now()) : ''
    const years = next ? anniversaryYears(day, next) : 0
    const month = monthOfDay(next || day)
    const currentMonth = Number(today.slice(5, 7))
    body = (
      <>
        {head()}
        <div className="gp-date-anniversary">
          <strong>
            {day
              ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' })
                .format(new Date(`${day}T12:00:00`))
              : 'No occasion yet'}
          </strong>
          <span data-state={reading.state}>
            {next
              ? `${relativePhrase(daysUntilDay(next) ?? 0)} · ${mediumDayText(next)}`
              : 'Pick the first time it happened'}
          </span>
          {next && years > 0 && (
            <em>{ordinal(years)} year · since {day.slice(0, 4)}</em>
          )}
        </div>
        <div className="gp-date-band" aria-hidden>
          {MONTH_INITIALS.map((initial, index) => (
            <span
              key={`${initial}-${index}`}
              className="gp-date-band-month"
              data-occasion={month === index + 1 || undefined}
              data-now={currentMonth === index + 1 || undefined}
            >
              {initial}
            </span>
          ))}
        </div>
        <div className="gp-date-fields" data-columns="one">
          <DateField label={copy.field} value={day} onChange={(value) => patch({ date: value })} />
        </div>
      </>
    )

  // ------------------------------------------------------------- 5 · range
  } else if (skin === 'range') {
    const end = rangeEndDay(data)
    const span = rangeSpan(day, end)
    body = (
      <>
        {head()}
        <div className="gp-date-range" data-state={span?.state}>
          <strong>
            {span
              ? `${span.nights} ${span.nights === 1 ? 'night' : 'nights'}`
              : 'Incomplete range'}
          </strong>
          <span>
            {span
              ? `${span.days} ${span.days === 1 ? 'day' : 'days'} · ${shortDayText(span.start)} → ${mediumDayText(span.end)}`
              : 'Set both ends to measure the span'}
          </span>
        </div>
        {span && (
          <div className="gp-date-span" data-state={span.state}>
            <span className="gp-date-span-track">
              <span
                className="gp-date-span-fill"
                style={{ inlineSize: `${span.progress * 100}%` }}
              />
              {span.state === 'during' && (
                <span
                  className="gp-date-span-now"
                  style={{ left: `${span.progress * 100}%` }}
                  aria-hidden
                />
              )}
            </span>
            <span className="gp-date-span-captions">
              <em>{shortDayText(span.start)}</em>
              <b>
                {span.state === 'before' ? 'Not started'
                  : span.state === 'after' ? 'Complete'
                    : `Day ${Math.round(span.progress * span.nights) + 1} of ${span.days}`}
              </b>
              <em>{shortDayText(span.end)}</em>
            </span>
          </div>
        )}
        <div className="gp-date-fields" data-columns="two">
          <DateField label="Start" value={day} onChange={(value) => patch({ date: value })} />
          <DateField
            label="End"
            value={end}
            onChange={(value) => patchState({ end: value })}
          />
        </div>
        <footer className="gp-date-actions">
          <button
            type="button"
            disabled={!day}
            title="End the range one night after it starts"
            onClick={() => patchState({ end: shiftDay(day, 1) })}
            className="gp-date-quick"
          >
            1 night
          </button>
          <button
            type="button"
            disabled={!day}
            title="End the range a week after it starts"
            onClick={() => patchState({ end: shiftDay(day, 7) })}
            className="gp-date-quick"
          >
            1 week
          </button>
          <button
            type="button"
            disabled={!day}
            title="End the range a month after it starts"
            onClick={() => patchState({ end: shiftDay(day, 30) })}
            className="gp-date-quick"
          >
            1 month
          </button>
        </footer>
      </>
    )

  // --------------------------------------------------- 6 · recurring date
  } else if (skin === 'recurring_date') {
    const rule = recurrenceOf(data)
    const upcoming = day ? recurrenceOccurrences(day, rule, 4) : []
    const setInterval = (value: number) =>
      patchState({ unit: rule.unit, interval: Math.max(1, Math.min(99, value)) })
    body = (
      <>
        {head()}
        <div className="gp-date-recurring">
          <strong>{recurrenceLabel(rule)}</strong>
          <span data-state={reading.state}>
            {upcoming[0]
              ? `Next ${relativePhrase(daysUntilDay(upcoming[0]) ?? 0).toLocaleLowerCase()} · ${mediumDayText(upcoming[0])}`
              : 'Pick the first occurrence'}
          </span>
        </div>
        <div className="gp-date-rule">
          <div className="gp-date-segments">
            {RECURRENCE_UNITS.map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={rule.unit === unit}
                aria-label={`Repeat every ${unit}`}
                onClick={() => patchState({ unit, interval: rule.interval })}
                className="gp-date-segment"
              >
                {unit === 'day' ? 'Day' : unit === 'week' ? 'Week' : unit === 'month' ? 'Month' : 'Year'}
              </button>
            ))}
          </div>
          <div className="gp-date-stepper">
            <button
              type="button"
              aria-label="Repeat less often"
              disabled={rule.interval <= 1}
              onClick={() => setInterval(rule.interval - 1)}
            >
              <Minus size={11} aria-hidden />
            </button>
            <label className="gp-date-stepper-value gp-bare-field">
              <span className="gp-sr-only">Repeat interval</span>
              <input
                type="number"
                min={1}
                max={99}
                value={rule.interval}
                aria-label="Repeat interval"
                onChange={(event) => setInterval(Number(event.target.value))}
              />
            </label>
            <button
              type="button"
              aria-label="Repeat more often"
              disabled={rule.interval >= 99}
              onClick={() => setInterval(rule.interval + 1)}
            >
              <Plus size={11} aria-hidden />
            </button>
          </div>
        </div>
        {upcoming.length > 0 && (
          <ul className="gp-date-upcoming">
            {upcoming.map((occurrence, index) => (
              <li key={occurrence} data-next={index === 0 || undefined}>
                <em>{weekdayText(occurrence)}</em>
                <b>{shortDayText(occurrence)}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="gp-date-fields" data-columns="one">
          <DateField label={copy.field} value={day} onChange={(value) => patch({ date: value })} />
        </div>
      </>
    )

  // --------------------------------------------------------- 7 · milestone
  } else {
    const detail = milestoneDetail(data)
    body = (
      <>
        {head(timeToggle)}
        <div className="gp-date-milestone" data-status={detail.status} data-state={reading.state}>
          <strong>{reading.phrase}</strong>
          <span>{day ? `${mediumDayText(day)}${data.includeTime && time ? ` · ${timeText(time)}` : ''}` : 'Pick the target date'}</span>
          <b>{MILESTONE_STATUS_LABELS[detail.status]}</b>
        </div>
        <div className="gp-date-rail">
          {MILESTONE_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              data-status={status}
              aria-pressed={detail.status === status}
              aria-label={`Mark as ${MILESTONE_STATUS_LABELS[status]}`}
              title={MILESTONE_STATUS_LABELS[status]}
              onClick={() => patchState({ status })}
              className="gp-date-rail-step"
            >
              <span aria-hidden />
              {MILESTONE_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <div className="gp-date-fields" data-columns="two">
          <DetailField
            label="Owner"
            value={detail.owner}
            placeholder="Who carries it?"
            onChange={(value) => patchState({ owner: value })}
          />
          <DetailField
            label="Deliverable"
            value={detail.deliverable}
            placeholder="What ships?"
            onChange={(value) => patchState({ deliverable: value })}
          />
        </div>
        <div className="gp-date-fields" data-columns={data.includeTime ? 'two' : 'one'}>
          <DateField label={copy.field} value={day} onChange={(value) => patch({ date: value })} />
          {data.includeTime && (
            <DateField
              label="Time"
              type="time"
              value={time}
              onChange={(value) => patch({ time: value })}
            />
          )}
        </div>
      </>
    )
  }

  return (
    <div className="gp-date" data-date-skin={skin} data-state={reading.state}>
      {body}
    </div>
  )
}
