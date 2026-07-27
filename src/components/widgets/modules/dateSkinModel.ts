import type {
  DatePickerData,
  DateSkinMode,
  ModuleData,
} from '../../../types/spatial'
import { localDayKey } from '../../../utils/localDate'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'

/**
 * One day, seven questions.
 *
 * `DatePickerData.date` is the single canonical day. No skin stores a second
 * copy of it: Anniversary and Recurring Date *derive* their next occurrence,
 * Range stores only the far end, and Deadline stores only how long a runway it
 * is measuring. That is what lets a card change skin without ever losing or
 * silently rewriting the day the user typed.
 *
 * Every calculation here is local-calendar arithmetic. A day key is
 * `YYYY-MM-DD` in the user's own timezone (see `localDate.ts`), distances are
 * measured between local midnights and rounded, so a daylight-saving boundary
 * inside a span can never turn three days into two days and twenty-three
 * hours. Everything is pure and bounded — no clock reads except the `now`
 * argument, and every loop has a hard step ceiling.
 */

export const DATE_SKINS: readonly DateSkinMode[] = [
  'date_time',
  'deadline',
  'relative_date',
  'anniversary',
  'range',
  'recurring_date',
  'milestone',
]

const DAY_MS = 86_400_000
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const TIME_KEY = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_DETAIL = 200
const MAX_LEAD_DAYS = 999
const MAX_INTERVAL = 99
/** A recurrence never walks further than this to find the next occurrence. */
const MAX_RECURRENCE_STEPS = 4_000

/**
 * The worn skin. `'countdown'` was the old second mode of this card before
 * Countdown became its own widget; the data meant "a day I am counting down
 * to", which is exactly the Deadline skin, so it reads back as that rather
 * than silently falling home to Date & Time.
 */
export function dateSkinMode(raw: unknown): DateSkinMode {
  if (raw === 'countdown') return 'deadline'
  return typeof raw === 'string' && DATE_SKINS.includes(raw as DateSkinMode)
    ? raw as DateSkinMode
    : 'date_time'
}

// --------------------------------------------------------------------- days

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Local midnight for a day key, or null when the key is not a real calendar
 * day. `new Date(2026, 1, 31)` rolls forward to March, so the parts are read
 * back to reject a day that does not exist.
 */
export function dayStart(day: unknown): Date | null {
  if (typeof day !== 'string' || !DAY_KEY.test(day)) return null
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  const date = Number(day.slice(8, 10))
  const parsed = new Date(year, month - 1, date)
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== date
  ) return null
  return parsed
}

/** A stored day, or '' when the card holds nothing usable. */
export function dateDay(raw: unknown): string {
  return dayStart(raw) ? raw as string : ''
}

/** A stored 24-hour time, or '' when the card holds nothing usable. */
export function dateTime(raw: unknown): string {
  return typeof raw === 'string' && TIME_KEY.test(raw) ? raw : ''
}

/** Whole calendar days from `from` to `to`, or null if either is not a day. */
export function daysBetween(from: unknown, to: unknown): number | null {
  const start = dayStart(from)
  const end = dayStart(to)
  if (!start || !end) return null
  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

/** Whole calendar days from today to `day`. Negative once the day has passed. */
export function daysUntilDay(day: unknown, now = Date.now()): number | null {
  return daysBetween(localDayKey(now), day)
}

/** The same day moved by whole local calendar days. */
export function shiftDay(day: unknown, days: number): string {
  const start = dayStart(day)
  if (!start || !Number.isFinite(days)) return ''
  start.setDate(start.getDate() + Math.trunc(days))
  return localDayKey(start.getTime())
}

/**
 * A day-of-month placed in another month, clamped to that month's length. The
 * 31st of January asked for in February is the 28th (or the 29th), and a 29th
 * of February anniversary lands on the 28th in ordinary years — the occasion
 * still happens rather than skipping three years out of four.
 */
export function dayInMonth(year: number, month: number, day: number): string {
  const lastOfMonth = new Date(year, month, 0).getDate()
  return `${year}-${pad(month)}-${pad(Math.min(day, lastOfMonth))}`
}

// ---------------------------------------------------------------- language

let relativeFormat: Intl.RelativeTimeFormat | null = null

function relative(): Intl.RelativeTimeFormat {
  relativeFormat ??= new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  return relativeFormat
}

function sentenceCase(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

/**
 * How far away a day reads out loud: "Today", "Tomorrow", "In 3 weeks",
 * "2 months ago". The unit coarsens with distance, because "in 214 days" is a
 * number the reader has to convert and "in 7 months" is an answer.
 */
export function relativePhrase(days: number): string {
  if (!Number.isFinite(days)) return '—'
  const whole = Math.trunc(days) || 0
  const distance = Math.abs(whole)
  if (distance < 7) return sentenceCase(relative().format(whole, 'day'))
  if (distance < 28) return sentenceCase(relative().format(Math.round(whole / 7), 'week'))
  if (distance < 365) return sentenceCase(relative().format(Math.round(whole / 30), 'month'))
  return sentenceCase(relative().format(Math.round(whole / 365), 'year'))
}

function formatDay(day: string, options: Intl.DateTimeFormatOptions): string {
  const start = dayStart(day)
  return start ? new Intl.DateTimeFormat(undefined, options).format(start) : ''
}

/** "Friday, 4 September 2026" — the unambiguous long form. */
export function longDayText(day: string): string {
  return formatDay(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** "4 Sep 2026" — the compact form used beside a hero reading. */
export function mediumDayText(day: string): string {
  return formatDay(day, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "4 Sep" — for chips and rails where the year is already established. */
export function shortDayText(day: string): string {
  return formatDay(day, { day: 'numeric', month: 'short' })
}

/** "Fri" — the weekday alone. */
export function weekdayText(day: string): string {
  return formatDay(day, { weekday: 'short' })
}

/** "September 2026" — the month band's caption. */
export function monthYearText(day: string): string {
  return formatDay(day, { month: 'long', year: 'numeric' })
}

/** The month number (1–12) of a day, or null. */
export function monthOfDay(day: string): number | null {
  const start = dayStart(day)
  return start ? start.getMonth() + 1 : null
}

/** "14:30" rendered the way the reader's locale writes a clock time. */
export function timeText(time: string): string {
  const value = dateTime(time)
  if (!value) return ''
  const at = new Date(2000, 0, 1, Number(value.slice(0, 2)), Number(value.slice(3, 5)))
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at)
}

// ------------------------------------------------------------- skin states

function stateOf(data: Pick<DatePickerData, 'skinStates'>, skin: DateSkinMode): WidgetSkinState {
  return skinStateFor(data, skin)
}

function cleanDetail(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, MAX_DETAIL) : ''
}

/** Write one skin's optional state without touching the canonical day. */
export function dataWithDateState(
  data: DatePickerData,
  skin: DateSkinMode,
  patch: WidgetSkinState,
): DatePickerData {
  const next = { ...stateOf(data, skin), ...patch }
  for (const key of Object.keys(next)) {
    if (next[key] === '' || next[key] === undefined) delete next[key]
  }
  return dataWithSkinState(
    { ...data, mode: skin } as ModuleData,
    skin,
    next,
  ) as unknown as DatePickerData
}

// ------------------------------------------------------------ 2 · deadline

export type DeadlineUrgency = 'overdue' | 'due' | 'urgent' | 'soon' | 'calm'

export const DEADLINE_LEAD_CHOICES: readonly number[] = [7, 14, 30, 90]
const DEFAULT_LEAD_DAYS = 30

/**
 * The runway this deadline is measured against — "30 days out, 12 left". A
 * remaining count alone cannot say whether it is comfortable or late, so the
 * skin keeps the window the user considers normal for this piece of work.
 */
export function deadlineLeadDays(
  data: Pick<DatePickerData, 'skinStates'>,
  skin: DateSkinMode = 'deadline',
): number {
  const raw = stateOf(data, skin).leadDays
  const value = typeof raw === 'number' ? Math.trunc(raw) : Number.NaN
  return Number.isFinite(value) && value >= 1
    ? Math.min(value, MAX_LEAD_DAYS)
    : DEFAULT_LEAD_DAYS
}

export function deadlineUrgency(days: number | null): DeadlineUrgency {
  if (days === null) return 'calm'
  if (days < 0) return 'overdue'
  if (days === 0) return 'due'
  if (days <= 2) return 'urgent'
  if (days <= 7) return 'soon'
  return 'calm'
}

/**
 * How much of the runway is spent, 0 → 1. A deadline further out than its own
 * lead window reads as untouched rather than as a negative.
 */
export function deadlineProgress(days: number | null, leadDays: number): number {
  if (days === null || leadDays <= 0) return 0
  const spent = (leadDays - days) / leadDays
  return Math.min(1, Math.max(0, spent))
}

// --------------------------------------------------------- 4 · anniversary

/**
 * The next time this month and day comes round, counting today as next. An
 * anniversary in the past is not late — it is annual.
 */
export function nextAnniversary(day: unknown, now = Date.now()): string {
  const start = dayStart(day)
  if (!start) return ''
  const today = localDayKey(now)
  const thisYear = Number(today.slice(0, 4))
  const candidate = dayInMonth(thisYear, start.getMonth() + 1, start.getDate())
  return candidate >= today
    ? candidate
    : dayInMonth(thisYear + 1, start.getMonth() + 1, start.getDate())
}

/** Which anniversary that occurrence is: the original day is the 0th. */
export function anniversaryYears(day: unknown, occurrence: string): number {
  const start = dayStart(day)
  const at = dayStart(occurrence)
  if (!start || !at) return 0
  return Math.max(0, at.getFullYear() - start.getFullYear())
}

// --------------------------------------------------------------- 5 · range

export type RangeState = 'before' | 'during' | 'after'

export interface DateRangeSpan {
  /** Always the earlier day, whichever end the user typed it into. */
  start: string
  end: string
  /** Nights between the two ends; a one-day range is 0 nights, 1 day. */
  nights: number
  days: number
  /** Today's position inside the span, 0 → 1. */
  progress: number
  state: RangeState
}

/** The far end of the range, kept beside the skin rather than in the card. */
export function rangeEndDay(
  data: Pick<DatePickerData, 'skinStates'>,
  skin: DateSkinMode = 'range',
): string {
  return dateDay(stateOf(data, skin).end)
}

/**
 * The span between the canonical day and the range's far end. The two ends are
 * ordered before measuring, so a range typed back-to-front still reads as a
 * real number of nights instead of a negative one.
 */
export function rangeSpan(
  startDay: string,
  endDay: string,
  now = Date.now(),
): DateRangeSpan | null {
  if (!dateDay(startDay) || !dateDay(endDay)) return null
  const [start, end] = startDay <= endDay ? [startDay, endDay] : [endDay, startDay]
  const nights = daysBetween(start, end) ?? 0
  const elapsed = daysBetween(start, localDayKey(now)) ?? 0
  return {
    start,
    end,
    nights,
    days: nights + 1,
    progress: nights === 0 ? (elapsed === 0 ? 1 : elapsed < 0 ? 0 : 1)
      : Math.min(1, Math.max(0, elapsed / nights)),
    state: elapsed < 0 ? 'before' : elapsed > nights ? 'after' : 'during',
  }
}

// ----------------------------------------------------- 6 · recurring date

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'

export interface Recurrence {
  unit: RecurrenceUnit
  /** How many units between occurrences, 1–99. */
  interval: number
}

export const RECURRENCE_UNITS: readonly RecurrenceUnit[] = ['day', 'week', 'month', 'year']
const RECURRENCE_UNIT_SET = new Set<RecurrenceUnit>(RECURRENCE_UNITS)

export function recurrenceOf(
  data: Pick<DatePickerData, 'skinStates'>,
  skin: DateSkinMode = 'recurring_date',
): Recurrence {
  const state = stateOf(data, skin)
  const interval = typeof state.interval === 'number' ? Math.trunc(state.interval) : 1
  return {
    unit: RECURRENCE_UNIT_SET.has(state.unit as RecurrenceUnit)
      ? state.unit as RecurrenceUnit
      : 'week',
    interval: Number.isFinite(interval) && interval >= 1
      ? Math.min(interval, MAX_INTERVAL)
      : 1,
  }
}

/** The nth occurrence of a rule that begins on `startDay`. */
function occurrenceAt(startDay: string, rule: Recurrence, step: number): string {
  const start = dayStart(startDay)
  if (!start) return ''
  const steps = rule.interval * step
  if (rule.unit === 'day') return shiftDay(startDay, steps)
  if (rule.unit === 'week') return shiftDay(startDay, steps * 7)
  // Months and years count from the original day-of-month every time, so a
  // rule that starts on the 31st does not creep to the 28th for good after one
  // short month.
  const month = rule.unit === 'month' ? start.getMonth() + steps : start.getMonth()
  const year = start.getFullYear()
    + (rule.unit === 'year' ? steps : Math.floor(month / 12))
  const normalizedMonth = rule.unit === 'year' ? start.getMonth() : ((month % 12) + 12) % 12
  return dayInMonth(year, normalizedMonth + 1, start.getDate())
}

/**
 * The next `count` occurrences from today onwards. A rule whose start is still
 * ahead begins at that start; one long past is walked forward, bounded, so a
 * daily rule seeded years ago cannot spin.
 */
export function recurrenceOccurrences(
  startDay: string,
  rule: Recurrence,
  count = 4,
  now = Date.now(),
): string[] {
  if (!dateDay(startDay) || count <= 0) return []
  const today = localDayKey(now)
  let step = 0
  if (rule.unit === 'day' || rule.unit === 'week') {
    // Fixed-length units land on the right step by division, so a daily rule
    // seeded decades ago costs the same as one seeded yesterday.
    const perStep = rule.interval * (rule.unit === 'week' ? 7 : 1)
    const elapsed = daysBetween(startDay, today) ?? 0
    if (elapsed > 0) step = Math.ceil(elapsed / perStep)
  } else {
    let day = startDay
    while (day && day < today && step < MAX_RECURRENCE_STEPS) {
      step += 1
      day = occurrenceAt(startDay, rule, step)
    }
  }
  const found: string[] = []
  for (let index = 0; index < count; index += 1) {
    const occurrence = occurrenceAt(startDay, rule, step + index)
    if (!occurrence) break
    found.push(occurrence)
  }
  return found
}

/** The next occurrence alone — what a wire and a folded card both want. */
export function nextRecurrence(
  startDay: string,
  rule: Recurrence,
  now = Date.now(),
): string {
  return recurrenceOccurrences(startDay, rule, 1, now)[0] ?? ''
}

const RECURRENCE_NOUNS: Record<RecurrenceUnit, [one: string, many: string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
}

/** "Every week", "Every 3 days". */
export function recurrenceLabel(rule: Recurrence): string {
  const [one, many] = RECURRENCE_NOUNS[rule.unit]
  return rule.interval === 1 ? `Every ${one}` : `Every ${rule.interval} ${many}`
}

// ----------------------------------------------------------- 7 · milestone

export type MilestoneStatus = 'planned' | 'active' | 'at_risk' | 'shipped'

export const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  'planned',
  'active',
  'at_risk',
  'shipped',
]
const MILESTONE_STATUS_SET = new Set<MilestoneStatus>(MILESTONE_STATUSES)

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  planned: 'Planned',
  active: 'In progress',
  at_risk: 'At risk',
  shipped: 'Shipped',
}

export interface MilestoneDetail {
  owner: string
  deliverable: string
  status: MilestoneStatus
}

export function milestoneDetail(
  data: Pick<DatePickerData, 'skinStates'>,
  skin: DateSkinMode = 'milestone',
): MilestoneDetail {
  const state = stateOf(data, skin)
  return {
    owner: cleanDetail(state.owner),
    deliverable: cleanDetail(state.deliverable),
    status: MILESTONE_STATUS_SET.has(state.status as MilestoneStatus)
      ? state.status as MilestoneStatus
      : 'planned',
  }
}

// ------------------------------------------------------------- the reading

export type DateState = 'unset' | 'overdue' | 'today' | 'upcoming'

export interface DateReading {
  skin: DateSkinMode
  /**
   * The day this card actually points at: the next occurrence for the
   * repeating skins, the earlier end for a range, the stored day otherwise.
   * This — not the raw field — is what a wire and a folded card report.
   */
  day: string
  /** Whole calendar days from today to `day`; null when no day is set. */
  days: number | null
  /** The headline: "Today", "In 3 weeks", "2 months ago". */
  phrase: string
  /** The second line: the day itself, with the time when the card keeps one. */
  detail: string
  state: DateState
}

/**
 * The one reading every consumer shares. Because Anniversary and Recurring
 * Date resolve to their *next* occurrence here, a folded card, a `days_until`
 * wire and the open card can never disagree about how far away the day is.
 */
export function dateReading(data: DatePickerData, now = Date.now()): DateReading {
  const skin = dateSkinMode(data.mode)
  const stored = dateDay(data.date)
  const day = skin === 'anniversary' ? nextAnniversary(stored, now)
    : skin === 'recurring_date' ? nextRecurrence(stored, recurrenceOf(data), now)
      : skin === 'range' ? (rangeSpan(stored, rangeEndDay(data), now)?.start ?? stored)
        : stored
  const days = day ? daysUntilDay(day, now) : null
  const time = data.includeTime ? dateTime(data.time) : ''
  const clock = time ? ` · ${timeText(time)}` : ''
  return {
    skin,
    day,
    days,
    phrase: days === null ? 'No date set' : relativePhrase(days),
    detail: day ? `${longDayText(day)}${clock}` : 'Pick a day to begin',
    state: days === null ? 'unset' : days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming',
  }
}

/**
 * The nights a Range covers, for the wire that wants a duration. Null on every
 * other skin, which measures a point in time rather than a length of it.
 */
export function dateDurationDays(data: DatePickerData, now = Date.now()): number | null {
  if (dateSkinMode(data.mode) !== 'range') return null
  return rangeSpan(dateDay(data.date), rangeEndDay(data), now)?.nights ?? null
}
