import { describe, expect, it } from 'vitest'
import type { TripItineraryData } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { EXPANSION_WIDGET_DEFINITIONS } from './registry/expansion'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'days',
  'timeline',
  'bookings',
  'offline',
  'map',
  'group',
  'travel_day',
]

const base = (): TripItineraryData => ({
  tripName: 'Almaty',
  startDate: '2026-09-10',
  skin: 'days',
  days: [
    {
      id: 'd1',
      date: '2026-09-10',
      legs: [
        { id: 'flight', time: '07:40', what: 'Flight HY601', where: 'TAS → ALA', confirmation: 'HY-4471', booked: true },
        { id: 'dinner', time: '19:00', what: 'Dinner', where: 'Green Bazaar', confirmation: '', booked: false },
      ],
    },
  ],
})

const fold = (data: TripItineraryData) => {
  const model = restingFace({
    type: 'trip_itinerary',
    title: 'Trip',
    size: { width: 420, height: 300 },
    data,
  }).model
  if (model.kind !== 'rows') throw new Error(`expected rows, got ${model.kind}`)
  return model
}

describe('Trip Itinerary skin registry contract', () => {
  it('offers all seven purpose-built skins in catalogue order', () => {
    expect(
      skinsFor({ type: 'trip_itinerary' }, WIDGET_REGISTRY.trip_itinerary).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with a distinct icon', () => {
    const skins = EXPANSION_WIDGET_DEFINITIONS.trip_itinerary.skins!
    expect(skins.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('persists the worn skin without disturbing the canonical itinerary', () => {
    const original = base()
    const next = dataWearingSkin(
      { type: 'trip_itinerary', data: original },
      'bookings',
      WIDGET_REGISTRY.trip_itinerary,
    ) as TripItineraryData
    expect(WIDGET_REGISTRY.trip_itinerary.skinField).toBe('skin')
    expect(next.skin).toBe('bookings')
    expect(next.days).toEqual(original.days)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps specialist state when another skin is worn', () => {
    const withZones = dataWithSkinState(
      base(),
      'map',
      { legs: { flight: { zone: 'Airport' } } },
    ) as TripItineraryData
    const next = dataWearingSkin(
      { type: 'trip_itinerary', data: withZones },
      'group',
      WIDGET_REGISTRY.trip_itinerary,
    ) as TripItineraryData
    expect(next.skin).toBe('group')
    expect(next.skinStates?.map).toEqual({ legs: { flight: { zone: 'Airport' } } })
  })

  it('lets the renderer own every schema-extension editor', () => {
    expect(WIDGET_REGISTRY.trip_itinerary.rendererOwnedSkinDetails).toEqual([
      'map',
      'group',
      'travel_day',
    ])
    for (const skin of skinsFor({ type: 'trip_itinerary' }, WIDGET_REGISTRY.trip_itinerary)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.trip_itinerary.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })
})

describe('Trip Itinerary circuit and resting-face contract', () => {
  it('publishes its automation surface regardless of worn skin', () => {
    const data = { ...base(), skin: 'offline' as const }
    expect(fieldDescriptor('trip_itinerary', 'unbookedCount')?.get(data)).toBe(1)
    expect(typeof fieldDescriptor('trip_itinerary', 'daysUntil')?.get(data)).toBe('number')
  })

  it('rests with skin-specific context instead of a generic count', () => {
    const days = fold(base())
    expect(days.eyebrow).toMatchObject({ label: 'Itinerary', note: '1 unbooked', tone: 'warn' })
    expect(days.rows[0]).toMatchObject({ lead: '07:40', label: 'Flight HY601', done: true })

    const bookings = fold({ ...base(), skin: 'bookings' })
    expect(bookings.eyebrow).toMatchObject({ label: 'Bookings', note: '1 unbooked', tone: 'bad' })
    expect(bookings.rows[0]).toMatchObject({ label: 'Dinner', value: 'Unbooked', tone: 'bad' })
    expect(bookings.rows[1]).toMatchObject({ value: 'HY-4471', tone: 'good' })

    const offline = fold({ ...base(), skin: 'offline' })
    expect(offline.rows[0]).toMatchObject({ lead: '07:40', value: 'HY-4471' })

    const map = fold({
      ...base(),
      skin: 'map',
      skinStates: { map: { legs: { flight: { zone: 'Airport' } } } },
    })
    expect(map.eyebrow).toMatchObject({ label: 'Route', note: '1 area' })
    expect(map.rows[0]).toMatchObject({ value: 'Airport', tone: 'accent' })

    const group = fold({
      ...base(),
      skin: 'group',
      skinStates: { group: { legs: { dinner: { owner: 'Rustam' } } } },
    })
    expect(group.eyebrow).toMatchObject({ label: 'Group', note: '1 person' })
    expect(group.rows[1]).toMatchObject({ label: 'Dinner', value: 'Rustam' })

    const travelDay = fold({
      ...base(),
      skin: 'travel_day',
      skinStates: { travel_day: { legs: { flight: { bufferMinutes: 90 } } } },
    })
    expect(travelDay.eyebrow).toMatchObject({ label: 'Travel Day' })
    expect(travelDay.rows[0]).toMatchObject({ value: 'leave 06:10', tone: 'warn' })
  })
})
