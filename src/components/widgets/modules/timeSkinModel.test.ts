import { describe, expect, it } from 'vitest'
import {
  advanceInterval,
  chessClockState,
  chessRemaining,
  deadlineReading,
  intervalState,
  multiStageState,
  timekeeperMode,
  validTimeZone,
  zoneReading,
} from './timeSkinModel'

describe('Time skin model', () => {
  it('accepts every reviewed mode and falls back to Timer', () => {
    expect(timekeeperMode('world_clock')).toBe('world_clock')
    expect(timekeeperMode('chess_clock')).toBe('chess_clock')
    expect(timekeeperMode('unknown')).toBe('countdown')
  })

  it('calculates local deadline distance without UTC date drift', () => {
    const reading = deadlineReading('2026-07-27', new Date(2026, 6, 25, 12))
    expect(reading).toMatchObject({
      valid: true,
      overdue: false,
      days: 1,
      hours: 12,
    })
    expect(deadlineReading('not-a-date').valid).toBe(false)
  })

  it('formats safe IANA zone readings', () => {
    expect(validTimeZone('Asia/Tokyo')).toBe(true)
    expect(validTimeZone('Not/AZone')).toBe(false)
    const reading = zoneReading('UTC', new Date('2026-07-25T12:34:00Z'))
    expect(reading.time).toBe('12:34')
    expect(reading.offsetLabel).toContain('UTC')
  })

  it('sanitizes and advances interval protocols', () => {
    const state = intervalState({ workSeconds: 45, restSeconds: 15, rounds: 6 }, 'tabata')
    expect(state).toMatchObject({
      workSeconds: 45,
      restSeconds: 15,
      rounds: 6,
      phase: 'work',
      remainingSeconds: 45,
    })
    expect(advanceInterval(state)).toMatchObject({
      phase: 'rest',
      remainingSeconds: 15,
    })
    expect(advanceInterval(advanceInterval(state))).toMatchObject({
      phase: 'work',
      currentRound: 2,
      remainingSeconds: 45,
    })
  })

  it('commits only the active side of a chess clock', () => {
    const state = chessClockState({
      durationSeconds: 300,
      remainingMs: [300_000, 280_000],
      active: 0,
      startedAt: 1_000,
    })
    expect(chessRemaining(state, 6_000)).toEqual([295_000, 280_000])
  })

  it('bounds and defaults multi-stage sequences', () => {
    expect(multiStageState({}).stages.map((stage) => stage.label)).toEqual([
      'Prepare',
      'Focus',
      'Recover',
    ])
    expect(multiStageState({
      stages: [{ id: 'one', label: 'Warm up', durationSeconds: 30 }],
      activeIndex: 12,
    })).toMatchObject({
      activeIndex: 0,
      remainingSeconds: 30,
    })
  })
})
