import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LocationData } from '../../../types/widgetDataExpansion'
import { LocationWidget } from './LocationWidget'
import type { LocationSkinMode } from './locationSkinModel'

const SKINS = ['pin', 'coordinates', 'local_time', 'compass', 'geofence', 'route', 'map'] as const

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
    ['map', 'gp-loc-map'],
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

  /**
   * The Map skin's whole claim is that you never have to read or type a
   * coordinate to keep a place. It draws real tiles around the pin, offers
   * the framing it remembers in words, and shows no number anywhere.
   */
  it('draws the map around the place and names the framing it remembers', () => {
    const markup = render('map', { skinStates: { map: { zoom: 13 } } })
    expect(markup).toContain('https://tile.openstreetmap.org/13/')
    expect(markup).toContain('Neighbourhood')
    expect(markup).toContain('© OpenStreetMap')
    // No coordinate readout and no coordinate inputs — the pin is moved by
    // dragging the map instead. Link targets are not readable text, so they
    // are stripped before the numbers are looked for.
    const shown = markup.replace(/href="[^"]*"/g, '')
    expect(shown).not.toContain('41.3111')
    expect(shown).not.toContain('69.2797')
    expect(markup).not.toContain('gp-loc-coords')
    // The link out opens at the framing the card remembers, not a fixed one.
    expect(markup).toContain('#map=13/41.3111/69.2797')
  })

  it('opens on the world, not on a street in the sea, before a place is saved', () => {
    const markup = render('map', { latitude: null, longitude: null })
    // The opening view is a country-level frame, and the only thing to press
    // is the one that saves whatever the crosshair is over.
    expect(markup).toContain('Country')
    expect(markup).toContain('Save this spot')
    expect(markup).toContain('gp-loc-map-cross')
    expect(markup).not.toContain('gp-loc-map-pin')
  })

  it('never links out to anything but the point it holds', () => {
    const markup = render('pin')
    expect(markup).toContain('https://www.openstreetmap.org/?mlat=41.3111&amp;mlon=69.2797')
    expect(markup).toContain('rel="noreferrer"')
    expect(render('pin', { latitude: null, longitude: null })).not.toContain('openstreetmap')
  })
})

/**
 * There is no DOM in this suite, so the guarantee is pinned on the source:
 * a geolocation fix arrives asynchronously, and nothing that rebuilds the
 * card when it lands may be built from the render that asked for it.
 */
describe('a location fix never reverts what was typed while waiting for it', () => {
  const source = readFileSync(new URL('./LocationWidget.tsx', import.meta.url), 'utf8')

  function block(start: string): string {
    const from = source.indexOf(start)
    expect(from).toBeGreaterThan(-1)
    return source.slice(from, source.indexOf('\n  }', from))
  }

  it('writes the fix onto the card as it stands now, not as it stood at the press', () => {
    const capture = block('const capture = () =>')
    expect(capture).toContain('...dataRef.current')
    expect(capture).toContain('dataRef.current.timezone')
    // The render-time prop must not be the thing being spread back.
    expect(capture).not.toMatch(/\.\.\.data\b/)
    expect(capture).not.toMatch(/\bdata\.timezone\b/)
  })

  it('merges every skin write onto live card data', () => {
    const write = block('const write = (next: Partial<LocationData>')
    expect(write).toContain('...dataRef.current')
    expect(write).not.toMatch(/\{ \.\.\.data,/)
  })

  it('appends a located route stop to the list as it stands now', () => {
    const addStop = block('const addStop = (stop: Partial<RouteStop>')
    expect(addStop).toContain('routeStops(stateRef.current)')
    expect(addStop).not.toMatch(/canAddStop\(stops\)/)
    expect(addStop).not.toMatch(/\.\.\.stops\b/)
  })
})
