import { describe, expect, it } from 'vitest'
import type { TripItineraryData } from '../../../types/spatial'
import {
  addTripDay,
  addTripLeg,
  bufferedLeaveBy,
  chronologicalTripLegs,
  dataWithTripLegDetails,
  legInvolvesPerson,
  orderedTripDays,
  removeTripDay,
  removeTripLeg,
  tripDayNumber,
  tripDays,
  tripItinerarySkinMode,
  tripLegCount,
  tripLegDetails,
  tripPeople,
  tripPhase,
  tripZoneGroups,
  unbookedTripLegs,
} from './tripItinerarySkinModel'

const base = (): TripItineraryData => ({
  tripName: 'Almaty',
  startDate: '2026-09-10',
  days: [
    {
      id: 'd2',
      date: '2026-09-11',
      legs: [
        { id: 'museum', time: '10:00', what: 'Museum', where: 'Old Town', confirmation: '', booked: false },
      ],
    },
    {
      id: 'd1',
      date: '2026-09-10',
      legs: [
        { id: 'hotel', time: '11:30', what: 'Check in', where: 'Hotel Kazzhol', confirmation: 'KZ-88213', booked: true },
        { id: 'flight', time: '07:40', what: 'Flight HY601', where: 'TAS → ALA', confirmation: 'HY-4471', booked: true },
      ],
    },
  ],
})

describe('Trip Itinerary skin model', () => {
  it('falls back to Days for stale skin values', () => {
    expect(tripItinerarySkinMode(undefined)).toBe('days')
    expect(tripItinerarySkinMode('postcards')).toBe('days')
    expect(tripItinerarySkinMode('travel_day')).toBe('travel_day')
  })

  it('normalizes untrusted days and bounds their content', () => {
    const days = tripDays([
      null,
      { id: 'ok', date: 'not a date', legs: [{ id: '', time: '9:5', what: 42, booked: 'yes' }, null] },
      { id: '', date: '2026-09-10', legs: 'nope' },
    ])
    expect(days).toHaveLength(2)
    expect(days[0]).toMatchObject({ id: 'ok', date: '' })
    expect(days[0]!.legs).toHaveLength(1)
    expect(days[0]!.legs[0]).toMatchObject({ id: 'leg-1-0', time: '', what: '', booked: false })
    expect(days[1]!.id).toBe('day-2')
    expect(days[1]!.legs).toEqual([])
  })

  it('orders days forward in time and sinks undated days without mutating', () => {
    const days = [...base().days, { id: 'loose', date: '', legs: [] }]
    const stored = days.map((day) => day.id)
    expect(orderedTripDays(days).map((day) => day.id)).toEqual(['d1', 'd2', 'loose'])
    expect(days.map((day) => day.id)).toEqual(stored)
  })

  it('flattens legs chronologically by day then time', () => {
    expect(chronologicalTripLegs(base().days).map(({ leg }) => leg.id))
      .toEqual(['flight', 'hotel', 'museum'])
  })

  it('counts legs and surfaces unbooked ones in order', () => {
    expect(tripLegCount(base().days)).toBe(3)
    expect(unbookedTripLegs(base().days).map(({ leg }) => leg.id)).toEqual(['museum'])
  })

  it('numbers trip days from the start date', () => {
    expect(tripDayNumber('2026-09-10', '2026-09-10')).toBe(1)
    expect(tripDayNumber('2026-09-10', '2026-09-13')).toBe(4)
    expect(tripDayNumber('', '2026-09-13')).toBeNull()
  })

  it('reads the trip phase as countdown, underway, or wrapped', () => {
    const trip = base()
    expect(tripPhase(trip.startDate, trip.days, '2026-09-01')).toEqual({ tone: 'ahead', label: 'In 9 days' })
    expect(tripPhase(trip.startDate, trip.days, '2026-09-09')).toEqual({ tone: 'ahead', label: 'In 1 day' })
    expect(tripPhase(trip.startDate, trip.days, '2026-09-11')).toEqual({ tone: 'underway', label: 'Day 2 of 2' })
    expect(tripPhase(trip.startDate, trip.days, '2026-09-14')).toEqual({ tone: 'past', label: 'Wrapped' })
    expect(tripPhase('', trip.days, '2026-09-14')).toBeNull()
  })

  it('stores specialist leg details under the worn skin only', () => {
    const next = dataWithTripLegDetails(base(), 'travel_day', 'flight', {
      transfer: 'Gate 12',
      bufferMinutes: 90,
    })
    expect(next.skin).toBe('travel_day')
    expect(tripLegDetails(next, 'travel_day').flight).toEqual({
      transfer: 'Gate 12',
      bufferMinutes: 90,
    })
    expect(tripLegDetails(next, 'map')).toEqual({})
    expect(next.days).toEqual(base().days)
  })

  it('drops emptied details instead of keeping blank pockets', () => {
    const filled = dataWithTripLegDetails(base(), 'map', 'museum', { zone: 'Old Town' })
    const emptied = dataWithTripLegDetails(filled, 'map', 'museum', { zone: '' })
    expect(tripLegDetails(emptied, 'map')).toEqual({})
  })

  it('ignores malformed persisted detail state', () => {
    const details = tripLegDetails({
      skinStates: {
        travel_day: {
          legs: {
            flight: { bufferMinutes: Number.NaN, localTime: '25:99', transfer: 7 },
            ghost: [],
          },
        },
      },
    }, 'travel_day')
    expect(details).toEqual({})
  })

  it('adds a day dated after the last, and a leg inheriting the last time', () => {
    const withDay = addTripDay(base(), 'd3')
    expect(withDay.days.at(-1)).toMatchObject({ id: 'd3', date: '2026-09-12', legs: [] })

    const withLeg = addTripLeg(base(), 'd1', 'dinner')
    const day = withLeg.days.find((item) => item.id === 'd1')!
    expect(day.legs.at(-1)).toMatchObject({ id: 'dinner', time: '07:40', booked: false })
  })

  it('prunes every skin pocket when a leg or its day is removed', () => {
    let data = dataWithTripLegDetails(base(), 'map', 'flight', { zone: 'Airport' })
    data = dataWithTripLegDetails(data, 'group', 'flight', { owner: 'Amir' })
    data = dataWithTripLegDetails(data, 'group', 'museum', { owner: 'Rustam' })

    const withoutLeg = removeTripLeg(data, 'd1', 'flight')
    expect(withoutLeg.days.find((day) => day.id === 'd1')!.legs.map((leg) => leg.id)).toEqual(['hotel'])
    expect(tripLegDetails(withoutLeg, 'map')).toEqual({})
    expect(tripLegDetails(withoutLeg, 'group')).toEqual({ museum: { owner: 'Rustam' } })

    const withoutDay = removeTripDay(data, 'd1')
    expect(withoutDay.days.map((day) => day.id)).toEqual(['d2'])
    expect(tripLegDetails(withoutDay, 'map')).toEqual({})
    expect(tripLegDetails(withoutDay, 'group')).toEqual({ museum: { owner: 'Rustam' } })
  })

  it('derives leave-by from the buffer without wrapping past midnight', () => {
    expect(bufferedLeaveBy('07:40', 90)).toBe('06:10')
    expect(bufferedLeaveBy('00:30', 90)).toBe('00:00')
    expect(bufferedLeaveBy('07:40', 0)).toBeNull()
    expect(bufferedLeaveBy('', 30)).toBeNull()
  })

  it('clusters stops by zone with unplaced stops trailing', () => {
    let data = dataWithTripLegDetails(base(), 'map', 'flight', { zone: 'Airport' })
    data = dataWithTripLegDetails(data, 'map', 'museum', { zone: 'Old Town' })
    const groups = tripZoneGroups(tripDays(data.days), tripLegDetails(data, 'map'))
    expect(groups.map((group) => group.zone)).toEqual(['Airport', 'Old Town', 'Unplaced'])
    expect(groups.at(-1)!.legs.map(({ leg }) => leg.id)).toEqual(['hotel'])
  })

  it('collects people from owners and companions for the Group filter', () => {
    const details = {
      flight: { owner: 'Amir', who: 'Rustam, Dana' },
      museum: { who: 'Dana' },
    }
    expect(tripPeople(details)).toEqual(['Amir', 'Dana', 'Rustam'])
    expect(legInvolvesPerson(details.flight, 'dana')).toBe(true)
    expect(legInvolvesPerson(details.museum, 'Amir')).toBe(false)
    expect(legInvolvesPerson(undefined, 'Amir')).toBe(false)
  })
})
