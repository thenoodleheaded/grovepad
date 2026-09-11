import { describe, expect, it } from 'vitest'
import type {
  TimekeeperData,
} from '../types/spatial'
import { commandsFor, fieldsFor } from './fields'
import {
  isWidgetTypePublic,
  widgetDefinition,
  WIDGET_REGISTRY,
} from './registry'

describe('Time widget consolidation', () => {
  it('publishes one Time card and leaves no trace of the legacy clocks', () => {
    expect(isWidgetTypePublic('timekeeper')).toBe(true)
    // Each former clock is deleted, not hidden: Timekeeper's skins are the
    // only way to get one now.
    for (const type of ['timer', 'pomodoro', 'stopwatch', 'countdown', 'world_clock']) {
      expect(Object.keys(WIDGET_REGISTRY)).not.toContain(type)
    }
  })

  it('keeps every Time skin in its reviewed order', () => {
    expect(widgetDefinition('timekeeper').skins?.map((skin) => skin.value)).toEqual([
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
  })

  it('starts every clock skin with its own saved state', () => {
    const data = widgetDefinition('timekeeper').defaultData() as TimekeeperData
    expect(data.pomodoro.workMinutes).toBe(25)
    expect(data.stopwatch.laps).toEqual([])
    expect(data.worldClock?.zones).toHaveLength(3)
  })

  it('exposes the combined clock signals and commands through circuits', () => {
    expect(fieldsFor('timekeeper').map((field) => field.key)).toEqual([
      'running',
      'mode',
      'days_left',
      'days_until',
      'sessions_done',
      'completed',
      'primary_time',
      'zone_count',
    ])
    expect(commandsFor('timekeeper').map((command) => command.key)).toEqual([
      'reset',
      'add_zone',
    ])
  })
})
