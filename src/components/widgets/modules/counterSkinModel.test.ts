import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GOAL_TARGET,
  counterSkin,
  formatElapsed,
  goalCounterState,
  goalReading,
  multiCounterState,
  multiCounterTotal,
  periodEntryLabel,
  periodKey,
  periodState,
  rateReading,
  rollPeriod,
  safeCount,
  tallyGroups,
  timedRateState,
} from './counterSkinModel'

describe('counterSkin', () => {
  it('falls back to the tally for unknown values', () => {
    expect(counterSkin(undefined)).toBe('tally')
    expect(counterSkin('retired')).toBe('tally')
  })

  it('keeps every declared skin', () => {
    for (const skin of [
      'tally', 'clicker', 'goal_counter', 'up_down',
      'multi_counter', 'timed_rate', 'resetting_period',
    ]) {
      expect(counterSkin(skin)).toBe(skin)
    }
  })
})

describe('safeCount', () => {
  it('rounds and survives junk', () => {
    expect(safeCount(3.6)).toBe(4)
    expect(safeCount('12')).toBe(12)
    expect(safeCount('abc')).toBe(0)
    expect(safeCount(undefined)).toBe(0)
    expect(safeCount(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('tallyGroups', () => {
  it('splits into gates of five', () => {
    expect(tallyGroups(12)).toEqual({ groups: 2, remainder: 2 })
    expect(tallyGroups(5)).toEqual({ groups: 1, remainder: 0 })
    expect(tallyGroups(0)).toEqual({ groups: 0, remainder: 0 })
  })

  it('treats a negative count as nothing to draw', () => {
    expect(tallyGroups(-4)).toEqual({ groups: 0, remainder: 0 })
  })

  it('caps the drawing rather than emitting thousands of marks', () => {
    expect(tallyGroups(10_000)).toEqual({ groups: 40, remainder: 0 })
  })
})

describe('goalCounterState', () => {
  it('defaults when nothing is stored', () => {
    expect(goalCounterState(undefined).target).toBe(DEFAULT_GOAL_TARGET)
  })

  it('never allows a zero or negative target', () => {
    expect(goalCounterState({ target: 0 }).target).toBe(1)
    expect(goalCounterState({ target: -30 }).target).toBe(1)
  })
})

describe('goalReading', () => {
  it('reports remaining and percent', () => {
    const reading = goalReading(3, { target: 10 })
    expect(reading.remaining).toBe(7)
    expect(reading.percent).toBe(30)
    expect(reading.reached).toBe(false)
  })

  it('clamps an overshoot instead of overflowing the ring', () => {
    const reading = goalReading(25, { target: 10 })
    expect(reading.progress).toBe(1)
    expect(reading.percent).toBe(100)
    expect(reading.remaining).toBe(0)
    expect(reading.reached).toBe(true)
  })

  it('clamps a negative count to an empty ring', () => {
    expect(goalReading(-5, { target: 10 }).progress).toBe(0)
  })
})

describe('multiCounterState', () => {
  it('reads nothing from junk', () => {
    expect(multiCounterState(undefined).counters).toEqual([])
    expect(multiCounterState({ counters: 'nope' }).counters).toEqual([])
  })

  it('drops entries without a usable id, and duplicates', () => {
    const state = multiCounterState({
      counters: [
        { id: 'a', label: 'Tea', count: 2 },
        { label: 'No id', count: 9 },
        { id: 'a', label: 'Duplicate', count: 5 },
        { id: 'b', count: '4' },
      ],
    })
    expect(state.counters).toEqual([
      { id: 'a', label: 'Tea', count: 2 },
      { id: 'b', label: '', count: 4 },
    ])
  })

  it('totals the tallies', () => {
    expect(multiCounterTotal({
      counters: [
        { id: 'a', label: '', count: 3 },
        { id: 'b', label: '', count: 4 },
      ],
    })).toBe(7)
  })
})

describe('timedRateState', () => {
  it('starts stopped', () => {
    expect(timedRateState(undefined)).toEqual({
      startedAt: null,
      baseline: 0,
      window: 'minute',
    })
  })

  it('keeps a stored run', () => {
    expect(timedRateState({ startedAt: 1000, baseline: 5, window: 'hour' })).toEqual({
      startedAt: 1000,
      baseline: 5,
      window: 'hour',
    })
  })
})

describe('rateReading', () => {
  it('counts only events since measurement began', () => {
    const reading = rateReading(30, { startedAt: 0, baseline: 10, window: 'minute' }, 60_000)
    expect(reading.events).toBe(20)
    expect(reading.rate).toBeCloseTo(20, 5)
    expect(reading.running).toBe(true)
  })

  it('extrapolates to the chosen window', () => {
    const reading = rateReading(10, { startedAt: 0, baseline: 0, window: 'hour' }, 60_000)
    expect(reading.rate).toBeCloseTo(600, 5)
    expect(reading.windowLabel).toBe('per hour')
  })

  it('refuses to extrapolate from almost no elapsed time', () => {
    const reading = rateReading(5, { startedAt: 0, baseline: 0, window: 'minute' }, 200)
    expect(reading.rate).toBe(0)
  })

  it('never reports negative events after a manual reset', () => {
    const reading = rateReading(2, { startedAt: 0, baseline: 10, window: 'minute' }, 60_000)
    expect(reading.events).toBe(0)
  })
})

describe('formatElapsed', () => {
  it('shows minutes and seconds, adding hours when needed', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_000)).toBe('01:05')
    expect(formatElapsed(3_725_000)).toBe('1:02:05')
  })
})

describe('periodKey', () => {
  // A Wednesday.
  const wed = new Date(2026, 6, 15, 13, 30)

  it('keys a day by its own date', () => {
    expect(periodKey('daily', wed)).toBe('2026-07-15')
  })

  it('keys a week by its Monday', () => {
    expect(periodKey('weekly', wed)).toBe('2026-07-13')
  })

  it('treats Sunday as the end of the week that began Monday', () => {
    const sun = new Date(2026, 6, 19, 9, 0)
    expect(periodKey('weekly', sun)).toBe('2026-07-13')
  })

  it('keys a month by the first', () => {
    expect(periodKey('monthly', wed)).toBe('2026-07-01')
  })
})

describe('periodState', () => {
  const now = new Date(2026, 6, 15)

  it('defaults to a daily period anchored on today', () => {
    const state = periodState(undefined, now)
    expect(state.period).toBe('daily')
    expect(state.currentKey).toBe('2026-07-15')
    expect(state.history).toEqual([])
  })

  it('drops malformed history keys and sorts newest first', () => {
    const state = periodState({
      period: 'weekly',
      currentKey: '2026-07-13',
      history: [
        { key: '2026-06-29', total: 4 },
        { key: 'not-a-date', total: 9 },
        { key: '2026-07-06', total: 7 },
      ],
    }, now)
    expect(state.history.map((entry) => entry.key)).toEqual(['2026-07-06', '2026-06-29'])
  })
})

describe('rollPeriod', () => {
  const state = { period: 'daily' as const, currentKey: '2026-07-14', history: [] }

  it('does nothing inside the same period', () => {
    const same = { ...state, currentKey: '2026-07-15' }
    const result = rollPeriod(same, 6, new Date(2026, 6, 15, 22))
    expect(result.rolled).toBe(false)
    expect(result.count).toBe(6)
  })

  it('banks the finished period and zeroes the live count', () => {
    const result = rollPeriod(state, 6, new Date(2026, 6, 15))
    expect(result.rolled).toBe(true)
    expect(result.count).toBe(0)
    expect(result.state.currentKey).toBe('2026-07-15')
    expect(result.state.history).toEqual([{ key: '2026-07-14', total: 6 }])
  })

  it('does not record an empty period', () => {
    const result = rollPeriod(state, 0, new Date(2026, 6, 15))
    expect(result.rolled).toBe(true)
    expect(result.state.history).toEqual([])
  })

  it('keeps history bounded', () => {
    const long = {
      ...state,
      history: Array.from({ length: 12 }, (_, index) => ({
        key: `2026-06-${String(index + 1).padStart(2, '0')}`,
        total: index,
      })),
    }
    const result = rollPeriod(long, 3, new Date(2026, 6, 15))
    expect(result.state.history).toHaveLength(12)
    expect(result.state.history[0]!.key).toBe('2026-07-14')
  })
})

describe('periodEntryLabel', () => {
  it('names a month for monthly periods and a day otherwise', () => {
    expect(periodEntryLabel({ key: '2026-07-01', total: 3 }, 'monthly')).toMatch(/Jul/)
    expect(periodEntryLabel({ key: '2026-07-14', total: 3 }, 'daily')).toMatch(/14/)
  })
})
