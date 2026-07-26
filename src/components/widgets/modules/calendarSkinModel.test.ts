import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  availabilityState,
  calendarMonthGrid,
  calendarSkin,
  nextShift,
  occasionState,
  shiftRotaState,
  startOfCalendarWeek,
  weekDayKeys,
} from './calendarSkinModel'

describe('Calendar skin model', () => {
  it('builds a stable six-row Monday-first month grid', () => {
    const cells = calendarMonthGrid(2026, 6)
    expect(cells).toHaveLength(42)
    expect(cells[0]).toEqual({ day: 29, inMonth: false, iso: '2026-06-29' })
    expect(cells[2]).toEqual({ day: 1, inMonth: true, iso: '2026-07-01' })
    expect(cells[41]).toEqual({ day: 9, inMonth: false, iso: '2026-08-09' })
  })

  it('moves through local calendar weeks without UTC date drift', () => {
    expect(startOfCalendarWeek('2026-07-25')).toBe('2026-07-20')
    expect(weekDayKeys('2026-07-25')).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ])
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('sanitizes free/busy and rota state while preserving valid details', () => {
    expect(availabilityState({
      anchorDate: 'bad',
      busy: {
        '2026-07-25': ['morning', 'morning', 'evening', 'invalid'],
        nope: ['morning'],
      },
    }, '2026-07-20')).toEqual({
      anchorDate: '2026-07-20',
      busy: { '2026-07-25': ['morning', 'evening'] },
    })
    expect(shiftRotaState({
      anchorDate: '2026-07-25',
      assignee: 'Ada',
      role: 'Support',
      shifts: { '2026-07-25': 'night', '2026-07-26': 'invalid' },
    }, '2026-07-20')).toEqual({
      anchorDate: '2026-07-25',
      assignee: 'Ada',
      role: 'Support',
      shifts: { '2026-07-25': 'night' },
    })
    expect(nextShift('night')).toBe('off')
    expect(nextShift('off')).toBe('morning')
  })

  it('keeps valid recurring occasions and rejects malformed records', () => {
    expect(occasionState({
      occasions: [
        { id: 'ada', name: 'Ada', date: '12-10', kind: 'birthday' },
        { id: 'pair', name: 'The Parkers', date: '02-29', kind: 'anniversary' },
        { id: 'bad', name: 'Bad date', date: '02-30', kind: 'birthday' },
        { id: 'ada', name: 'Duplicate', date: '01-01', kind: 'birthday' },
      ],
    })).toEqual({
      occasions: [
        { id: 'ada', name: 'Ada', date: '12-10', kind: 'birthday' },
        { id: 'pair', name: 'The Parkers', date: '02-29', kind: 'anniversary' },
      ],
    })
    expect(calendarSkin('unknown')).toBe('month')
  })
})
