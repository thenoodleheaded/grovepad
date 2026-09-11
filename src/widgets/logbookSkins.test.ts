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
    expect(face.eyebrow).toMatchObject({ label: 'Travel Log', note: 'Khiva' })
    expect(face.rows[0]).toMatchObject({ label: 'A warning', value: 'Khiva', tone: 'accent' })
  })

  it('folds every skin to its own reading of the same entries', () => {
    const fold = (data: LogbookData) => {
      const model = restingFace({
        type: 'logbook',
        title: 'Log',
        size: { width: 400, height: 280 },
        data,
      }).model
      if (model.kind !== 'rows') throw new Error(`expected rows, got ${model.kind}`)
      return model
    }

    const daily = fold(base())
    expect(daily.eyebrow).toMatchObject({ label: 'Daily Log', note: '1 warning', tone: 'warn' })
    expect(daily.rows[0]).toMatchObject({ label: 'A warning', tone: 'warn' })
    expect(daily.rows[0]?.lead).toMatch(/\d/)

    const incident = fold({
      ...base(),
      skin: 'incident_log',
      skinStates: { incident_log: { entries: { two: { status: 'resolved' } } } },
    })
    // The undetailed entry counts as open — the card's own default.
    expect(incident.eyebrow).toMatchObject({ note: '1 open', tone: 'bad' })
    expect(incident.rows[0]).toMatchObject({ value: 'Resolved', tone: 'good' })
    expect(incident.rows[1]).toMatchObject({ value: 'Open', tone: 'bad' })

    const lab = fold({
      ...base(),
      skin: 'lab_notebook',
      skinStates: { lab_notebook: { entries: { two: { conclusion: 'It works' } } } },
    })
    expect(lab.eyebrow).toMatchObject({ note: '1 concluded' })
    expect(lab.rows[0]).toMatchObject({ value: 'Conclusion', tone: 'good' })
    expect(lab.rows[1]).toMatchObject({ value: 'Experiment' })

    const change = fold({
      ...base(),
      skin: 'change_log',
      skinStates: {
        change_log: { entries: { two: { version: 'v2', changeKind: 'fixed' } } },
      },
    })
    expect(change.eyebrow).toMatchObject({ label: 'Change Log', note: 'v2' })
    expect(change.rows[0]).toMatchObject({ lead: 'v2', value: 'Fixed', tone: 'accent' })

    const now = new Date()
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
    const overdueDay = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0'),
    ].join('-')
    const maintenance = fold({
      ...base(),
      skin: 'maintenance_log',
      skinStates: {
        maintenance_log: { entries: { two: { asset: 'Pump', nextService: overdueDay } } },
      },
    })
    expect(maintenance.eyebrow).toMatchObject({ note: '1 overdue', tone: 'bad' })
    expect(maintenance.rows[0]).toMatchObject({ value: '1 day overdue', tone: 'bad' })

    const audit = fold({
      ...base(),
      skin: 'audit_trail',
      skinStates: { audit_trail: { entries: { two: { actor: 'Amir' } } } },
    })
    expect(audit.eyebrow).toMatchObject({ label: 'Audit Trail', note: '2 events' })
    expect(audit.rows[0]).toMatchObject({ value: 'Amir' })
    expect(audit.rows[0]?.lead).toMatch(/\d/)
  })

  it('honours the skin\'s own entry order while folded', () => {
    const flipped = dataWithSkinState(base(), 'daily_log', { order: 'oldest' }) as LogbookData
    const face = restingFace({
      type: 'logbook',
      title: 'Log',
      size: { width: 400, height: 280 },
      data: flipped,
    }).model
    expect(face.kind).toBe('rows')
    if (face.kind !== 'rows') return
    expect(face.rows[0]).toMatchObject({ label: 'Opened the day' })
  })
})
