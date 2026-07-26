import { describe, expect, it } from 'vitest'
import {
  bearingDegrees,
  capturedAgo,
  compassPoint,
  coordinateNotation,
  distanceMeters,
  fenceVerdict,
  formatCoordinates,
  formatDistance,
  geofenceRadius,
  locationPoint,
  locationSkinMode,
  nextNotation,
  placeName,
  routeReading,
  routeStops,
  sunReading,
  zonedReading,
} from './locationSkinModel'

const LONDON = { latitude: 51.5074, longitude: -0.1278 }
const PARIS = { latitude: 48.8566, longitude: 2.3522 }

describe('Location skin model', () => {
  it('falls back to the plain pin for stale or unknown skins', () => {
    expect(locationSkinMode('compass')).toBe('compass')
    expect(locationSkinMode('teleporter')).toBe('pin')
    expect(locationSkinMode(undefined)).toBe('pin')
  })

  /**
   * Half a coordinate pair is not a place. Persisted board data is untrusted,
   * so a record carrying only a latitude — or a value outside the globe —
   * must read as "no location", never as a point at the equator.
   */
  it('accepts only a complete, in-range coordinate pair', () => {
    expect(locationPoint(LONDON)).toEqual(LONDON)
    expect(locationPoint({ latitude: 51.5, longitude: null })).toBeNull()
    expect(locationPoint({ latitude: 120, longitude: 10 })).toBeNull()
    expect(locationPoint({ latitude: Number.NaN, longitude: 10 })).toBeNull()
    expect(locationPoint(null)).toBeNull()
  })

  it('measures the great-circle distance and initial bearing between two places', () => {
    const meters = distanceMeters(LONDON, PARIS)
    expect(meters).toBeGreaterThan(340_000)
    expect(meters).toBeLessThan(346_000)
    expect(distanceMeters(LONDON, LONDON)).toBeCloseTo(0, 6)

    const bearing = bearingDegrees(LONDON, PARIS)
    expect(bearing).toBeGreaterThan(144)
    expect(bearing).toBeLessThan(152)
    expect(compassPoint(bearing)).toBe('SSE')
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(359)).toBe('N')
    expect(compassPoint(270)).toBe('W')
  })

  it('shows distance at the precision it is actually known to', () => {
    expect(formatDistance(0)).toEqual({ value: '0', unit: 'm' })
    expect(formatDistance(999)).toEqual({ value: '999', unit: 'm' })
    expect(formatDistance(1000)).toEqual({ value: '1.0', unit: 'km' })
    expect(formatDistance(343_500)).toEqual({ value: '344', unit: 'km' })
    expect(formatDistance(Number.NaN).value).toBe('—')
  })

  it('writes one point three ways without changing it', () => {
    expect(formatCoordinates(LONDON, 'decimal')).toBe('51.507400, -0.127800')
    expect(formatCoordinates(LONDON, 'dms')).toMatch(/^51° 30′ .+ N {2}0° 07′ .+ W$/)
    expect(formatCoordinates(LONDON, 'geo')).toBe('geo:51.507400,-0.127800')

    expect(coordinateNotation('dms')).toBe('dms')
    expect(coordinateNotation('nonsense')).toBe('decimal')
    expect(nextNotation('decimal')).toBe('dms')
    expect(nextNotation('geo')).toBe('decimal')
  })

  /**
   * The reader's own timezone is whatever machine this runs on, so the fixed
   * fact worth asserting is the gap BETWEEN two places: both readings are
   * measured against the same reader, and Tashkent is four hours ahead of
   * London in July whoever is looking.
   */
  it('reads the clock at a place and its distance from the reader’s own', () => {
    const at = Date.UTC(2026, 6, 25, 12, 34, 56)
    const utc = zonedReading('UTC', at)

    expect(utc.valid).toBe(true)
    expect(utc.time).toBe('12:34')
    expect(utc.seconds).toBe('56')
    expect(utc.date).toBe('Sat 25 Jul')

    const tashkent = zonedReading('Asia/Tashkent', at)
    const london = zonedReading('Europe/London', at)
    expect(tashkent.offsetMinutes - london.offsetMinutes).toBe(240)
    expect(tashkent.time).toBe('17:34')
  })

  it('says so plainly when the stored timezone is not one this device knows', () => {
    const reading = zonedReading('Mars/Olympus_Mons', Date.UTC(2026, 6, 25, 12, 0, 0))
    expect(reading.valid).toBe(false)
    expect(reading.offsetLabel).toBe('Unknown timezone')
    expect(reading.time).toMatch(/^\d{2}:\d{2}$/)
  })

  it('names the reader’s own offset in plain words', () => {
    const at = Date.UTC(2026, 6, 25, 12, 0, 0)
    const here = zonedReading(Intl.DateTimeFormat().resolvedOptions().timeZone, at)
    expect(here.offsetLabel).toBe('Same time as you')
    expect(here.offsetMinutes).toBe(0)
  })

  it('computes real sunrise and sunset from the place’s own latitude', () => {
    // Midsummer in London: light before five, dark after nine.
    const midsummer = sunReading(LONDON, 'Europe/London', Date.UTC(2026, 5, 21, 11, 0, 0))
    expect(midsummer.kind).toBe('day')
    expect(midsummer.sunriseMinutes).toBeGreaterThan(4 * 60)
    expect(midsummer.sunriseMinutes).toBeLessThan(5 * 60)
    expect(midsummer.sunsetMinutes).toBeGreaterThan(21 * 60)
    expect(midsummer.sunsetMinutes).toBeLessThan(22 * 60)
    expect(midsummer.sunrise).toMatch(/^0[45]:\d{2}$/)

    // 03:00 UTC on the same day is 04:00 in London — still before sunrise.
    expect(sunReading(LONDON, 'Europe/London', Date.UTC(2026, 5, 21, 3, 0, 0)).kind).toBe('night')

    // Above the Arctic Circle in June the sun does not set at all.
    const svalbard = sunReading({ latitude: 78.2, longitude: 15.6 }, 'Arctic/Longyearbyen', Date.UTC(2026, 5, 21, 12, 0, 0))
    expect(svalbard.kind).toBe('polar_day')
    expect(svalbard.sunrise).toBeNull()
  })

  it('clamps a fence to a usable radius and reports which side of it you are on', () => {
    expect(geofenceRadius({})).toBe(250)
    expect(geofenceRadius({ radiusMeters: 5 })).toBe(25)
    expect(geofenceRadius({ radiusMeters: 9_999_999 })).toBe(50_000)
    expect(geofenceRadius({ radiusMeters: 'wide' })).toBe(250)

    const nearby = { latitude: 51.5079, longitude: -0.1278 }
    const inside = fenceVerdict(LONDON, nearby, 250)
    expect(inside.inside).toBe(true)
    expect(inside.distanceMeters).toBeLessThan(100)
    expect(inside.edgeMeters).toBeCloseTo(250 - inside.distanceMeters, 6)

    const outside = fenceVerdict(LONDON, PARIS, 250)
    expect(outside.inside).toBe(false)
    expect(outside.edgeMeters).toBeGreaterThan(340_000)
  })

  it('keeps a named stop that has no coordinates yet, and leaves it out of the total', () => {
    const stops = routeStops({
      stops: [
        { id: 'a', label: 'Paris', latitude: PARIS.latitude, longitude: PARIS.longitude },
        { id: 'b', label: 'Somewhere', latitude: null, longitude: null },
        { label: 'Back home', latitude: LONDON.latitude, longitude: LONDON.longitude },
      ],
    })

    expect(stops).toHaveLength(3)
    expect(stops[2]!.id).toBe('stop-2')

    const reading = routeReading(LONDON, stops)
    expect(reading.unlocated).toBe(1)
    expect(reading.legs[0]!.meters).toBeGreaterThan(340_000)
    expect(reading.legs[1]!.meters).toBeNull()
    // The unlocated stop breaks no chain: the leg after it is measured from
    // Paris, the last place actually known.
    expect(reading.legs[2]!.meters).toBeGreaterThan(340_000)
    expect(reading.totalMeters).toBeCloseTo(
      reading.legs[0]!.meters! + reading.legs[2]!.meters!,
      6,
    )
  })

  it('ignores stop data that is not shaped like a stop', () => {
    expect(routeStops({})).toEqual([])
    expect(routeStops({ stops: 'Paris' })).toEqual([])
    expect(routeStops({ stops: [null] })[0]).toEqual({
      id: 'stop-0',
      label: '',
      latitude: null,
      longitude: null,
    })
    expect(routeStops({ stops: [{ latitude: 400, longitude: -400 }] })[0]).toMatchObject({
      latitude: 90,
      longitude: -180,
    })
  })

  it('says how fresh a capture is, and names a place that has no name', () => {
    const now = Date.UTC(2026, 6, 25, 12, 0, 0)
    expect(capturedAgo(null, now)).toBe('Never captured')
    expect(capturedAgo(now - 5_000, now)).toBe('Just now')
    expect(capturedAgo(now - 20 * 60_000, now)).toBe('20 min ago')
    expect(capturedAgo(now - 5 * 3_600_000, now)).toBe('5 h ago')
    expect(capturedAgo(now - 26 * 3_600_000, now)).toBe('Yesterday')
    expect(capturedAgo(now - 5 * 86_400_000, now)).toBe('5 days ago')

    expect(placeName('Studio', 'Main street')).toBe('Studio')
    expect(placeName('  ', 'Main street')).toBe('Main street')
    expect(placeName('', '')).toBe('Untitled place')
  })
})
