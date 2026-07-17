import { describe, expect, it } from 'vitest'
import { localDayKey, localDayKeyInDays } from './localDate'

describe('local calendar dates', () => {
  it('keeps a just-after-midnight local date on the same calendar day', () => {
    const localTime = new Date(2026, 6, 17, 0, 30)
    expect(localDayKey(localTime.getTime())).toBe('2026-07-17')
  })

  it('adds calendar days without converting through UTC', () => {
    const localTime = new Date(2026, 11, 31, 23, 30)
    expect(localDayKeyInDays(1, localTime.getTime())).toBe('2027-01-01')
  })
})
