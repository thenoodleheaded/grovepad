import { describe, expect, it } from 'vitest'
import type { FormWidgetData } from '../types/spatial'
import {
  applicationGroups,
  applicationSections,
  averageRating,
  conditionSources,
  conditionalFields,
  dataWithApplicationDetail,
  dataWithApplicationReview,
  dataWithFieldCondition,
  dataWithInspectionCheck,
  dataWithoutField,
  fieldConditions,
  formProgress,
  inspectionChecks,
  inspectionTally,
} from '../components/widgets/modules/formSkinModel'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { PROFESSIONAL_WIDGET_DEFINITIONS } from './registry/professionalWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'intake',
  'survey',
  'feedback',
  'rsvp',
  'inspection',
  'application',
  'conditional_form',
]

const base = (): FormWidgetData => ({
  skin: 'intake',
  title: 'Signup',
  fields: [
    { id: 'f1', label: 'Name', type: 'text', value: 'Ada', required: true },
    { id: 'f2', label: 'Attending', type: 'checkbox', value: false, required: false },
    { id: 'f3', label: 'Notes', type: 'text', value: '', required: false },
  ],
})

describe('Form skin registry contract', () => {
  it('offers all seven purpose-built presets in catalogue order', () => {
    expect(
      skinsFor({ type: 'form' }, WIDGET_REGISTRY.form).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every preset by hand with a distinct icon', () => {
    const skins = PROFESSIONAL_WIDGET_DEFINITIONS.form.skins
    expect(skins.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('persists the worn preset without disturbing anybody’s answers', () => {
    const original = base()
    const next = dataWearingSkin(
      { type: 'form', data: original },
      'inspection',
      WIDGET_REGISTRY.form,
    ) as FormWidgetData
    expect(WIDGET_REGISTRY.form.skinField).toBe('skin')
    expect(next.skin).toBe('inspection')
    expect(next.fields).toEqual(original.fields)
    expect(next.title).toBe(original.title)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps specialist state when another preset is worn', () => {
    const inspected = dataWithInspectionCheck(base(), 'f2', { note: 'Seal cracked' })
    const next = dataWearingSkin(
      { type: 'form', data: inspected },
      'survey',
      WIDGET_REGISTRY.form,
    ) as FormWidgetData
    expect(next.skin).toBe('survey')
    expect(next.skinStates?.inspection)
      .toEqual({ checks: { f2: { skipped: false, note: 'Seal cracked' } } })
  })

  it('lets the renderer own both schema-extension editors', () => {
    expect(WIDGET_REGISTRY.form.rendererOwnedSkinDetails).toEqual([
      'application',
      'conditional_form',
    ])
    for (const skin of skinsFor({ type: 'form' }, WIDGET_REGISTRY.form)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.form.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })
})

describe('Form skin behavior', () => {
  it('reports completion from required fields only', () => {
    expect(formProgress(base().fields)).toMatchObject({
      total: 3,
      filled: 1,
      required: 1,
      requiredFilled: 1,
      complete: true,
    })
  })

  it('reads pass and fail from the canonical answer, and n/a from the skin', () => {
    const checks = inspectionChecks(base())
    expect(inspectionTally(base().fields, checks)).toEqual({ pass: 1, fail: 2, na: 0 })

    const skipped = dataWithInspectionCheck(base(), 'f3', { skipped: true })
    expect(inspectionTally(skipped.fields, inspectionChecks(skipped)))
      .toEqual({ pass: 1, fail: 1, na: 1 })
  })

  it('averages only the questions that were actually scored', () => {
    const scored: FormWidgetData = {
      ...base(),
      fields: [
        { id: 'r1', label: 'Ease', type: 'number', value: 4, required: false },
        { id: 'r2', label: 'Speed', type: 'number', value: 0, required: false },
        { id: 'r3', label: 'Comment', type: 'text', value: 'Nice', required: false },
      ],
    }
    expect(averageRating(scored.fields)).toBe(4)
    expect(averageRating(base().fields)).toBeNull()
  })

  it('groups application questions by section and tracks review state', () => {
    let data = dataWithApplicationDetail(base(), 'f1', { section: 'About you' })
    data = dataWithApplicationDetail(data, 'f1', { evidence: 'Passport' })
    data = dataWithApplicationReview(data, 'submitted')

    const groups = applicationGroups(data.fields, applicationSections(data))
    expect(groups.map((group) => group.label)).toEqual(['About you', 'General'])
    expect(groups[0]?.fields.map((field) => field.id)).toEqual(['f1'])
    expect(data.skinStates?.application).toMatchObject({
      sections: { f1: 'About you' },
      evidence: { f1: 'Passport' },
      review: 'submitted',
    })
  })

  it('hides a gated question until its earlier source answers', () => {
    const gated = dataWithFieldCondition(base(), 'f3', { sourceId: 'f2', test: 'checked' })
    const visibility = conditionalFields(gated.fields, fieldConditions(gated))
      .map(({ field, visible }) => [field.id, visible])
    expect(visibility).toEqual([['f1', true], ['f2', true], ['f3', false]])

    const answered: FormWidgetData = {
      ...gated,
      fields: gated.fields.map((field) => (
        field.id === 'f2' ? { ...field, value: true } : field
      )),
    }
    expect(
      conditionalFields(answered.fields, fieldConditions(answered)).at(-1)?.visible,
    ).toBe(true)
  })

  it('only lets earlier questions gate a later one', () => {
    expect(conditionSources(base().fields, 'f1')).toEqual([])
    expect(conditionSources(base().fields, 'f3').map((field) => field.id)).toEqual(['f1', 'f2'])
  })

  it('removes a question together with its note and any gate pointing at it', () => {
    let data = dataWithInspectionCheck(base(), 'f2', { note: 'Seal cracked' })
    data = dataWithFieldCondition(data, 'f3', { sourceId: 'f2', test: 'checked' })
    const next = dataWithoutField(data, 'f2')
    expect(next.fields.map((field) => field.id)).toEqual(['f1', 'f3'])
    expect(next.skinStates?.inspection?.checks).toEqual({})
    expect(next.skinStates?.conditional_form?.conditions).toEqual({})
  })
})

describe('Form circuit and resting-face contract', () => {
  it('publishes the same outputs no matter which preset is worn', () => {
    const inspected = dataWithInspectionCheck({ ...base(), skin: 'inspection' }, 'f2', {
      note: 'Seal cracked',
    })
    expect(fieldDescriptor('form', 'filled_count')?.get(inspected)).toBe(1)
    expect(fieldDescriptor('form', 'complete')?.get(inspected)).toBe(true)

    const write = fieldDescriptor('form', 'first_value')?.set
    expect(write).toBeDefined()
    const written = write!(inspected, 'Grace') as FormWidgetData
    expect(written.fields[0]?.value).toBe('Grace')
    expect(written.skin).toBe('inspection')
    expect(written.skinStates?.inspection).toEqual(inspected.skinStates?.inspection)
  })

  it('rests showing each answer as the worn preset reads it', () => {
    const data = dataWithInspectionCheck({ ...base(), skin: 'inspection' }, 'f3', {
      skipped: true,
    })
    const face = restingFace({
      type: 'form',
      title: 'Signup',
      size: { width: 400, height: 280 },
      data,
    }).model
    expect(face.kind).toBe('rows')
    if (face.kind !== 'rows') return
    expect(face.rows[0]).toMatchObject({ label: 'Name', value: 'pass' })
    expect(face.rows[1]).toMatchObject({ label: 'Attending', value: 'fail' })
    expect(face.rows[2]).toMatchObject({ label: 'Notes', value: 'na' })
  })
})
