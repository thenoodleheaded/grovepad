import { describe, expect, it } from 'vitest'
import type { HabitData } from '../types/spatial'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { commandsFor, fieldDescriptor } from './fields'
import { DATA_TRACKING_WIDGET_DEFINITIONS } from './registry/dataTrackingWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'week_grid',
  'month_heatmap',
  'chain',
  'scorecard',
  'routine_stack',
  'minimum_target',
  'flexible_frequency',
]

describe('Habit Tracker skin registry contract', () => {
  it('offers every designed skin in deliberate order with a distinct icon', () => {
    const declared = DATA_TRACKING_WIDGET_DEFINITIONS.habit.skins
    expect(skinsFor({ type: 'habit' }, WIDGET_REGISTRY.habit).map((skin) => skin.value)).toEqual(expected)
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('wears a skin without changing any day', () => {
    const original = {
      label: 'Read',
      days: [true, false, true, false, false, false, false],
      streak: 2,
    } as HabitData
    const next = dataWearingSkin(
      { type: 'habit', data: original },
      'scorecard',
      WIDGET_REGISTRY.habit,
    ) as HabitData
    expect(WIDGET_REGISTRY.habit.skinField).toBe('skin')
    expect(next.skin).toBe('scorecard')
    expect(next.days).toEqual(original.days)
    expect(next.streak).toBe(2)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps specialist settings while another skin is worn', () => {
    const withRoutine = dataWithSkinState(
      {
        label: 'Read',
        days: Array(7).fill(false),
        streak: 0,
        skin: 'routine_stack',
      } as HabitData,
      'routine_stack',
      { steps: ['Make tea', 'Read'] },
    ) as HabitData
    const next = dataWearingSkin(
      { type: 'habit', data: withRoutine },
      'chain',
      WIDGET_REGISTRY.habit,
    ) as HabitData
    expect(next.skinStates?.routine_stack).toEqual({ steps: ['Make tea', 'Read'] })
  })

  it('preserves skin details through reset and keeps the circuit count canonical', () => {
    const data = {
      label: 'Read',
      days: [true, true, false, false, false, false, false],
      streak: 2,
      skin: 'minimum_target',
      skinStates: { minimum_target: { minimum: 2, target: 5 } },
    } as HabitData
    expect(fieldDescriptor('habit', 'streak')?.get(data)).toBe(2)

    const reset = commandsFor('habit').find((command) => command.key === 'reset')
    const cleared = reset!.run(data) as HabitData
    expect(cleared.days).toEqual(Array(7).fill(false))
    expect(cleared.skin).toBe('minimum_target')
    expect(cleared.skinStates).toEqual(data.skinStates)
  })

  it('lets the renderer own every advanced skin editor', () => {
    expect(WIDGET_REGISTRY.habit.rendererOwnedSkinDetails).toEqual([
      'routine_stack',
      'minimum_target',
      'flexible_frequency',
    ])
  })
})
