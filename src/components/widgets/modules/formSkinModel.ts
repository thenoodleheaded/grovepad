import type {
  FormField,
  FormFieldType,
  FormSkinMode,
  FormWidgetData,
  ModuleData,
} from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'

/**
 * Form skins.
 *
 * The field list is canonical: a label, a type, an answer, and whether the
 * answer is required. Every skin reads exactly that. What a skin adds — an
 * inspector's note, a section heading, a rule about when a question appears —
 * lives in that skin's own state keyed by field id, so rolling to another
 * skin never rewrites somebody's answers.
 */

export const FORM_SKINS: readonly FormSkinMode[] = [
  'intake',
  'survey',
  'feedback',
  'rsvp',
  'inspection',
  'application',
  'conditional_form',
]

export type InspectionResult = 'pass' | 'fail' | 'na'
export type ReviewState = 'draft' | 'submitted' | 'accepted' | 'rejected'
export type ConditionTest = 'answered' | 'checked' | 'unchecked'

/** Feedback ratings share the familiar 1–5 scale. */
export const RATING_MAX = 5

const FIELD_TYPES = new Set<FormFieldType>(['text', 'number', 'checkbox'])
const REVIEW_STATES = new Set<ReviewState>(['draft', 'submitted', 'accepted', 'rejected'])
const CONDITION_TESTS = new Set<ConditionTest>(['answered', 'checked', 'unchecked'])

const MAX_FIELDS = 80
const MAX_LABEL = 200
const MAX_TEXT = 2_000

export interface InspectionCheck {
  /** Only 'na' is stored; pass and fail are read from the canonical answer. */
  skipped: boolean
  note: string
}

export interface FieldCondition {
  sourceId: string
  test: ConditionTest
}

export interface FormProgress {
  total: number
  filled: number
  required: number
  requiredFilled: number
  complete: boolean
  /** Share of answerable fields already filled, 0–100. */
  percent: number
}

function cleanText(raw: unknown, limit = MAX_TEXT): string {
  return typeof raw === 'string' ? raw.slice(0, limit) : ''
}

function record(state: WidgetSkinState, key: string): Record<string, unknown> {
  const value = state[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stateWithout(state: WidgetSkinState, key: string): WidgetSkinState {
  const { [key]: _dropped, ...rest } = state
  return rest
}

export function formSkinMode(raw: unknown): FormSkinMode {
  return typeof raw === 'string' && FORM_SKINS.includes(raw as FormSkinMode)
    ? raw as FormSkinMode
    : 'intake'
}

export function defaultFormValue(type: FormFieldType): string | number | boolean {
  if (type === 'number') return 0
  if (type === 'checkbox') return false
  return ''
}

export function formFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_FIELDS).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const field = entry as Partial<FormField>
    const type = FIELD_TYPES.has(field.type as FormFieldType)
      ? field.type as FormFieldType
      : 'text'
    const value = typeof field.value === 'string'
      || typeof field.value === 'number'
      || typeof field.value === 'boolean'
      ? field.value
      : defaultFormValue(type)
    return [{
      id: typeof field.id === 'string' && field.id ? field.id : `field-${index}`,
      label: cleanText(field.label, MAX_LABEL),
      type,
      value,
      required: field.required === true,
    }]
  })
}

/** A checkbox counts as answered whether it is ticked or deliberately left off. */
export function formFieldFilled(field: FormField): boolean {
  if (field.type === 'checkbox') return field.value === true
  if (field.type === 'number') return typeof field.value === 'number' && Number.isFinite(field.value)
  return String(field.value ?? '').trim().length > 0
}

export function formProgress(fields: readonly FormField[]): FormProgress {
  const filled = fields.filter(formFieldFilled).length
  const required = fields.filter((field) => field.required)
  const requiredFilled = required.filter(formFieldFilled).length
  return {
    total: fields.length,
    filled,
    required: required.length,
    requiredFilled,
    complete: fields.length > 0 && requiredFilled === required.length,
    percent: fields.length === 0 ? 0 : Math.round((filled / fields.length) * 100),
  }
}

/** The first field of a type — how RSVP finds its attendance and plus-ones. */
export function firstFieldOfType(
  fields: readonly FormField[],
  type: FormFieldType,
): FormField | null {
  return fields.find((field) => field.type === type) ?? null
}

export function ratingValue(field: FormField): number {
  const value = typeof field.value === 'number' ? Math.round(field.value) : 0
  return Math.min(RATING_MAX, Math.max(0, value))
}

/** Average of every scored question, or null when nothing has been rated. */
export function averageRating(fields: readonly FormField[]): number | null {
  const scored = fields.filter((field) => field.type === 'number' && ratingValue(field) > 0)
  if (scored.length === 0) return null
  const total = scored.reduce((sum, field) => sum + ratingValue(field), 0)
  return Math.round((total / scored.length) * 10) / 10
}

/* Inspection -------------------------------------------------------------- */

export function inspectionChecks(
  data: Pick<FormWidgetData, 'skinStates'>,
): Record<string, InspectionCheck> {
  const checks = record(skinStateFor(data, 'inspection'), 'checks')
  const result: Record<string, InspectionCheck> = {}
  for (const [id, raw] of Object.entries(checks).slice(0, MAX_FIELDS)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const check: InspectionCheck = {
      skipped: source.skipped === true,
      note: cleanText(source.note),
    }
    if (check.skipped || check.note) result[id] = check
  }
  return result
}

export function inspectionCheck(
  checks: Record<string, InspectionCheck>,
  id: string,
): InspectionCheck {
  return checks[id] ?? { skipped: false, note: '' }
}

/**
 * Pass and fail come from the canonical answer so a circuit reading the form
 * sees the same verdict the inspector does; only "not applicable" is extra.
 */
export function inspectionResult(
  field: FormField,
  check: InspectionCheck,
): InspectionResult {
  if (check.skipped) return 'na'
  return formFieldFilled(field) ? 'pass' : 'fail'
}

export function inspectionTally(
  fields: readonly FormField[],
  checks: Record<string, InspectionCheck>,
): Record<InspectionResult, number> {
  const tally: Record<InspectionResult, number> = { pass: 0, fail: 0, na: 0 }
  for (const field of fields) {
    tally[inspectionResult(field, inspectionCheck(checks, field.id))] += 1
  }
  return tally
}

export function dataWithInspectionCheck(
  data: FormWidgetData,
  fieldId: string,
  patch: Partial<InspectionCheck>,
): FormWidgetData {
  const state = skinStateFor(data, 'inspection')
  const checks = { ...record(state, 'checks') }
  const current = inspectionCheck(inspectionChecks(data), fieldId)
  const next: InspectionCheck = {
    skipped: patch.skipped ?? current.skipped,
    note: cleanText(patch.note ?? current.note),
  }
  if (!next.skipped && !next.note) delete checks[fieldId]
  else checks[fieldId] = next
  return dataWithSkinState(
    data as unknown as ModuleData,
    'inspection',
    Object.keys(checks).length > 0 ? { ...state, checks } : stateWithout(state, 'checks'),
  ) as unknown as FormWidgetData
}

/* Application ------------------------------------------------------------- */

export function applicationSections(
  data: Pick<FormWidgetData, 'skinStates'>,
): Record<string, string> {
  const sections = record(skinStateFor(data, 'application'), 'sections')
  const result: Record<string, string> = {}
  for (const [id, raw] of Object.entries(sections).slice(0, MAX_FIELDS)) {
    const label = cleanText(raw, MAX_LABEL)
    if (label) result[id] = label
  }
  return result
}

export function applicationEvidence(
  data: Pick<FormWidgetData, 'skinStates'>,
): Record<string, string> {
  const evidence = record(skinStateFor(data, 'application'), 'evidence')
  const result: Record<string, string> = {}
  for (const [id, raw] of Object.entries(evidence).slice(0, MAX_FIELDS)) {
    const text = cleanText(raw)
    if (text) result[id] = text
  }
  return result
}

export function applicationReview(data: Pick<FormWidgetData, 'skinStates'>): ReviewState {
  const raw = skinStateFor(data, 'application').review
  return REVIEW_STATES.has(raw as ReviewState) ? raw as ReviewState : 'draft'
}

/** Fields in section order, with unassigned questions gathered at the end. */
export interface ApplicationSection {
  label: string
  fields: FormField[]
}

export const UNSECTIONED = 'General'

export function applicationGroups(
  fields: readonly FormField[],
  sections: Record<string, string>,
): ApplicationSection[] {
  const groups = new Map<string, FormField[]>()
  for (const field of fields) {
    const label = sections[field.id] ?? UNSECTIONED
    const group = groups.get(label)
    if (group) group.push(field)
    else groups.set(label, [field])
  }
  return [...groups].map(([label, grouped]) => ({ label, fields: grouped }))
}

export function dataWithApplicationDetail(
  data: FormWidgetData,
  fieldId: string,
  patch: { section?: string; evidence?: string },
): FormWidgetData {
  const state = skinStateFor(data, 'application')
  let next: WidgetSkinState = { ...state }

  if (patch.section !== undefined) {
    const sections = { ...record(state, 'sections') }
    const label = cleanText(patch.section, MAX_LABEL)
    if (label) sections[fieldId] = label
    else delete sections[fieldId]
    next = Object.keys(sections).length > 0
      ? { ...next, sections }
      : stateWithout(next, 'sections')
  }

  if (patch.evidence !== undefined) {
    const evidence = { ...record(state, 'evidence') }
    const text = cleanText(patch.evidence)
    if (text) evidence[fieldId] = text
    else delete evidence[fieldId]
    next = Object.keys(evidence).length > 0
      ? { ...next, evidence }
      : stateWithout(next, 'evidence')
  }

  return dataWithSkinState(
    data as unknown as ModuleData,
    'application',
    next,
  ) as unknown as FormWidgetData
}

export function dataWithApplicationReview(
  data: FormWidgetData,
  review: ReviewState,
): FormWidgetData {
  const state = skinStateFor(data, 'application')
  return dataWithSkinState(
    data as unknown as ModuleData,
    'application',
    review === 'draft' ? stateWithout(state, 'review') : { ...state, review },
  ) as unknown as FormWidgetData
}

/* Conditional ------------------------------------------------------------- */

export function fieldConditions(
  data: Pick<FormWidgetData, 'skinStates'>,
): Record<string, FieldCondition> {
  const conditions = record(skinStateFor(data, 'conditional_form'), 'conditions')
  const result: Record<string, FieldCondition> = {}
  for (const [id, raw] of Object.entries(conditions).slice(0, MAX_FIELDS)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const source = raw as Record<string, unknown>
    const sourceId = cleanText(source.sourceId, MAX_LABEL)
    if (!sourceId || sourceId === id) continue
    result[id] = {
      sourceId,
      test: CONDITION_TESTS.has(source.test as ConditionTest)
        ? source.test as ConditionTest
        : 'answered',
    }
  }
  return result
}

export function conditionMet(source: FormField | undefined, test: ConditionTest): boolean {
  if (!source) return true
  if (test === 'checked') return source.value === true
  if (test === 'unchecked') return source.value !== true
  return formFieldFilled(source)
}

export interface ConditionalField {
  field: FormField
  condition: FieldCondition | null
  source: FormField | null
  visible: boolean
}

/**
 * A question is hidden only while its own gate is shut. A gate pointing at a
 * question that no longer exists is treated as open, so deleting a field can
 * never silently swallow the rest of the form.
 */
export function conditionalFields(
  fields: readonly FormField[],
  conditions: Record<string, FieldCondition>,
): ConditionalField[] {
  const byId = new Map(fields.map((field) => [field.id, field]))
  return fields.map((field) => {
    const condition = conditions[field.id] ?? null
    const source = condition ? byId.get(condition.sourceId) ?? null : null
    return {
      field,
      condition,
      source,
      visible: !condition || conditionMet(source ?? undefined, condition.test),
    }
  })
}

/** Only earlier questions may gate a later one — no circular reveals. */
export function conditionSources(
  fields: readonly FormField[],
  fieldId: string,
): FormField[] {
  const index = fields.findIndex((field) => field.id === fieldId)
  return index <= 0 ? [] : fields.slice(0, index)
}

export function dataWithFieldCondition(
  data: FormWidgetData,
  fieldId: string,
  condition: FieldCondition | null,
): FormWidgetData {
  const state = skinStateFor(data, 'conditional_form')
  const conditions = { ...record(state, 'conditions') }
  if (condition && condition.sourceId && condition.sourceId !== fieldId) {
    conditions[fieldId] = condition
  } else {
    delete conditions[fieldId]
  }
  return dataWithSkinState(
    data as unknown as ModuleData,
    'conditional_form',
    Object.keys(conditions).length > 0
      ? { ...state, conditions }
      : stateWithout(state, 'conditions'),
  ) as unknown as FormWidgetData
}

/* Shared field editing ---------------------------------------------------- */

export function dataWithField(
  data: FormWidgetData,
  fieldId: string,
  patch: Partial<FormField>,
): FormWidgetData {
  return {
    ...data,
    fields: formFields(data.fields).map((field) => (
      field.id === fieldId ? { ...field, ...patch } : field
    )),
  }
}

export function dataWithAddedField(
  data: FormWidgetData,
  skin: FormSkinMode,
  id: string = crypto.randomUUID(),
): FormWidgetData {
  const fields = formFields(data.fields)
  if (fields.length >= MAX_FIELDS) return data
  const type: FormFieldType = skin === 'feedback'
    ? 'number'
    : skin === 'inspection'
      ? 'checkbox'
      : 'text'
  return {
    ...data,
    fields: [...fields, {
      id,
      label: skin === 'inspection' ? 'New check' : 'Question',
      type,
      value: defaultFormValue(type),
      required: false,
    }],
  }
}

/** Removing a question takes its note, section, evidence, and gate with it. */
export function dataWithoutField(
  data: FormWidgetData,
  fieldId: string,
): FormWidgetData {
  const nextStates = Object.fromEntries(
    Object.entries(data.skinStates ?? {}).flatMap(([skin, rawState]) => {
      if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return []
      const state = rawState as Record<string, unknown>
      const cleaned = Object.fromEntries(
        Object.entries(state).map(([key, value]) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return [key, value]
          }
          const entries = value as Record<string, unknown>
          const kept = Object.fromEntries(
            Object.entries(entries).filter(([entryId, entry]) => {
              if (entryId === fieldId) return false
              // A gate pointing at the removed question goes with it.
              const gate = entry as { sourceId?: unknown } | null
              return !(gate && typeof gate === 'object' && gate.sourceId === fieldId)
            }),
          )
          return [key, kept]
        }),
      )
      return [[skin, cleaned]]
    }),
  )
  return {
    ...data,
    fields: formFields(data.fields).filter((field) => field.id !== fieldId),
    ...(Object.keys(nextStates).length > 0 ? { skinStates: nextStates } : {}),
  }
}
