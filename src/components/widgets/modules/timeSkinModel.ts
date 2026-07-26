import type {
  CountdownData,
  TimekeeperData,
  TimekeeperMode,
  WorldClockData,
} from '../../../types/spatial'

export interface DeadlineReading {
  valid: boolean
  overdue: boolean
  days: number
  hours: number
  minutes: number
  targetLabel: string
}

export interface ZoneReading {
  valid: boolean
  time: string
  dayDelta: -1 | 0 | 1
  dateLabel: string
  offsetLabel: string
}

export interface IntervalState {
  workSeconds: number
  restSeconds: number
  rounds: number
  currentRound: number
  phase: 'work' | 'rest'
  remainingSeconds: number
  durationSeconds: number
  endAt: number | null
}

export interface ChessClockState {
  playerOne: string
  playerTwo: string
  durationSeconds: number
  remainingMs: [number, number]
  active: 0 | 1 | null
  startedAt: number | null
}

export interface TimerStage {
  id: string
  label: string
  durationSeconds: number
}

export interface MultiStageState {
  stages: TimerStage[]
  activeIndex: number
  remainingSeconds: number
  durationSeconds: number
  endAt: number | null
}

export const TIMEKEEPER_MODES = new Set<TimekeeperMode>([
  'countdown',
  'pomodoro',
  'stopwatch',
  'deadline',
  'world_clock',
  'hourglass',
  'intervals',
  'tabata',
  'chess_clock',
  'lap_timer',
  'multi_stage_timer',
])

export const ZONE_CHOICES: ReadonlyArray<{ tz: string; label: string }> = [
  { tz: 'America/Los_Angeles', label: 'Los Angeles' },
  { tz: 'America/Chicago', label: 'Chicago' },
  { tz: 'America/New_York', label: 'New York' },
  { tz: 'America/Sao_Paulo', label: 'São Paulo' },
  { tz: 'UTC', label: 'UTC' },
  { tz: 'Europe/London', label: 'London' },
  { tz: 'Europe/Paris', label: 'Paris' },
  { tz: 'Europe/Moscow', label: 'Moscow' },
  { tz: 'Asia/Dubai', label: 'Dubai' },
  { tz: 'Asia/Kolkata', label: 'Mumbai' },
  { tz: 'Asia/Shanghai', label: 'Shanghai' },
  { tz: 'Asia/Singapore', label: 'Singapore' },
  { tz: 'Asia/Tokyo', label: 'Tokyo' },
  { tz: 'Australia/Sydney', label: 'Sydney' },
  { tz: 'Pacific/Auckland', label: 'Auckland' },
]

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function finite(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function bounded(raw: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(finite(raw, fallback))))
}

function text(raw: unknown, fallback: string, max = 48): string {
  return typeof raw === 'string' && raw.trim()
    ? raw.trim().slice(0, max)
    : fallback
}

export function timekeeperMode(raw: unknown): TimekeeperMode {
  return typeof raw === 'string' && TIMEKEEPER_MODES.has(raw as TimekeeperMode)
    ? raw as TimekeeperMode
    : 'countdown'
}

export function defaultDeadline(now = new Date()): CountdownData {
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14)
  return {
    label: 'Launch day',
    targetDate: [
      target.getFullYear(),
      String(target.getMonth() + 1).padStart(2, '0'),
      String(target.getDate()).padStart(2, '0'),
    ].join('-'),
  }
}

export function deadlineData(data: TimekeeperData, now = new Date()): CountdownData {
  return data.deadline ?? defaultDeadline(now)
}

export function worldClockData(data: TimekeeperData): WorldClockData {
  return data.worldClock ?? { zones: ['America/New_York', 'Europe/London', 'Asia/Tokyo'] }
}

function localDate(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
    ? date
    : null
}

export function deadlineReading(targetDate: string, now = new Date()): DeadlineReading {
  const target = localDate(targetDate)
  if (!target) return { valid: false, overdue: false, days: 0, hours: 0, minutes: 0, targetLabel: 'Choose a date' }
  const remaining = target.getTime() - now.getTime()
  const absolute = Math.abs(remaining)
  return {
    valid: true,
    overdue: remaining < 0,
    days: Math.floor(absolute / 86_400_000),
    hours: Math.floor(absolute / 3_600_000) % 24,
    minutes: Math.floor(absolute / 60_000) % 60,
    targetLabel: new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: target.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    }).format(target),
  }
}

export function zoneLabel(tz: string): string {
  return ZONE_CHOICES.find((zone) => zone.tz === tz)?.label
    ?? tz.split('/').at(-1)?.replaceAll('_', ' ')
    ?? tz
}

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format()
    return true
  } catch {
    return false
  }
}

function dayKey(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date)
}

export function zoneReading(tz: string, now = new Date()): ZoneReading {
  if (!validTimeZone(tz)) return { valid: false, time: '--:--', dayDelta: 0, dateLabel: 'Unavailable', offsetLabel: '—' }
  const local = dayKey(now)
  const zoned = dayKey(now, tz)
  const dayDelta = zoned === local ? 0 : zoned > local ? 1 : -1
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(now)
  const dateLabel = new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  }).format(now)
  const offset = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value ?? 'UTC'
  return { valid: true, time, dayDelta, dateLabel, offsetLabel: offset.replace('GMT', 'UTC') }
}

export function intervalState(raw: unknown, preset: 'intervals' | 'tabata'): IntervalState {
  const source = record(raw)
  const defaults = preset === 'tabata'
    ? { work: 20, rest: 10, rounds: 8 }
    : { work: 300, rest: 60, rounds: 4 }
  const workSeconds = bounded(source.workSeconds, defaults.work, 5, 7200)
  const restSeconds = bounded(source.restSeconds, defaults.rest, 5, 3600)
  const phase = source.phase === 'rest' ? 'rest' : 'work'
  const phaseDuration = phase === 'work' ? workSeconds : restSeconds
  return {
    workSeconds,
    restSeconds,
    rounds: bounded(source.rounds, defaults.rounds, 1, 99),
    currentRound: bounded(source.currentRound, 1, 1, 99),
    phase,
    remainingSeconds: bounded(source.remainingSeconds, phaseDuration, 0, 7200),
    durationSeconds: bounded(source.durationSeconds, phaseDuration, 1, 7200),
    endAt: typeof source.endAt === 'number' && Number.isFinite(source.endAt) ? source.endAt : null,
  }
}

export function advanceInterval(state: IntervalState): IntervalState {
  if (state.phase === 'work') {
    return {
      ...state,
      phase: 'rest',
      endAt: null,
      remainingSeconds: state.restSeconds,
      durationSeconds: state.restSeconds,
    }
  }
  const nextRound = state.currentRound + 1
  return {
    ...state,
    currentRound: nextRound > state.rounds ? 1 : nextRound,
    phase: 'work',
    endAt: null,
    remainingSeconds: state.workSeconds,
    durationSeconds: state.workSeconds,
  }
}

export function chessClockState(raw: unknown): ChessClockState {
  const source = record(raw)
  const durationSeconds = bounded(source.durationSeconds, 300, 30, 10_800)
  const remaining = Array.isArray(source.remainingMs) ? source.remainingMs : []
  const active = source.active === 0 || source.active === 1 ? source.active : null
  return {
    playerOne: text(source.playerOne, 'White'),
    playerTwo: text(source.playerTwo, 'Black'),
    durationSeconds,
    remainingMs: [
      bounded(remaining[0], durationSeconds * 1000, 0, 10_800_000),
      bounded(remaining[1], durationSeconds * 1000, 0, 10_800_000),
    ],
    active,
    startedAt: active !== null && typeof source.startedAt === 'number' && Number.isFinite(source.startedAt)
      ? source.startedAt
      : null,
  }
}

export function chessRemaining(state: ChessClockState, now: number): [number, number] {
  const result: [number, number] = [...state.remainingMs]
  if (state.active !== null && state.startedAt !== null) {
    result[state.active] = Math.max(0, result[state.active] - (now - state.startedAt))
  }
  return result
}

export function multiStageState(raw: unknown): MultiStageState {
  const source = record(raw)
  const rawStages = Array.isArray(source.stages) ? source.stages : []
  const stages = rawStages.flatMap((item, index) => {
    const stage = record(item)
    if (index >= 8) return []
    return [{
      id: text(stage.id, `stage-${index + 1}`, 64),
      label: text(stage.label, `Stage ${index + 1}`),
      durationSeconds: bounded(stage.durationSeconds, 60, 5, 7200),
    }]
  })
  const safeStages = stages.length > 0 ? stages : [
    { id: 'prepare', label: 'Prepare', durationSeconds: 60 },
    { id: 'focus', label: 'Focus', durationSeconds: 300 },
    { id: 'recover', label: 'Recover', durationSeconds: 60 },
  ]
  const activeIndex = bounded(source.activeIndex, 0, 0, safeStages.length - 1)
  const durationSeconds = safeStages[activeIndex]!.durationSeconds
  return {
    stages: safeStages,
    activeIndex,
    remainingSeconds: bounded(source.remainingSeconds, durationSeconds, 0, 7200),
    durationSeconds: bounded(source.durationSeconds, durationSeconds, 1, 7200),
    endAt: typeof source.endAt === 'number' && Number.isFinite(source.endAt) ? source.endAt : null,
  }
}
