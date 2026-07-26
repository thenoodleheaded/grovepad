import { describe, expect, it } from 'vitest'
import type { LocationData } from '../types/widgetDataExpansion'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { commandsFor, fieldDescriptor } from './fields'
import { EXPANSION_WIDGET_DEFINITIONS } from './registry/expansion'
import { WIDGET_REGISTRY } from './registry'

const expected = ['pin', 'coordinates', 'local_time', 'compass', 'geofence', 'route']

const PLACE: LocationData = {
  label: 'Studio',
  address: 'Main street 12',
  latitude: 41.3111,
  longitude: 69.2797,
  timezone: 'Asia/Tashkent',
  accuracyMeters: 12,
  capturedAt: 1_700_000_000_000,
}

describe('Location skin registry contract', () => {
  it('offers every designed way of using a place, in catalogue order', () => {
    expect(
      skinsFor({ type: 'location' }, WIDGET_REGISTRY.location).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('names every Location skin by hand, each with its own icon and hue', () => {
    const declared = EXPANSION_WIDGET_DEFINITIONS.location.skins!
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
    expect(new Set(declared.map((skin) => skin.accent)).size).toBe(expected.length)
    for (const skin of declared) expect(skin.description ?? '').not.toBe('')
  })

  /**
   * Latitude and longitude are what a wire reads off this card. Persisting the
   * chosen skin anywhere near them — or letting the catalogue merge move the
   * field to `mode`, which `LocationData` does not have — would let changing
   * appearance move the pin.
   */
  it('persists the chosen skin in `skin` and never disturbs the coordinates', () => {
    expect(WIDGET_REGISTRY.location.skinField).toBe('skin')

    const next = dataWearingSkin(
      { type: 'location', data: PLACE },
      'compass',
      WIDGET_REGISTRY.location,
    ) as LocationData

    expect(next.skin).toBe('compass')
    expect(next.latitude).toBe(PLACE.latitude)
    expect(next.longitude).toBe(PLACE.longitude)
    expect(next.timezone).toBe(PLACE.timezone)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps one skin’s specialist state when another is worn', () => {
    const fenced = dataWithSkinState(
      { ...PLACE, skin: 'geofence' } as LocationData,
      'geofence',
      { radiusMeters: 2000 },
    ) as LocationData
    const routed = dataWithSkinState(fenced as never, 'route', {
      stops: [{ id: 'a', label: 'Chorsu', latitude: 41.3269, longitude: 69.2361 }],
    }) as LocationData
    const worn = dataWearingSkin(
      { type: 'location', data: routed },
      'route',
      WIDGET_REGISTRY.location,
    ) as LocationData

    expect(worn.skin).toBe('route')
    expect(worn.skinStates?.geofence).toEqual({ radiusMeters: 2000 })
    expect(worn.skinStates?.route).toHaveProperty('stops')
  })

  /**
   * A wire writing a coordinate, or the `clear` command emptying the card,
   * must change exactly that. Losing `skin` here would snap a Compass back to
   * a plain pin the moment a circuit ran.
   */
  it('survives a wire write and a clear with its skin and fence intact', () => {
    const worn = {
      ...PLACE,
      skin: 'geofence',
      skinStates: { geofence: { radiusMeters: 2000 } },
    } as LocationData

    const write = fieldDescriptor('location', 'latitude')?.set
    expect(write, 'latitude must stay writable for wires').toBeDefined()
    const written = write!(worn, 52.52) as LocationData
    expect(written.latitude).toBe(52.52)
    expect(written.skin).toBe('geofence')
    expect(written.skinStates?.geofence).toEqual({ radiusMeters: 2000 })

    const clear = commandsFor('location').find((command) => command.key === 'clear')
    const cleared = clear!.run(written) as LocationData
    expect(cleared.latitude).toBeNull()
    expect(cleared.skin).toBe('geofence')
    expect(cleared.skinStates?.geofence).toEqual({ radiusMeters: 2000 })
  })

  it('lets the renderer own every skin that keeps specialist data', () => {
    for (const skin of skinsFor({ type: 'location' }, WIDGET_REGISTRY.location)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(
        WIDGET_REGISTRY.location.rendererOwnedSkinDetails,
        `${skin.value} needs a renderer-owned detail editor`,
      ).toContain(skin.value)
    }
  })

  // A folded card is its own content drawn small: a located place says where
  // it is, and a card with no coordinates yet has nothing to report.
  it('rests as the place it holds, or as its icon while it holds none', () => {
    const face = (data: Partial<LocationData>) => restingFace({
      type: 'location',
      title: 'Location',
      size: { width: 340, height: 280 },
      data: { ...PLACE, ...data } as LocationData,
    }).model

    expect(face({})).toMatchObject({
      kind: 'rows',
      rows: [{ label: 'Studio', value: '41.311, 69.280' }],
    })
    expect(face({ label: '' })).toMatchObject({
      rows: [{ label: 'Main street 12' }],
    })
    expect(face({ latitude: null, longitude: null })).toEqual({ kind: 'icon' })
  })
})
