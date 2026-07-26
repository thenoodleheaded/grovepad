import { describe, expect, it } from 'vitest'
import type {
  CountdownData,
  PomodoroData,
  StopwatchData,
  TimekeeperData,
  TimerData,
  WorldClockData,
} from '../types/spatial'
import { consolidateWidgetData } from '../utils/consolidatedWidgetData'
import { commandsFor, fieldsFor } from './fields'
import {
  isWidgetTypePublic,
  publicWidgetTypeFor,
  widgetDefinition,
} from './registry'

describe('Time widget consolidation', () => {
  it('publishes one Time card and preserves legacy types for existing boards', () => {
    expect(isWidgetTypePublic('timekeeper')).toBe(true)
    for (const type of ['timer', 'pomodoro', 'stopwatch', 'countdown', 'world_clock'] as const) {
      expect(publicWidgetTypeFor(type)).toBe('timekeeper')
      expect(isWidgetTypePublic(type)).toBe(false)
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

  it.each([
    ['timer', { label: 'Tea', durationSeconds: 60, remainingSeconds: 30, endAt: null }],
    ['pomodoro', { label: 'Focus', workMinutes: 25, breakMinutes: 5, phase: 'work', endAt: null, remainingSeconds: 1500, completed: 4 }],
    ['stopwatch', { elapsedMs: 5000, startedAt: null, laps: [5000] }],
    ['countdown', { label: 'Launch', targetDate: '2026-08-10' }],
    ['world_clock', { zones: ['UTC', 'Asia/Tokyo'] }],
  ] as const)('converts generated %s data without losing its useful state', (type, legacyData) => {
    const converted = consolidateWidgetData(
      type,
      legacyData as TimerData | PomodoroData | StopwatchData | CountdownData | WorldClockData,
    )
    expect(converted.type).toBe('timekeeper')
    const data = converted.data as TimekeeperData
    if (type === 'timer') expect(data.countdown).toEqual(legacyData)
    if (type === 'pomodoro') expect(data.pomodoro).toEqual(legacyData)
    if (type === 'stopwatch') expect(data.stopwatch).toEqual(legacyData)
    if (type === 'countdown') expect(data.deadline).toEqual(legacyData)
    if (type === 'world_clock') expect(data.worldClock).toEqual(legacyData)
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
