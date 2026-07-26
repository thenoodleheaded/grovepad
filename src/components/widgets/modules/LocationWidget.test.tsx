import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LocationData } from '../../../types/widgetDataExpansion'
import { LocationWidget } from './LocationWidget'
import type { LocationSkinMode } from './locationSkinModel'

const SKINS = ['pin', 'coordinates', 'local_time', 'compass', 'geofence', 'route'] as const

const PLACE: LocationData = {
  label: 'Studio',
  address: 'Main street 12',
  latitude: 41.3111,
  longitude: 69.2797,
  timezone: 'Asia/Tashkent',
  accuracyMeters: 12,
  capturedAt: Date.UTC(2026, 6, 25, 9, 0, 0),
}

function render(skin: LocationSkinMode, data: Partial<LocationData> = {}) {
  return renderToStaticMarkup(
    <LocationWidget
      skin={skin}
      data={{ ...PLACE, skin, ...data }}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Location skins', () => {
  it.each([
    ['pin', 'gp-loc--pin'],
    ['coordinates', 'gp-loc-readout'],
    ['local_time', 'gp-loc-clock'],
    ['compass', 'gp-loc-dial'],
    ['geofence', 'gp-loc-ring'],
    ['route', 'gp-loc-stops'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  /**
   * A Location is a coordinate source before it is a picture of one. Whatever
   * instrument a skin builds over the pin, the place it names stays on screen
   * and its numbers stay editable — a card that hid them would be a card you
   * could not correct.
   */
  it.each(SKINS)('keeps the place named in the %s skin', (skin) => {
    expect(render(skin)).toContain('Studio')
  })

  it.each(['pin', 'coordinates', 'route'] as const)(
    'keeps the coordinates editable in the %s skin',
    (skin) => {
      expect(render(skin)).toContain('41.3111')
    },
  )

  it('reads the clock in the place’s own timezone, not the reader’s', () => {
    const markup = render('local_time')
    expect(markup).toContain('Asia/Tashkent')
    // Sunrise and sunset are computed from the pin's latitude, so both ends of
    // the day arc are printed.
    expect(markup).toContain('gp-loc-arc')
  })

  it('offers all three coordinate notations, with the stored one pressed', () => {
    const markup = render('coordinates', { skinStates: { coordinates: { notation: 'geo' } } })
    expect(markup).toContain('Decimal')
    expect(markup).toContain('Geo URI')
    expect(markup).toContain('geo:41.311100,69.279700')
  })

  it('shows the fence radius it has stored, and its presets', () => {
    const markup = render('geofence', { skinStates: { geofence: { radiusMeters: 2000 } } })
    expect(markup).toContain('2.0 km')
    expect(markup).toContain('10 km')
  })

  it('adds up the route it holds and admits what it could not measure', () => {
    const markup = render('route', {
      skinStates: {
        route: {
          stops: [
            { id: 'a', label: 'Chorsu', latitude: 41.3269, longitude: 69.2361 },
            { id: 'b', label: 'Unplaced', latitude: null, longitude: null },
          ],
        },
      },
    })
    expect(markup).toContain('Chorsu')
    expect(markup).toContain('2 stops')
    expect(markup).toContain('1 unlocated')
  })

  /**
   * Compass and Geofence are instruments pointed at a place. With no place to
   * point at they must ask for one rather than draw a dial around nothing.
   */
  it.each(['compass', 'geofence'] as const)(
    'asks for coordinates instead of drawing an empty %s',
    (skin) => {
      const markup = render(skin, { latitude: null, longitude: null })
      expect(markup).toContain('gp-loc-empty')
      expect(markup).toContain('Use my location')
    },
  )

  it('never links out to anything but the point it holds', () => {
    const markup = render('pin')
    expect(markup).toContain('https://www.openstreetmap.org/?mlat=41.3111&amp;mlon=69.2797')
    expect(markup).toContain('rel="noreferrer"')
    expect(render('pin', { latitude: null, longitude: null })).not.toContain('openstreetmap')
  })
})
