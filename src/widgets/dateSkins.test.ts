import { describe, expect, it } from 'vitest'
import type { DatePickerData } from '../types/spatial'
import { dataWithDateState } from '../components/widgets/modules/dateSkinModel'
import { restingFace } from '../utils/restingFace'
import { currentSkin, dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { MEDIA_INPUT_WIDGET_DEFINITIONS } from './registry/mediaInputWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'date_time',
  'deadline',
  'anniversary',
  'relative_date',
  'range',
  'recurring_date',
  'milestone',
]

const base = (patch: Partial<DatePickerData> = {}): DatePickerData => ({
  label: 'Target date',
  date: '2026-09-04',
  time: '',
  includeTime: false,
  mode: 'date_time',
  ...patch,
})

describe('Date skin registry contract', () => {
  it('offers all seven purpose-built skins in catalogue order', () => {
    expect(
      skinsFor({ type: 'date_picker' }, WIDGET_REGISTRY.date_picker).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with a distinct icon', () => {
    const skins = MEDIA_INPUT_WIDGET_DEFINITIONS.date_picker.skins
    expect(skins.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(expected.length)
    expect(new Set(skins.map((skin) => skin.accent)).size).toBe(expected.length)
  })

  it('keeps persisting the worn skin in the field old boards already use', () => {
    const next = dataWearingSkin(
      { type: 'date_picker', data: base() },
      'milestone',
      WIDGET_REGISTRY.date_picker,
    ) as DatePickerData
    expect(WIDGET_REGISTRY.date_picker.skinField).toBe('mode')
    expect(next.mode).toBe('milestone')
    expect(next.date).toBe('2026-09-04')
    expect(next).not.toHaveProperty('skin')
  })

  it('keeps specialist state when another skin is worn', () => {
    const ranged = dataWithDateState(base({ mode: 'range' }), 'range', { end: '2026-09-11' })
    const next = dataWearingSkin(
      { type: 'date_picker', data: ranged },
      'recurring_date',
      WIDGET_REGISTRY.date_picker,
    ) as DatePickerData
    expect(next.mode).toBe('recurring_date')
    expect(next.skinStates?.range).toEqual({ end: '2026-09-11' })
  })

  it('lets the renderer own every schema-extension editor', () => {
    expect(WIDGET_REGISTRY.date_picker.rendererOwnedSkinDetails).toEqual([
      'range',
      'recurring_date',
      'milestone',
    ])
    for (const skin of skinsFor({ type: 'date_picker' }, WIDGET_REGISTRY.date_picker)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.date_picker.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })

  it('resolves a board still holding the retired countdown mode', () => {
    // The value is no longer offered, so the roller falls home to the first
    // skin; the renderer and every reading treat it as Deadline, and the first
    // edit settles the stored mode.
    const skin = currentSkin(
      { type: 'date_picker', data: base({ mode: 'countdown' }) },
      WIDGET_REGISTRY.date_picker,
    )
    expect(skin?.value).toBe('date_time')
    expect(fieldDescriptor('date_picker', 'days_until')?.get(base({ mode: 'countdown' })))
      .toBe(fieldDescriptor('date_picker', 'days_until')?.get(base({ mode: 'deadline' })))
  })
})

describe('Date circuit contract', () => {
  it('publishes the distance to the day the worn skin points at', () => {
    const anniversary = base({ date: '1998-09-04', mode: 'anniversary' })
    const days = fieldDescriptor('date_picker', 'days_until')?.get(anniversary)
    const next = fieldDescriptor('date_picker', 'next_occurrence')?.get(anniversary)

    // A yearly occasion is never overdue: it reports its next occurrence.
    expect(typeof days).toBe('number')
    expect(days as number).toBeGreaterThanOrEqual(0)
    expect(String(next).slice(5)).toBe('09-04')
    expect(fieldDescriptor('date_picker', 'is_due')?.get(anniversary)).toBe(days === 0)
  })

  it('reports a passed deadline as due', () => {
    const overdue = base({ date: '2020-01-01', mode: 'deadline' })
    expect(fieldDescriptor('date_picker', 'is_due')?.get(overdue)).toBe(true)
    expect(fieldDescriptor('date_picker', 'days_until')?.get(overdue) as number).toBeLessThan(0)
  })

  it('publishes a duration only for a range', () => {
    const ranged = dataWithDateState(
      base({ date: '2026-09-04', mode: 'range' }),
      'range',
      { end: '2026-09-11' },
    )
    expect(fieldDescriptor('date_picker', 'duration_days')?.get(ranged)).toBe(7)
    expect(fieldDescriptor('date_picker', 'duration_days')?.get(base())).toBe(0)
  })

  it('still accepts a written day without disturbing the worn skin', () => {
    const write = fieldDescriptor('date_picker', 'date')?.set
    expect(write).toBeDefined()
    const written = write!(base({ mode: 'milestone' }), '2027-01-15') as DatePickerData
    expect(written.date).toBe('2027-01-15')
    expect(written.mode).toBe('milestone')
  })

  it('never reports an unset card as due', () => {
    const empty = base({ date: '' })
    expect(fieldDescriptor('date_picker', 'is_due')?.get(empty)).toBe(false)
    expect(fieldDescriptor('date_picker', 'next_occurrence')?.get(empty)).toBe('')
  })
})

describe('Date resting-face contract', () => {
  const fold = (data: DatePickerData) => restingFace({
    type: 'date_picker',
    title: 'When',
    size: { width: 280, height: 200 },
    data,
  }).model

  it('rests as a bare icon while no day is set', () => {
    expect(fold(base({ date: '' })).kind).toBe('icon')
  })

  it('rests a deadline as the days left, with its runway spent', () => {
    const model = fold(dataWithDateState(
      base({ date: '2020-01-01', mode: 'deadline' }),
      'deadline',
      { leadDays: 30 },
    ))
    expect(model.kind).toBe('metric')
    if (model.kind !== 'metric') return
    expect(model.secondary).toBe('Days overdue')
    expect(model.progress).toBe(1)
  })

  it('rests a range as its two ends rather than as a count', () => {
    const model = fold(dataWithDateState(
      base({ date: '2026-09-04', mode: 'range' }),
      'range',
      { end: '2026-09-11' },
    ))
    expect(model.kind).toBe('rows')
    if (model.kind !== 'rows') return
    expect(model.rows[0]?.label).toBe('7 nights')
    expect(model.rows[1]?.label).toBe('Ends')
  })

  it('rests a milestone as its status', () => {
    const model = fold(dataWithDateState(
      base({ mode: 'milestone' }),
      'milestone',
      { status: 'at_risk', owner: 'Ada' },
    ))
    expect(model.kind).toBe('rows')
    if (model.kind !== 'rows') return
    expect(model.rows[0]?.label).toBe('At risk')
    expect(model.rows[1]?.label).toBe('Ada')
  })

  it('rests an anniversary on its next occurrence, never in the past', () => {
    const model = fold(base({ date: '1998-09-04', mode: 'anniversary' }))
    expect(model.kind).toBe('metric')
    if (model.kind !== 'metric') return
    expect(model.primary).not.toMatch(/ago/i)
    expect(model.secondary).toMatch(/Sep/)
  })
})
