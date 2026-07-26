import type { ChecklistItem } from '../../../types/spatial'
import { localDayKey } from '../../../utils/localDate'

/**
 * Pure model behind every Tasks skin.
 *
 * One rule governs the whole family: `items` is the single task collection and
 * `item.done` is the single completion truth every skin reads and writes. A
 * skin may sort, group, or lay the same tasks out differently, but it never
 * keeps a second copy of them. Anything a skin needs that a task does not
 * canonically own — a shopping quantity, a repeat rule, a sprint estimate, a
 * blocker, a routine's run count — is sanitized here and stored in that skin's
 * own isolated `skinStates` slot, so wearing one skin can never corrupt
 * another's settings or the shared list.
 */

export type TaskSkin =
  | 'list'
  | 'inbox'
  | 'shopping'
  | 'assignments'
  | 'day'
  | 'week'
  | 'board'
  | 'timeline'
  | 'matrix'
  | 'recurring'
  | 'sprint'
  | 'dependencies'
  | 'routine'

export type TaskStatus = 'todo' | 'doing' | 'done'

export type TaskQuadrant = 0 | 1 | 2 | 3

export type TaskRepeat = 'daily' | 'weekly' | 'monthly'

export interface TaskShoppingState {
  quantities: Record<string, number>
}

export interface TaskRecurringState {
  rules: Record<string, TaskRepeat>
  lastDone: Record<string, string>
}

export interface TaskSprintState {
  name: string
  owners: Record<string, string>
  estimates: Record<string, number>
}

export interface TaskDependencyState {
  blockedBy: Record<string, string>
}

export interface TaskRoutineState {
  runs: number
  lastRunAt: string
}

const TASK_SKINS = new Set<TaskSkin>([
  'list',
  'inbox',
  'shopping',
  'assignments',
  'day',
  'week',
  'board',
  'timeline',
  'matrix',
  'recurring',
  'sprint',
  'dependencies',
  'routine',
])

/** Skins that lay tasks out in two dimensions, so the card keeps a resize handle. */
const SPATIAL_SKINS = new Set<TaskSkin>([
  'week',
  'board',
  'timeline',
  'matrix',
  'sprint',
])

export function taskSkin(raw: unknown): TaskSkin {
  return typeof raw === 'string' && TASK_SKINS.has(raw as TaskSkin)
    ? raw as TaskSkin
    : 'list'
}

/** A Tasks card is content-height unless its skin is a two-dimensional canvas. */
export function taskSkinIsSpatial(raw: unknown): boolean {
  return SPATIAL_SKINS.has(taskSkin(raw))
}

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function idSet(items: readonly ChecklistItem[]): Set<string> {
  return new Set(items.map((item) => item.id))
}

/**
 * The three-state a row shows. `done` is canonical and always wins: a task
 * left with a stale `status: 'doing'` after a circuit checked it still reads
 * as finished, because that is what the Done count port already reports.
 */
export function taskStatus(item: ChecklistItem): TaskStatus {
  if (item.done) return 'done'
  return item.status === 'doing' ? 'doing' : 'todo'
}

/** Both halves of completion move together, so no skin can disagree with another. */
export function itemWithStatus(item: ChecklistItem, status: TaskStatus): ChecklistItem {
  return { ...item, status, done: status === 'done' }
}

export function taskProgress(items: readonly ChecklistItem[]): {
  done: number
  total: number
  percent: number
} {
  const total = items.length
  const done = items.filter((item) => item.done).length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

export type DueTone = 'none' | 'overdue' | 'today' | 'soon' | 'later'

export interface DueReading {
  key: string
  label: string
  tone: DueTone
}

/**
 * Day keys are compared as local calendar days — parsing "2026-07-25" through
 * `new Date()` alone reads it as UTC midnight, which puts anyone west of
 * Greenwich a day behind their own due dates.
 */
function dayNumber(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null
  return Math.round(date.getTime() / 86_400_000)
}

export function dueReading(raw: unknown, today: string = localDayKey()): DueReading {
  const key = typeof raw === 'string' ? raw.trim() : ''
  const due = dayNumber(key)
  const now = dayNumber(today)
  if (due === null || now === null) return { key: '', label: 'No date', tone: 'none' }

  const offset = due - now
  if (offset === 0) return { key, label: 'Today', tone: 'today' }
  if (offset === 1) return { key, label: 'Tomorrow', tone: 'soon' }
  if (offset === -1) return { key, label: 'Yesterday', tone: 'overdue' }
  if (offset < 0) return { key, label: `${-offset} days late`, tone: 'overdue' }

  const label = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
    .format(new Date(`${key}T12:00:00`))
  return { key, label, tone: offset <= 6 ? 'soon' : 'later' }
}

/** Dated work first, oldest deadline first; undated tasks keep their own order at the end. */
export function assignmentOrder(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items
    .map((item, index) => ({ item, index, day: dayNumber((item.due ?? '').trim()) }))
    .sort((left, right) => {
      if (left.day === right.day) return left.index - right.index
      if (left.day === null) return 1
      if (right.day === null) return -1
      return left.day - right.day
    })
    .map(({ item }) => item)
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function taskTime(raw: unknown): string {
  return typeof raw === 'string' && TIME_PATTERN.test(raw) ? raw : '09:00'
}

export function formatTaskTime(value: string): string {
  const time = taskTime(value)
  const [hour, minute] = time.split(':').map(Number)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2000, 0, 1, hour, minute))
}

/** One day's tasks read down the clock; equal times keep their entry order. */
export function dayOrder(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items
    .map((item, index) => ({ item, index, time: taskTime(item.time) }))
    .sort((left, right) => (
      left.time === right.time ? left.index - right.index : left.time < right.time ? -1 : 1
    ))
    .map(({ item }) => item)
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function taskDay(raw: unknown): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0
  return Math.min(6, Math.max(0, value))
}

export function weekColumns(items: readonly ChecklistItem[]): ChecklistItem[][] {
  return WEEKDAY_LABELS.map((_, day) => items.filter((item) => taskDay(item.day) === day))
}

export const BOARD_COLUMNS: readonly { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' },
  { status: 'doing', label: 'Doing' },
  { status: 'done', label: 'Done' },
]

export function boardColumns(
  items: readonly ChecklistItem[],
): { status: TaskStatus; label: string; items: ChecklistItem[] }[] {
  return BOARD_COLUMNS.map((column) => ({
    ...column,
    items: items.filter((item) => taskStatus(item) === column.status),
  }))
}

export interface TimelineBar {
  item: ChecklistItem
  start: number
  span: number
}

export interface TimelineReading {
  bars: TimelineBar[]
  totalUnits: number
}

/** Bars never start before the board or collapse to nothing, whatever was persisted. */
export function timelineReading(items: readonly ChecklistItem[]): TimelineReading {
  const bars = items.map((item, index) => {
    const rawStart = typeof item.start === 'number' && Number.isFinite(item.start)
      ? Math.round(item.start)
      : index
    const rawSpan = typeof item.span === 'number' && Number.isFinite(item.span)
      ? Math.round(item.span)
      : 1
    return {
      item,
      start: Math.max(0, rawStart),
      span: Math.min(24, Math.max(1, rawSpan)),
    }
  })
  return {
    bars,
    totalUnits: Math.max(4, ...bars.map((bar) => bar.start + bar.span)),
  }
}

export const MATRIX_QUADRANTS: readonly {
  quadrant: TaskQuadrant
  label: string
  hint: string
}[] = [
  { quadrant: 0, label: 'Do first', hint: 'Urgent · important' },
  { quadrant: 1, label: 'Schedule', hint: 'Important' },
  { quadrant: 2, label: 'Delegate', hint: 'Urgent' },
  { quadrant: 3, label: 'Drop', hint: 'Neither' },
]

export function taskQuadrant(raw: unknown): TaskQuadrant {
  return raw === 1 || raw === 2 || raw === 3 ? raw : 0
}

export function matrixQuadrants(
  items: readonly ChecklistItem[],
): { quadrant: TaskQuadrant; label: string; hint: string; items: ChecklistItem[] }[] {
  return MATRIX_QUADRANTS.map((quadrant) => ({
    ...quadrant,
    items: items.filter((item) => taskQuadrant(item.quadrant) === quadrant.quadrant),
  }))
}

/* Shopping ---------------------------------------------------------------- */

export function taskShoppingState(
  raw: unknown,
  items: readonly ChecklistItem[],
): TaskShoppingState {
  const state = safeRecord(raw)
  const known = idSet(items)
  const quantities: Record<string, number> = {}
  for (const [id, value] of Object.entries(safeRecord(state.quantities))) {
    if (!known.has(id) || typeof value !== 'number' || !Number.isFinite(value)) continue
    const quantity = Math.min(99, Math.max(1, Math.round(value)))
    if (quantity > 1) quantities[id] = quantity
  }
  return { quantities }
}

/** Everything still to buy first, the basket underneath — an errand reads that way. */
export function shoppingGroups(items: readonly ChecklistItem[]): {
  pending: ChecklistItem[]
  basket: ChecklistItem[]
} {
  return {
    pending: items.filter((item) => !item.done),
    basket: items.filter((item) => item.done),
  }
}

/* Recurring --------------------------------------------------------------- */

const REPEATS = new Set<TaskRepeat>(['daily', 'weekly', 'monthly'])

export function taskRecurringState(
  raw: unknown,
  items: readonly ChecklistItem[],
): TaskRecurringState {
  const state = safeRecord(raw)
  const known = idSet(items)
  const rules: Record<string, TaskRepeat> = {}
  for (const [id, value] of Object.entries(safeRecord(state.rules))) {
    if (known.has(id) && typeof value === 'string' && REPEATS.has(value as TaskRepeat)) {
      rules[id] = value as TaskRepeat
    }
  }
  const lastDone: Record<string, string> = {}
  for (const [id, value] of Object.entries(safeRecord(state.lastDone))) {
    if (known.has(id) && typeof value === 'string' && dayNumber(value) !== null) {
      lastDone[id] = value
    }
  }
  return { rules, lastDone }
}

export const REPEAT_LABELS: Record<TaskRepeat, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
}

export const REPEAT_ORDER: readonly TaskRepeat[] = ['daily', 'weekly', 'monthly']

/**
 * The next date a repeat lands on, counted in local calendar days so a monthly
 * task on the 31st rolls to the end of a short month rather than skipping it.
 */
export function nextOccurrence(from: string, repeat: TaskRepeat): string {
  const base = dayNumber(from) === null ? localDayKey() : from
  const [year, month, day] = base.split('-').map(Number)
  const date = new Date(year!, month! - 1, day!)
  if (repeat === 'daily') date.setDate(date.getDate() + 1)
  else if (repeat === 'weekly') date.setDate(date.getDate() + 7)
  else {
    const targetMonth = date.getMonth() + 1
    date.setDate(1)
    date.setMonth(targetMonth)
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(day!, lastDayOfMonth))
  }
  return localDayKey(date.getTime())
}

/* Sprint ------------------------------------------------------------------ */

export function taskSprintState(
  raw: unknown,
  items: readonly ChecklistItem[],
): TaskSprintState {
  const state = safeRecord(raw)
  const known = idSet(items)
  const owners: Record<string, string> = {}
  for (const [id, value] of Object.entries(safeRecord(state.owners))) {
    if (known.has(id) && typeof value === 'string' && value.trim()) {
      owners[id] = value.trim().slice(0, 40)
    }
  }
  const estimates: Record<string, number> = {}
  for (const [id, value] of Object.entries(safeRecord(state.estimates))) {
    if (!known.has(id) || typeof value !== 'number' || !Number.isFinite(value)) continue
    const points = Math.min(99, Math.max(0, Math.round(value)))
    if (points > 0) estimates[id] = points
  }
  return {
    name: typeof state.name === 'string' ? state.name.slice(0, 60) : '',
    owners,
    estimates,
  }
}

export function sprintPoints(
  items: readonly ChecklistItem[],
  state: TaskSprintState,
): number {
  return items.reduce((total, item) => total + (state.estimates[item.id] ?? 0), 0)
}

/** Two letters is all a shoulder-height avatar can carry; initials read faster than a truncated name. */
export function ownerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts.at(-1)![0]}`.toUpperCase()
}

/* Dependencies ------------------------------------------------------------ */

export interface DependencyReading {
  item: ChecklistItem
  blockedBy: ChecklistItem | null
  blocked: boolean
}

/**
 * A blocker must be another task on this same card, and the chain it forms
 * must be a chain: self-links, links to deleted tasks, and any link that would
 * close a cycle are dropped, so "what is blocking this" always terminates.
 */
export function taskDependencyState(
  raw: unknown,
  items: readonly ChecklistItem[],
): TaskDependencyState {
  const state = safeRecord(raw)
  const known = idSet(items)
  const accepted: Record<string, string> = {}

  for (const [id, value] of Object.entries(safeRecord(state.blockedBy))) {
    if (!known.has(id) || typeof value !== 'string' || value === id || !known.has(value)) continue
    // Walk the accepted chain from the proposed blocker; if it leads back here
    // the link would close a loop, so it never enters the map.
    let cursor: string | undefined = value
    const seen = new Set<string>([id])
    let closesCycle = false
    while (cursor) {
      if (seen.has(cursor)) { closesCycle = true; break }
      seen.add(cursor)
      cursor = accepted[cursor]
    }
    if (!closesCycle) accepted[id] = value
  }

  return { blockedBy: accepted }
}

export function dependencyReadings(
  items: readonly ChecklistItem[],
  state: TaskDependencyState,
): DependencyReading[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  return items.map((item) => {
    const blocker = byId.get(state.blockedBy[item.id] ?? '') ?? null
    return { item, blockedBy: blocker, blocked: Boolean(blocker && !blocker.done) }
  })
}

/* Routine ----------------------------------------------------------------- */

export function taskRoutineState(raw: unknown): TaskRoutineState {
  const state = safeRecord(raw)
  const runs = typeof state.runs === 'number' && Number.isFinite(state.runs)
    ? Math.min(9999, Math.max(0, Math.round(state.runs)))
    : 0
  const lastRunAt = typeof state.lastRunAt === 'string'
    && Number.isFinite(Date.parse(state.lastRunAt))
    ? state.lastRunAt
    : ''
  return { runs, lastRunAt }
}

export interface RoutineReading {
  currentId: string | null
  completed: number
  total: number
  finished: boolean
}

/** A routine is walked in order: the first unfinished step is the one you are on. */
export function routineReading(items: readonly ChecklistItem[]): RoutineReading {
  const current = items.find((item) => !item.done) ?? null
  const completed = items.filter((item) => item.done).length
  return {
    currentId: current?.id ?? null,
    completed,
    total: items.length,
    finished: items.length > 0 && completed === items.length,
  }
}
