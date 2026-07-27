import { describe, expect, it } from 'vitest'
import type { HabitData } from '../../../types/spatial'
import {
  habitBestRun,
  habitCompletionPercent,
  habitDays,
  habitFrequencyTarget,
  habitRoutineState,
  habitSkinMode,
  habitTargetState,
  nextHabitData,
} from './habitSkinModel'

describe('Habit skin model', () => {
  it('normalizes untrusted weeks without inventing completions', () => {
    expect(habitDays([true, 1, false, 'yes'])).toEqual([true, false, false, false, false, false, false])
    expect(habitDays(null)).toEqual(Array(7).fill(false))
    expect(habitSkinMode('chain')).toBe('chain')
    expect(habitSkinMode('unknown')).toBe('week_grid')
  })

  it('derives the score and longest honest chain from the canonical week', () => {
    const days = [true, true, false, true, true, true, false]
    expect(habitBestRun(days)).toBe(3)
    expect(habitCompletionPercent(days)).toBe(71)
  })

  it('lets canonical completion overrule stale partial routine state', () => {
    const routine = habitRoutineState(
      {
        steps: ['Cue', 'Read', 'Reward', 'Fourth'],
        completions: [[false, false, false, false]],
      },
      [true, false, false, false, false, false, false],
      'Read',
    )
    expect(routine.steps).toHaveLength(4)
    expect(routine.completions[0]).toEqual([true, true, true, true])
    expect(routine.completions[1]).toEqual([false, false, false, false])
  })

  it('bounds daily amounts and treats a wired completion as at least minimum', () => {
    const target = habitTargetState(
      { minimum: 3, target: 2, amounts: [-4, 9999, 1] },
      [true, false, false, false, false, false, false],
    )
    expect(target).toMatchObject({ minimum: 3, target: 3 })
    expect(target.amounts).toEqual([3, 999, 1, 0, 0, 0, 0])
  })

  it('keeps flexible frequency inside a real week', () => {
    expect(habitFrequencyTarget({ target: -10 })).toBe(1)
    expect(habitFrequencyTarget({ target: 99 })).toBe(7)
    expect(habitFrequencyTarget({ target: 'five' })).toBe(5)
  })

  it('updates the canonical count without dropping skin state', () => {
    const data = {
      label: 'Read',
      days: Array(7).fill(false),
      streak: 0,
      skin: 'chain',
      skinStates: { routine_stack: { steps: ['Cue', 'Read'] } },
    } as HabitData
    const next = nextHabitData(data, [true, false, true])
    expect(next.streak).toBe(2)
    expect(next.skin).toBe('chain')
    expect(next.skinStates).toEqual(data.skinStates)
  })
})
