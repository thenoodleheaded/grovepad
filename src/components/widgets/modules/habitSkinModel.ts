import type { HabitData, HabitSkinMode } from '../../../types/widgetDataCore'

/**
 * Pure, bounded readings for Habit Tracker skins.
 *
 * `HabitData.days` is the one completion truth every skin shares. Specialist
 * skins may remember richer input (routine steps or daily amounts), but a
 * persisted boolean always wins when it says a day is complete.
 */

const SKINS = new Set<HabitSkinMode>([
  'week_grid',
  'month_heatmap',
  'chain',
  'scorecard',
  'routine_stack',
  'minimum_target',
  'flexible_frequency',
])

export const HABIT_DAY_COUNT = 7
export const HABIT_ROUTINE_STEP_LIMIT = 4

export function habitSkinMode(raw: unknown): HabitSkinMode {
  return typeof raw === 'string' && SKINS.has(raw as HabitSkinMode)
    ? raw as HabitSkinMode
    : 'week_grid'
}

export function habitDays(raw: unknown): boolean[] {
  const source = Array.isArray(raw) ? raw : []
  return Array.from({ length: HABIT_DAY_COUNT }, (_, index) => source[index] === true)
}

export function habitDoneCount(raw: unknown): number {
  return habitDays(raw).filter(Boolean).length
}

export function habitBestRun(raw: unknown): number {
  let best = 0
  let current = 0
  for (const done of habitDays(raw)) {
    current = done ? current + 1 : 0
    best = Math.max(best, current)
  }
  return best
}

export function habitCompletionPercent(raw: unknown): number {
  return Math.round((habitDoneCount(raw) / HABIT_DAY_COUNT) * 100)
}

export interface HabitRoutineState {
  steps: string[]
  completions: boolean[][]
}

const cleanText = (raw: unknown, fallback: string): string => {
  if (typeof raw !== 'string') return fallback
  const value = raw.trim().slice(0, 44)
  return value || fallback
}

export function habitRoutineState(
  raw: unknown,
  canonicalDays: unknown,
  habitLabel = 'Daily habit',
): HabitRoutineState {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const sourceSteps = Array.isArray(source.steps) ? source.steps : []
  const fallbacks = ['Set the cue', cleanText(habitLabel, 'Do the habit'), 'Mark the win']
  const stepCount = Math.max(2, Math.min(HABIT_ROUTINE_STEP_LIMIT, sourceSteps.length || fallbacks.length))
  const steps = Array.from({ length: stepCount }, (_, index) => (
    cleanText(sourceSteps[index], fallbacks[index] ?? `Step ${index + 1}`)
  ))
  const saved = Array.isArray(source.completions) ? source.completions : []
  const days = habitDays(canonicalDays)
  const completions = Array.from({ length: HABIT_DAY_COUNT }, (_, dayIndex) => {
    if (days[dayIndex]) return Array(stepCount).fill(true) as boolean[]
    const row = Array.isArray(saved[dayIndex]) ? saved[dayIndex] as unknown[] : []
    return Array.from({ length: stepCount }, (_, stepIndex) => row[stepIndex] === true)
  })

  return { steps, completions }
}

export interface HabitTargetState {
  minimum: number
  target: number
  amounts: number[]
}

const boundedWhole = (raw: unknown, fallback: number, min: number, max: number): number => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  return Math.max(min, Math.min(max, Math.round(raw)))
}

export function habitTargetState(raw: unknown, canonicalDays: unknown): HabitTargetState {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const minimum = boundedWhole(source.minimum, 1, 1, 99)
  const target = boundedWhole(source.target, Math.max(2, minimum), minimum, 999)
  const saved = Array.isArray(source.amounts) ? source.amounts : []
  const days = habitDays(canonicalDays)
  const amounts = Array.from({ length: HABIT_DAY_COUNT }, (_, index) => {
    const amount = boundedWhole(saved[index], 0, 0, 999)
    return days[index] ? Math.max(minimum, amount) : amount
  })
  return { minimum, target, amounts }
}

export function habitFrequencyTarget(raw: unknown): number {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  return boundedWhole(source.target, 5, 1, HABIT_DAY_COUNT)
}

export function nextHabitData(data: HabitData, days: boolean[]): HabitData {
  const normalized = habitDays(days)
  return { ...data, days: normalized, streak: normalized.filter(Boolean).length }
}
