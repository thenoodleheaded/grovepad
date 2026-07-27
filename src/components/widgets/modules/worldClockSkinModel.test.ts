import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKING_WINDOW,
  hourLabel,
  meetingPlannerState,
  meetingRows,
  overlapHours,
  sunReading,
  travelClockState,
  workingWindow,
  worldClockSkin,
  zoneBands,
  zoneClockFace,
  zoneHourFraction,
  zoneOffsetMinutes,
  zoneSuggestions,
} from './worldClockSkinModel'

// A winter instant, so the northern zones sit on standard time and the
// expected offsets are stable rather than DST-dependent.
const WINTER = new Date('2026-01-15T12:00:00.000Z')
// A summer instant, to prove the offsets are sampled and not assumed.
const SUMMER = new Date('2026-07-15T12:00:00.000Z')

describe('worldClockSkin', () => {
  it('falls back to the city grid for unknown or missing values', () => {
    expect(worldClockSkin(undefined)).toBe('city_grid')
    expect(worldClockSkin('nonsense')).toBe('city_grid')
    expect(worldClockSkin(7)).toBe('city_grid')
  })

  it('keeps every declared skin', () => {
    for (const skin of [
      'city_grid',
      'analog_wall',
      'overlap_band',
      'meeting_planner',
      'travel_clock',
      'sunlight',
    ]) {
      expect(worldClockSkin(skin)).toBe(skin)
    }
  })
})

describe('zoneOffsetMinutes', () => {
  it('reads whole-hour zones', () => {
    expect(zoneOffsetMinutes('UTC', WINTER)).toBe(0)
    expect(zoneOffsetMinutes('America/New_York', WINTER)).toBe(-300)
    expect(zoneOffsetMinutes('Asia/Tokyo', WINTER)).toBe(540)
  })

  it('reads half-hour zones', () => {
    expect(zoneOffsetMinutes('Asia/Kolkata', WINTER)).toBe(330)
  })

  it('samples daylight saving at the given instant', () => {
    expect(zoneOffsetMinutes('Europe/London', WINTER)).toBe(0)
    expect(zoneOffsetMinutes('Europe/London', SUMMER)).toBe(60)
    expect(zoneOffsetMinutes('America/New_York', SUMMER)).toBe(-240)
  })

  it('treats an unusable zone as UTC rather than throwing', () => {
    expect(zoneOffsetMinutes('Not/AZone', WINTER)).toBe(0)
  })
})

describe('zoneHourFraction', () => {
  it('places the local hour of day', () => {
    expect(zoneHourFraction('UTC', WINTER)).toBeCloseTo(12, 5)
    expect(zoneHourFraction('America/New_York', WINTER)).toBeCloseTo(7, 5)
    expect(zoneHourFraction('Asia/Kolkata', WINTER)).toBeCloseTo(17.5, 5)
  })

  it('wraps across midnight instead of going negative', () => {
    const fraction = zoneHourFraction('America/Los_Angeles', new Date('2026-01-15T02:00:00.000Z'))
    expect(fraction).toBeCloseTo(18, 5)
  })
})

describe('zoneClockFace', () => {
  it('turns the local time into hand angles', () => {
    const face = zoneClockFace('UTC', new Date('2026-01-15T03:30:00.000Z'))
    expect(face.hourAngle).toBeCloseTo(105, 5)
    expect(face.minuteAngle).toBeCloseTo(180, 5)
  })

  it('marks the small hours as night', () => {
    expect(zoneClockFace('UTC', new Date('2026-01-15T03:00:00.000Z')).night).toBe(true)
    expect(zoneClockFace('UTC', new Date('2026-01-15T13:00:00.000Z')).night).toBe(false)
  })
})

describe('workingWindow', () => {
  it('defaults when nothing is stored', () => {
    expect(workingWindow(undefined)).toEqual(DEFAULT_WORKING_WINDOW)
  })

  it('clamps hours into the day', () => {
    expect(workingWindow({ start: -4, end: 44 })).toEqual({ start: 0, end: 23 })
  })

  it('repairs an inverted window instead of rendering nothing', () => {
    expect(workingWindow({ start: 18, end: 9 })).toEqual({ start: 18, end: 19 })
  })
})

describe('zoneBands', () => {
  const zones = ['UTC', 'Asia/Tokyo', 'America/New_York']

  it('aligns every row to the first city', () => {
    const bands = zoneBands(zones, WINTER, DEFAULT_WORKING_WINDOW)
    expect(bands.map((band) => band.shift)).toEqual([0, 9, -5])
    expect(bands[0]!.localHours[0]).toBe(0)
    expect(bands[1]!.localHours[0]).toBe(9)
    expect(bands[2]!.localHours[0]).toBe(19)
  })

  it('marks the working hours of each city in its own local time', () => {
    const [utc] = zoneBands(['UTC'], WINTER, { start: 9, end: 17 })
    expect(utc!.working[8]).toBe(false)
    expect(utc!.working[9]).toBe(true)
    expect(utc!.working[16]).toBe(true)
    expect(utc!.working[17]).toBe(false)
  })

  it('returns nothing without a reference city', () => {
    expect(zoneBands([], WINTER, DEFAULT_WORKING_WINDOW)).toEqual([])
  })
})

describe('overlapHours', () => {
  it('finds the hours that suit everyone', () => {
    const bands = zoneBands(['UTC', 'Europe/Paris'], WINTER, { start: 9, end: 17 })
    // Paris runs an hour ahead, so the shared window is 09:00-16:00 UTC.
    expect(overlapHours(bands)).toEqual([9, 10, 11, 12, 13, 14, 15])
  })

  it('reports none when the windows never meet', () => {
    const bands = zoneBands(['UTC', 'Asia/Tokyo'], WINTER, { start: 9, end: 17 })
    expect(overlapHours(bands)).toEqual([])
  })

  it('reports none for an empty board', () => {
    expect(overlapHours([])).toEqual([])
  })
})

describe('meetingRows', () => {
  it('converts one reference hour into every local hour', () => {
    const rows = meetingRows(['UTC', 'Asia/Tokyo'], WINTER, 9, DEFAULT_WORKING_WINDOW)
    expect(rows[0]!.localHour).toBe(9)
    expect(rows[0]!.comfortable).toBe(true)
    expect(rows[1]!.localHour).toBe(18)
    expect(rows[1]!.comfortable).toBe(false)
    expect(rows[1]!.tolerable).toBe(true)
  })

  it('flags the day it lands on', () => {
    const rows = meetingRows(['UTC', 'Asia/Tokyo'], WINTER, 20, DEFAULT_WORKING_WINDOW)
    expect(rows[1]!.dayDelta).toBe(1)
    expect(rows[1]!.localHour).toBe(5)

    const back = meetingRows(['UTC', 'America/Los_Angeles'], WINTER, 2, DEFAULT_WORKING_WINDOW)
    expect(back[1]!.dayDelta).toBe(-1)
    expect(back[1]!.localHour).toBe(18)
  })

  it('marks the middle of the night as neither comfortable nor tolerable', () => {
    const rows = meetingRows(['UTC'], WINTER, 3, DEFAULT_WORKING_WINDOW)
    expect(rows[0]!.comfortable).toBe(false)
    expect(rows[0]!.tolerable).toBe(false)
  })
})

describe('meetingPlannerState', () => {
  it('starts on the reference city\'s current hour', () => {
    expect(meetingPlannerState(undefined, WINTER, 'UTC').hour).toBe(12)
  })

  it('keeps a stored hour and window', () => {
    const state = meetingPlannerState(
      { hour: 15, window: { start: 8, end: 16 } },
      WINTER,
      'UTC',
    )
    expect(state.hour).toBe(15)
    expect(state.window).toEqual({ start: 8, end: 16 })
  })

  it('ignores an unusable stored hour', () => {
    expect(meetingPlannerState({ hour: 'noon' }, WINTER, 'UTC').hour).toBe(12)
  })
})

describe('travelClockState', () => {
  const zones = ['Europe/London', 'Asia/Tokyo', 'America/New_York']

  it('pairs the first two cities by default', () => {
    const pairing = travelClockState(undefined, zones, WINTER)
    expect(pairing.home).toBe('Europe/London')
    expect(pairing.away).toBe('Asia/Tokyo')
    expect(pairing.shift).toBe(9)
  })

  it('keeps a stored pairing that still exists', () => {
    const pairing = travelClockState(
      { home: 'Asia/Tokyo', away: 'America/New_York' },
      zones,
      WINTER,
    )
    expect(pairing.home).toBe('Asia/Tokyo')
    expect(pairing.shift).toBe(-14)
  })

  it('drops a city that has since been removed', () => {
    const pairing = travelClockState(
      { home: 'Pacific/Auckland', away: 'Asia/Tokyo' },
      zones,
      WINTER,
    )
    expect(pairing.home).toBe('Europe/London')
  })

  it('survives an empty board', () => {
    expect(travelClockState(undefined, [], WINTER)).toEqual({ home: '', away: '', shift: 0 })
  })
})

describe('sunReading', () => {
  it('reports daylight inside the civil day', () => {
    const noon = sunReading('UTC', WINTER)
    expect(noon.daylight).toBe(true)
    expect(noon.progress).toBeCloseTo(0.5, 5)
  })

  it('reports night outside it, with no progress', () => {
    const night = sunReading('UTC', new Date('2026-01-15T23:00:00.000Z'))
    expect(night.daylight).toBe(false)
    expect(night.progress).toBe(0)
  })
})

describe('zoneSuggestions', () => {
  it('hides cities already on the card', () => {
    const suggestions = zoneSuggestions(['Europe/London'], '')
    expect(suggestions.some((zone) => zone.tz === 'Europe/London')).toBe(false)
  })

  it('matches on label or zone name, case-insensitively', () => {
    expect(zoneSuggestions([], 'toky').map((zone) => zone.tz)).toEqual(['Asia/Tokyo'])
    expect(zoneSuggestions([], 'PACIFIC').map((zone) => zone.tz)).toEqual(['Pacific/Auckland'])
  })
})

describe('hourLabel', () => {
  it('pads and wraps', () => {
    expect(hourLabel(0)).toBe('00:00')
    expect(hourLabel(9)).toBe('09:00')
    expect(hourLabel(25)).toBe('01:00')
    expect(hourLabel(-1)).toBe('23:00')
  })
})
