import { describe, expect, it } from 'vitest'
import type { LocationData } from '../types/widgetDataExpansion'
import { commandsFor, fieldsFor } from './fields'
import { isWidgetTypePublic, WIDGET_REGISTRY } from './registry'

describe('Location widget', () => {
  it('is public and starts as an empty reusable place', () => {
    const data = WIDGET_REGISTRY.location.defaultData() as LocationData

    expect(isWidgetTypePublic('location')).toBe(true)
    expect(WIDGET_REGISTRY.location.category).toBe('data')
    expect(data).toMatchObject({
      label: 'My location',
      address: '',
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      capturedAt: null,
    })
    expect(data.timezone.length).toBeGreaterThan(0)
  })

  it('exposes writable coordinates and derived circuit values', () => {
    const fields = fieldsFor('location')
    const byKey = new Map(fields.map((field) => [field.key, field]))
    const original = WIDGET_REGISTRY.location.defaultData()
    const withLatitude = byKey.get('latitude')!.set!(original, 95)
    const complete = byKey.get('longitude')!.set!(withLatitude, 69.2401)

    expect((complete as LocationData).latitude).toBe(90)
    expect(byKey.get('coordinates')!.get(complete)).toBe('90.000000, 69.240100')
    expect(byKey.get('available')!.get(complete)).toBe(true)
    expect(byKey.get('mapUrl')!.get(complete)).toContain('openstreetmap.org')
  })

  it('clears captured coordinates without discarding the place label or timezone', () => {
    const original: LocationData = {
      label: 'Studio',
      address: 'Main street',
      latitude: 41.3111,
      longitude: 69.2797,
      timezone: 'Asia/Tashkent',
      accuracyMeters: 12,
      capturedAt: 123,
    }
    const clear = commandsFor('location').find((command) => command.key === 'clear')
    const cleared = clear!.run(original) as LocationData

    expect(cleared).toMatchObject({
      label: 'Studio',
      address: '',
      latitude: null,
      longitude: null,
      timezone: 'Asia/Tashkent',
      accuracyMeters: null,
      capturedAt: null,
    })
  })
})
