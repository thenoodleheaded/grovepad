import { describe, expect, it } from 'vitest'
import type { DatePickerData } from '../../../types/spatial'
import {
  anniversaryYears,
  dataWithDateState,
  dateDurationDays,
  dateReading,
  dateSkinMode,
  dayInMonth,
  dayStart,
  daysBetween,
  daysUntilDay,
  deadlineLeadDays,
  deadlineProgress,
  deadlineUrgency,
  nextAnniversary,
  nextRecurrence,
  rangeEndDay,
  rangeSpan,
  recurrenceLabel,
  recurrenceOccurrences,
  recurrenceOf,
  relativePhrase,
  shiftDay,
} from './dateSkinModel'

/** A fixed local noon, so nothing here depends on when the suite runs. */
const NOW = new Date(2026, 6, 26, 12, 0, 0).getTime()

const card = (patch: Partial<DatePickerData> = {}): DatePickerData => ({
  label: 'Target date',
  date: '2026-07-30',
  time: '',
  includeTime: false,
  mode: 'date_time',
  ...patch,
})

describe('day arithmetic', () => {
  it('rejects a key that is not a real calendar day', () => {
    expect(dayStart('2026-02-31')).toBeNull()
    expect(dayStart('2026-7-1')).toBeNull()
    expect(dayStart('nonsense')).toBeNull()
    expect(dayStart('2026-02-28')).not.toBeNull()
    expect(dayStart('2028-02-29')).not.toBeNull()
  })

  it('measures whole calendar days across a daylight-saving boundary', () => {
    // Northern-hemisphere clocks move in late March and late October; a span
    // that crosses one must still be a whole number of days.
    expect(daysBetween('2026-03-27', '2026-03-30')).toBe(3)
    expect(daysBetween('2026-10-23', '2026-10-30')).toBe(7)
    expect(daysBetween('2026-07-30', '2026-07-26')).toBe(-4)
  })

  it('moves by local calendar days rather than by milliseconds', () => {
    expect(shiftDay('2026-03-28', 1)).toBe('2026-03-29')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('', 1)).toBe('')
  })

  it('clamps a day-of-month into a shorter month', () => {
    expect(dayInMonth(2026, 2, 31)).toBe('2026-02-28')
    expect(dayInMonth(2028, 2, 29)).toBe('2028-02-29')
    expect(dayInMonth(2026, 11, 7)).toBe('2026-11-07')
  })
})

describe('skin resolution', () => {
  it('reads the retired countdown mode back as the Deadline skin', () => {
    expect(dateSkinMode('countdown')).toBe('deadline')
    expect(dateSkinMode('milestone')).toBe('milestone')
    expect(dateSkinMode('nonsense')).toBe('date_time')
    expect(dateSkinMode(undefined)).toBe('date_time')
  })
})

describe('relative phrasing', () => {
  it('coarsens the unit as the distance grows', () => {
    expect(relativePhrase(0)).toBe('Today')
    expect(relativePhrase(1)).toBe('Tomorrow')
    expect(relativePhrase(-1)).toBe('Yesterday')
    expect(relativePhrase(4)).toMatch(/day/i)
    expect(relativePhrase(21)).toMatch(/week/i)
    expect(relativePhrase(-90)).toMatch(/month/i)
    expect(relativePhrase(800)).toMatch(/year/i)
  })
})

describe('deadline', () => {
  it('defaults to a thirty-day runway and keeps a chosen one', () => {
    expect(deadlineLeadDays(card())).toBe(30)
    const withLead = dataWithDateState(card({ mode: 'deadline' }), 'deadline', { leadDays: 7 })
    expect(deadlineLeadDays(withLead)).toBe(7)
  })

  it('names the temperature of the remaining time', () => {
    expect(deadlineUrgency(-1)).toBe('overdue')
    expect(deadlineUrgency(0)).toBe('due')
    expect(deadlineUrgency(2)).toBe('urgent')
    expect(deadlineUrgency(6)).toBe('soon')
    expect(deadlineUrgency(40)).toBe('calm')
    expect(deadlineUrgency(null)).toBe('calm')
  })

  it('spends the runway between nothing and everything', () => {
    expect(deadlineProgress(30, 30)).toBe(0)
    expect(deadlineProgress(15, 30)).toBe(0.5)
    expect(deadlineProgress(0, 30)).toBe(1)
    // Further out than its own window reads as untouched, not as a negative.
    expect(deadlineProgress(90, 30)).toBe(0)
    expect(deadlineProgress(-9, 30)).toBe(1)
    expect(deadlineProgress(null, 30)).toBe(0)
  })
})

describe('anniversary', () => {
  it('rolls a past occasion forward to its next occurrence', () => {
    expect(nextAnniversary('1998-09-04', NOW)).toBe('2026-09-04')
    // Already gone this year, so the answer is next year's.
    expect(nextAnniversary('1998-03-11', NOW)).toBe('2027-03-11')
  })

  it('counts today as the next occurrence rather than as late', () => {
    expect(nextAnniversary('2014-07-26', NOW)).toBe('2026-07-26')
    expect(daysUntilDay(nextAnniversary('2014-07-26', NOW), NOW)).toBe(0)
  })

  it('keeps a leap-day occasion annual by clamping it', () => {
    expect(nextAnniversary('2000-02-29', NOW)).toBe('2027-02-28')
  })

  it('numbers the occurrence from the original year', () => {
    expect(anniversaryYears('2014-09-04', '2026-09-04')).toBe(12)
    expect(anniversaryYears('2026-09-04', '2026-09-04')).toBe(0)
  })
})

describe('range', () => {
  const ranged = () => dataWithDateState(
    card({ date: '2026-07-24', mode: 'range' }),
    'range',
    { end: '2026-07-30' },
  )

  it('keeps the far end beside the skin and the start in the card', () => {
    const data = ranged()
    expect(data.date).toBe('2026-07-24')
    expect(rangeEndDay(data)).toBe('2026-07-30')
  })

  it('measures nights, days and today’s position inside the span', () => {
    const span = rangeSpan('2026-07-24', '2026-07-30', NOW)
    expect(span).toMatchObject({ nights: 6, days: 7, state: 'during' })
    expect(span?.progress).toBeCloseTo(2 / 6, 5)
  })

  it('reads a back-to-front range as a real span rather than a negative one', () => {
    expect(rangeSpan('2026-07-30', '2026-07-24', NOW)).toMatchObject({
      start: '2026-07-24',
      end: '2026-07-30',
      nights: 6,
    })
  })

  it('reports before and after without pushing progress past its ends', () => {
    expect(rangeSpan('2026-08-01', '2026-08-04', NOW)).toMatchObject({ state: 'before', progress: 0 })
    expect(rangeSpan('2026-06-01', '2026-06-04', NOW)).toMatchObject({ state: 'after', progress: 1 })
  })

  it('publishes a duration only for the skin that has one', () => {
    expect(dateDurationDays(ranged(), NOW)).toBe(6)
    expect(dateDurationDays(card({ mode: 'deadline' }), NOW)).toBeNull()
  })
})

describe('recurring date', () => {
  const repeating = (state: Record<string, unknown>, date = '2026-01-05') =>
    dataWithDateState(card({ date, mode: 'recurring_date' }), 'recurring_date', state)

  it('defaults to a weekly rule and names it in words', () => {
    expect(recurrenceOf(card())).toEqual({ unit: 'week', interval: 1 })
    expect(recurrenceLabel({ unit: 'week', interval: 1 })).toBe('Every week')
    expect(recurrenceLabel({ unit: 'day', interval: 3 })).toBe('Every 3 days')
  })

  it('walks a long-past weekly rule to the next occurrence on or after today', () => {
    const rule = recurrenceOf(repeating({ unit: 'week', interval: 2 }))
    const next = nextRecurrence('2026-01-05', rule, NOW)
    expect(daysUntilDay(next, NOW)).toBeGreaterThanOrEqual(0)
    expect(daysUntilDay(next, NOW)).toBeLessThan(14)
    // Every occurrence stays on the rule's own weekday.
    expect(daysBetween('2026-01-05', next)! % 14).toBe(0)
  })

  it('does not creep off the original day-of-month after a short month', () => {
    const occurrences = recurrenceOccurrences(
      '2026-01-31',
      { unit: 'month', interval: 1 },
      4,
      new Date(2026, 0, 1, 12).getTime(),
    )
    expect(occurrences).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('starts at a future start rather than before it', () => {
    expect(recurrenceOccurrences('2026-09-01', { unit: 'day', interval: 1 }, 2, NOW))
      .toEqual(['2026-09-01', '2026-09-02'])
  })

  it('returns nothing without a usable start', () => {
    expect(recurrenceOccurrences('', { unit: 'week', interval: 1 }, 4, NOW)).toEqual([])
  })
})

describe('the shared reading', () => {
  it('points a repeating skin at its next occurrence, not at the stored day', () => {
    const anniversary = dateReading(card({ date: '1998-09-04', mode: 'anniversary' }), NOW)
    expect(anniversary.day).toBe('2026-09-04')
    expect(anniversary.days).toBe(40)
    expect(anniversary.state).toBe('upcoming')
  })

  it('points a range at its earlier end', () => {
    const data = dataWithDateState(
      card({ date: '2026-08-10', mode: 'range' }),
      'range',
      { end: '2026-08-01' },
    )
    expect(dateReading(data, NOW).day).toBe('2026-08-01')
  })

  it('reports an unset card without inventing a distance', () => {
    const reading = dateReading(card({ date: '' }), NOW)
    expect(reading).toMatchObject({ day: '', days: null, state: 'unset' })
    expect(reading.phrase).toBe('No date set')
  })

  it('marks a passed day overdue and includes a kept time in the detail', () => {
    const reading = dateReading(
      card({ date: '2026-07-20', time: '09:30', includeTime: true, mode: 'deadline' }),
      NOW,
    )
    expect(reading).toMatchObject({ days: -6, state: 'overdue', skin: 'deadline' })
    expect(reading.detail).toContain('·')
  })

  it('ignores a half-typed time rather than printing it', () => {
    const reading = dateReading(card({ time: '9:3', includeTime: true }), NOW)
    expect(reading.detail).not.toContain('·')
  })
})

describe('skin state isolation', () => {
  it('keeps one skin’s specialist fields when another is worn', () => {
    const withRange = dataWithDateState(card({ mode: 'range' }), 'range', { end: '2026-08-02' })
    const withMilestone = dataWithDateState(
      { ...withRange, mode: 'milestone' },
      'milestone',
      { owner: 'Ada', status: 'active' },
    )
    expect(withMilestone.skinStates?.range).toEqual({ end: '2026-08-02' })
    expect(withMilestone.skinStates?.milestone).toEqual({ owner: 'Ada', status: 'active' })
    expect(withMilestone.date).toBe(card().date)
  })

  it('drops a cleared field instead of persisting an empty string', () => {
    const set = dataWithDateState(card({ mode: 'milestone' }), 'milestone', { owner: 'Ada' })
    const cleared = dataWithDateState(set, 'milestone', { owner: '' })
    expect(cleared.skinStates).toBeUndefined()
  })
})
