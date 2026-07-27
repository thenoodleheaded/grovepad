import { describe, expect, it } from 'vitest'
import type { LogbookData } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { PROFESSIONAL_WIDGET_DEFINITIONS } from './registry/professionalWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'daily_log',
  'incident_log',
  'lab_notebook',
  'change_log',
  'maintenance_log',
  'audit_trail',
  'travel_log',
]

const base = (): LogbookData => ({
  skin: 'daily_log',
  entries: [
    { id: 'one', timestamp: '2026-07-25T08:00:00.000Z', text: 'Opened the day', level: 'note' },
    { id: 'two', timestamp: '2026-07-25T09:00:00.000Z', text: 'A warning', level: 'warning' },
  ],
})

describe('Logbook skin registry contract', () => {
  it('offers all seven purpose-built skins in catalogue order', () => {
    expect(
      skinsFor({ type: 'logbook' }, WIDGET_REGISTRY.logbook).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with a distinct icon', () => {
    const skins = PROFESSIONAL_WIDGET_DEFINITIONS.logbook.skins
    expect(skins.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('persists the worn skin without disturbing canonical entries', () => {
    const original = base()
    const next = dataWearingSkin(
      { type: 'logbook', data: original },
      'lab_notebook',
      WIDGET_REGISTRY.logbook,
    ) as LogbookData
    expect(WIDGET_REGISTRY.logbook.skinField).toBe('skin')
    expect(next.skin).toBe('lab_notebook')
    expect(next.entries).toEqual(original.entries)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps specialist state when another skin is worn', () => {
    const withIncident = dataWithSkinState(
      base(),
      'incident_log',
      { entries: { two: { status: 'resolved' } } },
    ) as LogbookData
    const next = dataWearingSkin(
      { type: 'logbook', data: withIncident },
      'change_log',
      WIDGET_REGISTRY.logbook,
    ) as LogbookData
    expect(next.skin).toBe('change_log')
    expect(next.skinStates?.incident_log).toEqual({
      entries: { two: { status: 'resolved' } },
    })
  })

  it('lets the renderer own both schema-extension editors', () => {
    expect(WIDGET_REGISTRY.logbook.rendererOwnedSkinDetails).toEqual([
      'audit_trail',
      'travel_log',
    ])
    for (const skin of skinsFor({ type: 'logbook' }, WIDGET_REGISTRY.logbook)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.logbook.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })
})

describe('Logbook circuit and resting-face contract', () => {
  it('publishes counts and accepts an append write without losing its skin', () => {
    const data = dataWithSkinState(
      { ...base(), skin: 'incident_log' },
      'incident_log',
      { entries: { two: { status: 'monitoring' } } },
    ) as LogbookData

    expect(fieldDescriptor('logbook', 'entry_count')?.get(data)).toBe(2)
    expect(fieldDescriptor('logbook', 'warning_count')?.get(data)).toBe(1)
    expect(fieldDescriptor('logbook', 'latest_level')?.get(data)).toBe('warning')

    const write = fieldDescriptor('logbook', 'append')?.set
    expect(write).toBeDefined()
    const written = write!(data, 'Circuit event') as LogbookData
    expect(written.entries.at(-1)?.text).toBe('Circuit event')
    expect(written.skin).toBe('incident_log')
    expect(written.skinStates?.incident_log).toEqual(data.skinStates?.incident_log)
  })

  it('rests with skin-specific context instead of a generic count', () => {
    const data: LogbookData = {
      ...base(),
      skin: 'travel_log',
      skinStates: {
        travel_log: { entries: { two: { place: 'Khiva' } } },
      },
    }
    const face = restingFace({
      type: 'logbook',
      title: 'Journey',
      size: { width: 400, height: 280 },
      data,
    }).model
    expect(face.kind).toBe('rows')
    if (face.kind !== 'rows') return
    expect(face.rows[0]).toMatchObject({ label: 'A warning', value: 'Khiva' })
  })
})
