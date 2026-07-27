import { safeCounterStep } from '../../../utils/widgetValueValidation'

/**
 * Counter wears seven shapes over one stored number.
 *
 * `label`, `count`, and `step` stay canonical for every skin, so a circuit
 * reading `count` sees the same value whichever face is showing. The skins
 * that genuinely need more — a target, several named tallies, a rate window,
 * a period roll-up — keep it in their own isolated `skinStates` entry, which
 * is dropped when empty and never merges with another skin's settings.
 */

export type CounterSkin =
  | 'tally'
  | 'clicker'
  | 'goal_counter'
  | 'up_down'
  | 'multi_counter'
  | 'timed_rate'
  | 'resetting_period'

const COUNTER_SKINS = new Set<CounterSkin>([
  'tally',
  'clicker',
  'goal_counter',
  'up_down',
  'multi_counter',
  'timed_rate',
  'resetting_period',
])

export function counterSkin(raw: unknown): CounterSkin {
  return typeof raw === 'string' && COUNTER_SKINS.has(raw as CounterSkin)
    ? raw as CounterSkin
    : 'tally'
}

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function finite(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

/** Counts stay whole and inside the safe-integer range however they arrived. */
export function safeCount(value: unknown): number {
  const parsed = finite(value, 0)
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(Number.MIN_SAFE_INTEGER, Math.round(parsed)),
  )
}

export { safeCounterStep }

// ── Tally ──────────────────────────────────────────────────────────────────

/** How many gate-five groups to draw, and the remainder. Negatives read as 0. */
export function tallyGroups(count: number): { groups: number; remainder: number } {
  const total = Math.max(0, safeCount(count))
  // A wall of thousands of marks helps nobody; past this the skin shows the
  // number alone and the marks become a sample.
  const drawable = Math.min(total, 200)
  return { groups: Math.floor(drawable / 5), remainder: drawable % 5 }
}

// ── Goal Counter ───────────────────────────────────────────────────────────

export interface GoalCounterState {
  target: number
}

export const DEFAULT_GOAL_TARGET = 10

export function goalCounterState(raw: unknown): GoalCounterState {
  const target = Math.round(finite(record(raw).target, DEFAULT_GOAL_TARGET))
  // A zero or negative target would make every percentage undefined.
  return { target: Math.min(1_000_000, Math.max(1, target)) }
}

export interface GoalReading {
  target: number
  current: number
  remaining: number
  /** 0-1, clamped: overshooting a goal fills the ring, it does not overflow it. */
  progress: number
  percent: number
  reached: boolean
}

export function goalReading(count: number, state: GoalCounterState): GoalReading {
  const current = safeCount(count)
  const ratio = current / state.target
  const progress = Math.min(1, Math.max(0, ratio))
  return {
    target: state.target,
    current,
    remaining: Math.max(0, state.target - current),
    progress,
    percent: Math.round(progress * 100),
    reached: current >= state.target,
  }
}

// ── Multi-counter ──────────────────────────────────────────────────────────

export interface NamedCounter {
  id: string
  label: string
  count: number
}

export interface MultiCounterState {
  counters: NamedCounter[]
}

export function multiCounterState(raw: unknown): MultiCounterState {
  const list = record(raw).counters
  if (!Array.isArray(list)) return { counters: [] }
  const seen = new Set<string>()
  const counters: NamedCounter[] = []
  for (const entry of list) {
    const item = record(entry)
    const id = typeof item.id === 'string' && item.id !== '' ? item.id : null
    // A duplicate id would make React reuse one row for two counters.
    if (!id || seen.has(id)) continue
    seen.add(id)
    counters.push({
      id,
      label: typeof item.label === 'string' ? item.label : '',
      count: safeCount(item.count),
    })
  }
  return { counters }
}

export function multiCounterTotal(state: MultiCounterState): number {
  return state.counters.reduce((total, counter) => total + counter.count, 0)
}

// ── Timed Rate ─────────────────────────────────────────────────────────────

export type RateWindow = 'minute' | 'hour'

export interface TimedRateState {
  /** Epoch ms the current measurement began. */
  startedAt: number | null
  /** The count when measurement began, so the rate covers only this run. */
  baseline: number
  window: RateWindow
}

export function timedRateState(raw: unknown): TimedRateState {
  const state = record(raw)
  const startedAt = typeof state.startedAt === 'number' && Number.isFinite(state.startedAt)
    ? state.startedAt
    : null
  return {
    startedAt,
    baseline: safeCount(state.baseline),
    window: state.window === 'hour' ? 'hour' : 'minute',
  }
}

export interface RateReading {
  running: boolean
  events: number
  elapsedMs: number
  /** Events per the chosen window; 0 until a little time has passed. */
  rate: number
  windowLabel: string
}

export function rateReading(
  count: number,
  state: TimedRateState,
  now: number,
): RateReading {
  const events = Math.max(0, safeCount(count) - state.baseline)
  const elapsedMs = state.startedAt === null ? 0 : Math.max(0, now - state.startedAt)
  const per = state.window === 'hour' ? 3_600_000 : 60_000
  // Below a second of elapsed time the extrapolation is noise, not a rate.
  const rate = elapsedMs < 1000 ? 0 : (events / elapsedMs) * per
  return {
    running: state.startedAt !== null,
    events,
    elapsedMs,
    rate,
    windowLabel: state.window === 'hour' ? 'per hour' : 'per minute',
  }
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}

// ── Resetting Period ───────────────────────────────────────────────────────

export type CounterPeriod = 'daily' | 'weekly' | 'monthly'

export interface PeriodEntry {
  /** Period start as an ISO date (yyyy-mm-dd). */
  key: string
  total: number
}

export interface PeriodState {
  period: CounterPeriod
  /** The period the live count belongs to. */
  currentKey: string
  history: PeriodEntry[]
}

function isoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** The ISO date that starts the period `now` falls in. */
export function periodKey(period: CounterPeriod, now: Date): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'weekly') {
    // Weeks start Monday, so Sunday belongs to the week that just ended.
    const weekday = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - weekday)
  } else if (period === 'monthly') {
    date.setDate(1)
  }
  return isoDate(date)
}

export function periodState(raw: unknown, now: Date): PeriodState {
  const state = record(raw)
  const period: CounterPeriod = state.period === 'weekly'
    ? 'weekly'
    : state.period === 'monthly'
      ? 'monthly'
      : 'daily'
  const list = Array.isArray(state.history) ? state.history : []
  const seen = new Set<string>()
  const history: PeriodEntry[] = []
  for (const entry of list) {
    const item = record(entry)
    const key = typeof item.key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.key)
      ? item.key
      : null
    if (!key || seen.has(key)) continue
    seen.add(key)
    history.push({ key, total: safeCount(item.total) })
  }
  history.sort((left, right) => right.key.localeCompare(left.key))
  const storedKey = typeof state.currentKey === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(state.currentKey)
    ? state.currentKey
    : periodKey(period, now)
  return { period, currentKey: storedKey, history: history.slice(0, 12) }
}

/**
 * Roll the live count into history when the clock has crossed into a new
 * period. Returns the state to store and the count the card should now show.
 * A period that produced nothing is not written, so history stays meaningful.
 */
export function rollPeriod(
  state: PeriodState,
  count: number,
  now: Date,
): { state: PeriodState; count: number; rolled: boolean } {
  const key = periodKey(state.period, now)
  if (key === state.currentKey) return { state, count, rolled: false }
  const total = safeCount(count)
  const history = total === 0
    ? state.history
    : [{ key: state.currentKey, total }, ...state.history].slice(0, 12)
  return {
    state: { ...state, currentKey: key, history },
    count: 0,
    rolled: true,
  }
}

export function periodLabel(period: CounterPeriod): string {
  return period === 'weekly' ? 'This week' : period === 'monthly' ? 'This month' : 'Today'
}

/** Short, human date for a stored period key. */
export function periodEntryLabel(entry: PeriodEntry, period: CounterPeriod): string {
  const [year, month, day] = entry.key.split('-').map(Number)
  const date = new Date(year!, month! - 1, day!)
  if (period === 'monthly') {
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date)
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}
