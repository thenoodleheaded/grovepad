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
  MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM,
  MAP_TILE_PX,
  mapScaleBar,
  mapTiles,
  mapZoom,
  metersPerPixel,
  nextNotation,
  panned,
  projectPoint,
  tileLatitude,
  tileLongitude,
  tileUrl,
  tileX,
  tileY,
  wrapLongitude,
  zoomFraming,
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

describe('the map a place is remembered on', () => {
  const TASHKENT = { latitude: 41.3111, longitude: 69.2797 }

  it('keeps a framing it recognizes and falls back to street level', () => {
    expect(mapZoom({ zoom: 12 })).toBe(12)
    expect(mapZoom({})).toBe(MAP_DEFAULT_ZOOM)
    expect(mapZoom({ zoom: 'close' })).toBe(MAP_DEFAULT_ZOOM)
    // Persisted board data is untrusted: a zoom off either end is pulled back
    // to a level tiles actually exist at.
    expect(mapZoom({ zoom: 40 })).toBe(MAP_MAX_ZOOM)
    expect(mapZoom({ zoom: -5 })).toBe(2)
    expect(mapZoom({ zoom: 14.6 })).toBe(15)
  })

  it('names each framing the way a person would', () => {
    expect(zoomFraming(18)).toBe('Building')
    expect(zoomFraming(15)).toBe('Street')
    expect(zoomFraming(13)).toBe('Neighbourhood')
    expect(zoomFraming(11)).toBe('City')
    expect(zoomFraming(8)).toBe('Region')
    expect(zoomFraming(3)).toBe('Country')
  })

  /**
   * The projection is the whole contract: get it wrong by a tile and the pin
   * sits on the wrong street. These are the reference values of Web Mercator.
   */
  it('projects longitude and latitude onto the tile grid', () => {
    // At zoom 0 the world is one tile, so Greenwich and the equator land dead
    // centre of it.
    expect(tileX(0, 0)).toBeCloseTo(0.5, 10)
    expect(tileY(0, 0)).toBeCloseTo(0.5, 10)
    expect(tileX(-180, 0)).toBeCloseTo(0, 10)
    expect(tileX(180, 0)).toBeCloseTo(1, 10)
    // The poles are past the edge of the projection and clamp to it.
    expect(tileY(90, 0)).toBeCloseTo(0, 6)
    expect(tileY(-90, 0)).toBeCloseTo(1, 6)
    // Tashkent at zoom 15, the level a street is read at.
    expect(Math.floor(tileX(TASHKENT.longitude, 15))).toBe(22689)
    expect(Math.floor(tileY(TASHKENT.latitude, 15))).toBe(12247)
  })

  it('reads the grid back into a place unchanged', () => {
    for (const zoom of [2, 9, 15, 19]) {
      expect(tileLongitude(tileX(TASHKENT.longitude, zoom), zoom)).toBeCloseTo(TASHKENT.longitude, 9)
      expect(tileLatitude(tileY(TASHKENT.latitude, zoom), zoom)).toBeCloseTo(TASHKENT.latitude, 9)
    }
  })

  it('folds a longitude that has walked round the world', () => {
    expect(wrapLongitude(200)).toBeCloseTo(-160, 10)
    expect(wrapLongitude(-200)).toBeCloseTo(160, 10)
    expect(wrapLongitude(69.2797)).toBeCloseTo(69.2797, 10)
  })

  it('asks a tile server only for tiles that exist', () => {
    expect(tileUrl(22689, 12247, 15)).toBe('https://tile.openstreetmap.org/15/22689/12247.png')
    // A column past the antimeridian wraps rather than 404ing.
    expect(tileUrl(4, 1, 2)).toBe('https://tile.openstreetmap.org/2/0/1.png')
    expect(tileUrl(-1, 1, 2)).toBe('https://tile.openstreetmap.org/2/3/1.png')
  })

  it('covers the viewport, and covers it only once', () => {
    const tiles = mapTiles(TASHKENT, 15, 512, 256)
    // A 512x256 box needs at most 3 columns and 2 rows once the centre lands
    // mid-tile, and every tile is placed inside or overlapping the box.
    expect(tiles.length).toBeGreaterThanOrEqual(6)
    expect(tiles.length).toBeLessThanOrEqual(12)
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(tiles.length)
    for (const tile of tiles) {
      expect(tile.left).toBeGreaterThan(-MAP_TILE_PX)
      expect(tile.left).toBeLessThan(512)
      expect(tile.top).toBeGreaterThan(-MAP_TILE_PX)
      expect(tile.top).toBeLessThan(256)
    }
  })

  it('draws nothing for a viewport with no size, and nothing above the pole', () => {
    expect(mapTiles(TASHKENT, 15, 0, 0)).toEqual([])
    // At zoom 2 the world is four rows; a view at the top of the projection
    // has empty sky above it rather than tiles that do not exist.
    const rows = new Set(mapTiles({ latitude: 84, longitude: 0 }, 2, 256, 512).map((tile) => tile.key.split('/')[2]))
    expect([...rows].every((row) => Number(row) >= 0)).toBe(true)
  })

  it('puts the pin where the place is, relative to wherever the view sits', () => {
    // A view centred on the place puts the pin in the middle of the box.
    const centred = projectPoint(TASHKENT, TASHKENT, 15, 320, 200)
    expect(centred.left).toBeCloseTo(160, 6)
    expect(centred.top).toBeCloseTo(100, 6)
    expect(centred.onScreen).toBe(true)

    // Pan the view east and the pin slides west by the same amount.
    const moved = panned(TASHKENT, 15, -40, 0)
    const shifted = projectPoint(TASHKENT, moved, 15, 320, 200)
    expect(shifted.left).toBeCloseTo(120, 4)
    expect(shifted.top).toBeCloseTo(100, 4)

    // Far enough away and it is honest about having left the box.
    expect(projectPoint(TASHKENT, { latitude: 0, longitude: 0 }, 15, 320, 200).onScreen).toBe(false)
  })

  it('walks the centre opposite the drag, and stops at the poles', () => {
    const dragged = panned(TASHKENT, 15, 256, 0)
    // Dragging content one whole tile east moves the centre one tile west.
    expect(tileX(dragged.longitude, 15)).toBeCloseTo(tileX(TASHKENT.longitude, 15) - 1, 6)
    expect(dragged.latitude).toBeCloseTo(TASHKENT.latitude, 9)

    // Dragging down forever arrives at the top of the projection, not beyond
    // it. At zoom 2 the whole world is 1024px tall, so this drag runs well
    // past the pole and still stops on it.
    const north = panned(TASHKENT, 2, 0, 5_000)
    expect(north.latitude).toBeCloseTo(85.0511, 3)
    const south = panned(TASHKENT, 2, 0, -5_000)
    expect(south.latitude).toBeCloseTo(-85.0511, 3)
  })

  it('measures the ground a pixel covers, thinning towards the poles', () => {
    // The canonical figure: ~156 km per pixel at zoom 0 on the equator.
    expect(metersPerPixel(0, 0)).toBeCloseTo(156_543.03, 1)
    expect(metersPerPixel(0, 1)).toBeCloseTo(metersPerPixel(0, 0) / 2, 4)
    expect(metersPerPixel(60, 10)).toBeCloseTo(metersPerPixel(0, 10) / 2, 1)
  })

  it('picks the longest round distance that still fits the bar', () => {
    const street = mapScaleBar(TASHKENT.latitude, 17, 90)
    expect(street.widthPx).toBeLessThanOrEqual(90)
    expect(street.label).toBe('50 m')

    const city = mapScaleBar(TASHKENT.latitude, 11, 90)
    expect(city.widthPx).toBeLessThanOrEqual(90)
    expect(city.label).toBe('5.0 km')
  })

  it('answers to its own skin name', () => {
    expect(locationSkinMode('map')).toBe('map')
  })
})
