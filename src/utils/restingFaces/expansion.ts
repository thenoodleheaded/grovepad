import type { ModuleData, ModuleType } from '../../types/spatial'
import type {
  AggregatorData,
  ChoreRotationData,
  ClockPulseData,
  ComparatorData,
  DebtPayoffData,
  DecisionJournalData,
  ExpenseSplitData,
  GiftsOccasionsData,
  GuestListData,
  HomeMaintenanceData,
  InvoicesData,
  JobApplicationsData,
  KeepInTouchData,
  LatchData,
  MealPlannerData,
  MedicationsData,
  NotifierData,
  RangeMapperData,
  RecipeData,
  RecorderData,
  RenewalsVaultData,
  SequencerData,
  SnippetLibraryData,
  SubscriptionsData,
  TemplateData,
  WeeklyReviewData,
  WorkoutPlanData,
} from '../../types/widgetDataExpansion'
import { fieldsFor } from '../../widgets/fields'
import { tripItineraryRestingFace } from './trip'
import { formatVitalValue } from '../widgetDisplayValue'
import {
  compact,
  finite,
  formatRestNumber,
  REST_COLUMN_ITEM_LIMIT,
  REST_LINE_LIMIT,
  REST_NODE_LIMIT,
  REST_ROW_LIMIT,
  type RestColumn,
  type RestingFaceModel,
  type RestLine,
  type RestRow,
  type RestTone,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// The Expansion family — thirty cards that share one renderer
// (ExpansionWidgets.tsx) and one habit: every one of them opens with the same
// three-cell VITALS strip, the card's own derived readings, and then shows
// whatever list it is really about underneath.
//
// So every folded tile here is built the same way: the reading the open card
// leads with, then the card's own rows. Which rows, and what each row's
// trailing value says, is the only thing that differs per type — a Guest List
// row ends in its RSVP, an Invoice in its amount, a Medication in its doses
// taken. That is what makes a folded Invoices tile unmistakably Invoices
// rather than a generic list of names.
//
// These types' skins dress the same body rather than replacing it, so the
// eyebrow is left blank for the catalogue dress to fill with the skin's name.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

/**
 * A field's reading, or null when the card's data cannot answer it. Field
 * getters are written against well-formed data and index into arrays the
 * widget is supposed to have; a resting face is computed for geometry on every
 * board including imported and partially-migrated ones, so it has to survive a
 * record that lost a field. A tile that throws would take the whole canvas
 * layer down with it.
 */
function readField(field: { get: (data: ModuleData) => unknown }, data: Record<string, unknown>): unknown {
  try {
    return field.get(data as unknown as ModuleData)
  } catch {
    return null
  }
}

/**
 * One named reading off the card. Always BY KEY: a field's position in the
 * list is its port slot on the card edge, not a ranking, so the first entry of
 * a Comparator is its A operand rather than its verdict.
 */
function fieldReading(type: ModuleType, key: string, data: Record<string, unknown>): unknown {
  const field = fieldsFor(type).find((entry) => entry.key === key)
  return field ? readField(field, data) : null
}

/** A field's formatted reading, or an em dash when the card's data could only
 * produce a broken one — a half-migrated record can make a derived string come
 * out as "NaN" or "undefined", and a tile must never print that. */
function safeReading(value: unknown): string {
  const reading = formatVitalValue(value)
  return /NaN|undefined|\[object/.test(reading) ? '—' : reading
}

/** The card's own derived readings, exactly the ones the Vitals strip shows:
 * source-only fields, no series, first three. */
function vitals(type: ModuleType, data: Record<string, unknown>, limit: number): RestRow[] {
  if (limit <= 0) return []
  return fieldsFor(type)
    .filter((field) => !field.set && field.valueType !== 'series')
    .slice(0, limit)
    .map((field) => ({
      key: `vital-${field.key}`,
      label: compact(field.label, 22),
      value: compact(safeReading(readField(field, data)), 14),
      tone: 'muted' as const,
    }))
}

/** The single headline reading — the leftmost vital cell. */
function headline(type: ModuleType, data: Record<string, unknown>): RestRow[] {
  return vitals(type, data, 1).map((row) => ({ ...row, tone: 'accent' as const }))
}

function rowsOf(data: Record<string, unknown>, key: string): Row[] {
  const value = data[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is Row => !!entry && typeof entry === 'object')
    : []
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** A short day, so a row's trailing date reads as a date and not as an ISO
 * string that pushes the label out of the tile. */
function shortDate(value: unknown): string {
  const raw = text(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (!match) return compact(raw, 10)
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime())
    ? compact(raw, 10)
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** One list card: the headline reading, then its own rows underneath. */
function listFace(
  type: ModuleType,
  data: Record<string, unknown>,
  entries: readonly Row[],
  draw: (entry: Row, index: number) => RestRow,
): RestingFaceModel {
  const lead = headline(type, data)
  const room = Math.max(0, REST_ROW_LIMIT - lead.length)
  const visible = entries.slice(0, room)
  const rows = [...lead, ...visible.map(draw)]
  if (rows.length === 0) return { kind: 'icon' }
  return { kind: 'rows', rows, overflow: Math.max(0, entries.length - visible.length) }
}

const COMPARATOR_SIGNS: Record<string, string> = {
  gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', between: '↔',
}

const AGGREGATOR_LABELS: Record<string, string> = {
  avg: 'Average', min: 'Minimum', max: 'Maximum',
  count_nonzero: 'Non-zero', count_true: 'True',
}

/** Down-sample a reading history to a fixed number of plotted points, so a
 * recorder holding four hundred samples costs exactly what one holding forty
 * costs. */
function sampled(points: readonly unknown[], budget: number): number[] {
  const values: number[] = []
  for (const point of points) {
    const value = finite((point as { v?: unknown } | null)?.v)
    if (value !== null) values.push(value)
  }
  if (values.length <= budget) return values
  const step = values.length / budget
  const picked: number[] = []
  for (let index = 0; index < budget; index++) picked.push(values[Math.floor(index * step)]!)
  return picked
}

const RECORDER_POINTS = 24

/* ------------------------------------------------------ workflow primitives */

function clockPulseFace(data: Record<string, unknown>): RestingFaceModel {
  const pulse = data as unknown as ClockPulseData
  const active = fieldReading('clock_pulse', 'active', data) === true
  const schedule = pulse.mode === 'interval'
    ? `Every ${Math.max(1, finite(pulse.intervalMinutes) ?? 1)} min`
    : pulse.mode === 'window'
      ? `${text(pulse.windowStart, '—')} – ${text(pulse.windowEnd, '—')}`
      : text(pulse.time, '—')
  return {
    kind: 'rows',
    rows: [
      {
        key: 'state',
        label: active ? 'Pulse active' : 'Waiting for schedule',
        tone: active ? 'good' : 'muted',
        value: compact(text(pulse.mode, 'daily').replaceAll('_', ' '), 12),
      },
      { key: 'schedule', label: schedule, lead: '◷', tone: 'accent' },
      ...vitals('clock_pulse', data, 2).slice(1),
    ],
    overflow: 0,
  }
}

function comparatorFace(data: Record<string, unknown>): RestingFaceModel {
  const rule = data as unknown as ComparatorData
  const passing = fieldReading('comparator', 'result', data) === true
  const isRange = rule.op === 'between'
  return {
    kind: 'split',
    divider: COMPARATOR_SIGNS[rule.op] ?? '?',
    left: {
      primary: formatRestNumber(finite(rule.a) ?? 0),
      secondary: 'A',
      tone: passing ? 'good' : 'bad',
    },
    right: isRange
      ? {
        primary: `${formatRestNumber(finite(rule.low) ?? 0)}–${formatRestNumber(finite(rule.high) ?? 0)}`,
        secondary: 'Range',
      }
      : { primary: formatRestNumber(finite(rule.b) ?? 0), secondary: 'B' },
  }
}

function aggregatorFace(data: Record<string, unknown>): RestingFaceModel {
  const combine = data as unknown as AggregatorData
  const slots = Array.isArray(combine.slots) ? combine.slots : []
  // The slots a card has actually been given. An untouched aggregator is six
  // zeroes, and printing six zeroes says less than printing none.
  const used = slots
    .map((value, index) => ({ index, value: finite(value) ?? 0 }))
    .filter((slot) => slot.value !== 0)
  // The combined reading by name: the aggregator's first six fields are its
  // own input slots, and printing slot one as the answer would be a lie.
  const result = fieldReading('aggregator', 'value', data)
  const lines: RestLine[] = used.slice(0, REST_LINE_LIMIT).map((slot) => ({
    key: `slot-${slot.index}`,
    left: `${slot.index + 1}`,
    right: formatRestNumber(slot.value),
    dim: true,
  }))
  return {
    kind: 'lines',
    lines,
    mono: true,
    total: {
      key: 'result',
      left: AGGREGATOR_LABELS[combine.mode] ?? 'Result',
      right: compact(safeReading(result), 12),
      tone: 'accent',
    },
  }
}

function rangeMapperFace(data: Record<string, unknown>): RestingFaceModel {
  const mapper = data as unknown as RangeMapperData
  const input = finite(mapper.input) ?? 0
  const bands = Array.isArray(mapper.bands) ? mapper.bands : []
  // The band the reading currently sits in is the one the open card lights.
  const activeIndex = bands.findIndex((band) => input <= (finite(band?.upTo) ?? Infinity))
  const visible = bands.slice(0, REST_ROW_LIMIT - 1)
  return {
    kind: 'rows',
    rows: [
      { key: 'input', label: 'Input', value: formatRestNumber(input), tone: 'accent' },
      ...visible.map((band, index) => {
        const upTo = finite(band?.upTo)
        // The last band is stored with a sentinel ceiling rather than a real
        // one; the open card shows it as an empty box, so the tile shows ∞.
        const unbounded = upTo === null || !Number.isFinite(upTo) || upTo >= Number.MAX_SAFE_INTEGER
        return {
          key: text(band?.id, `band-${index}`),
          ...(text(band?.emoji) ? { lead: text(band?.emoji) } : {}),
          label: compact(text(band?.label, `Band ${index + 1}`), 20),
          value: unbounded ? '∞' : `≤ ${formatRestNumber(upTo)}`,
          tone: (index === activeIndex ? 'good' : 'muted') as RestTone,
        }
      }),
    ],
    overflow: Math.max(0, bands.length - visible.length),
  }
}

function latchFace(data: Record<string, unknown>): RestingFaceModel {
  const latch = data as unknown as LatchData
  const current = finite(latch.current) ?? 0
  const held = finite(latch.held) ?? 0
  const delta = current - held
  return {
    kind: 'split',
    divider: delta === 0 ? '=' : delta > 0 ? '↑' : '↓',
    left: { primary: formatRestNumber(current), secondary: 'Current' },
    right: {
      primary: formatRestNumber(held),
      secondary: 'Held',
      tone: latch.heldAt === null ? 'muted' : 'accent',
    },
  }
}

function sequencerFace(data: Record<string, unknown>): RestingFaceModel {
  const sequence = data as unknown as SequencerData
  const steps = Array.isArray(sequence.steps) ? sequence.steps : []
  if (steps.length === 0) return { kind: 'icon' }
  const active = Math.max(0, Math.min(steps.length - 1, finite(sequence.activeIndex) ?? 0))
  // The window around the step that is running: a folded sequencer that always
  // showed the first four steps would stop being about where the run is.
  const start = Math.max(0, Math.min(steps.length - REST_NODE_LIMIT, active - 1))
  const visible = steps.slice(start, start + REST_NODE_LIMIT)
  return {
    kind: 'chain',
    shape: sequence.loop ? 'circular' : 'linear',
    nodes: visible.map((step, index) => ({
      key: text(step?.id, `step-${start + index}`),
      label: compact(text(step?.text, `Step ${start + index + 1}`), 10),
      caption: `${start + index + 1}`,
      current: start + index === active,
    })),
    overflow: Math.max(0, steps.length - visible.length),
  }
}

function templateFace(data: Record<string, unknown>): RestingFaceModel {
  const template = data as unknown as TemplateData
  const rendered = formatVitalValue(fieldReading('template', 'text', data))
  const rows: RestRow[] = [{ key: 'rendered', label: compact(rendered, 34), tone: 'accent' }]
  for (const key of ['A', 'B', 'C', 'D'] as const) {
    if (rows.length >= REST_ROW_LIMIT) break
    const value = text(template[`slot${key}`])
    if (value) rows.push({ key: `slot-${key}`, lead: key, label: compact(value, 24), tone: 'muted' })
  }
  return { kind: 'rows', rows, overflow: 0 }
}

function recorderFace(data: Record<string, unknown>): RestingFaceModel {
  const recorder = data as unknown as RecorderData
  const series = sampled(Array.isArray(recorder.samples) ? recorder.samples : [], RECORDER_POINTS)
  if (series.length < 2) {
    // Not a line yet — the open card's plot is empty too, so the tile keeps
    // the reading it does have.
    return {
      kind: 'rows',
      rows: [
        { key: 'input', label: 'Input', value: formatRestNumber(finite(recorder.input) ?? 0), tone: 'accent' },
        { key: 'mode', label: compact(text(recorder.mode, 'on_change').replaceAll('_', ' '), 20), tone: 'muted' },
      ],
      overflow: 0,
    }
  }
  const latest = series.at(-1)!
  const peak = Math.max(...series)
  const average = series.reduce((sum, value) => sum + value, 0) / series.length
  return {
    kind: 'chart',
    series,
    stats: [
      { label: 'Now', value: formatRestNumber(latest) },
      { label: 'Avg', value: formatRestNumber(Math.round(average * 10) / 10) },
      ...(peak === latest ? [] : [{ label: 'Peak', value: formatRestNumber(peak) }]),
    ],
  }
}

function notifierFace(data: Record<string, unknown>): RestingFaceModel {
  const notifier = data as unknown as NotifierData
  const message = text(notifier.message)
  const fired = finite(notifier.fireCount) ?? 0
  return {
    kind: 'rows',
    rows: [
      {
        key: 'armed',
        label: notifier.armed ? 'Armed' : 'Disarmed',
        tone: notifier.armed ? 'good' : 'muted',
        value: compact(text(notifier.channel, 'toast'), 10),
      },
      ...(message ? [{ key: 'message', label: compact(message, 32), lead: '“', tone: 'accent' as const }] : []),
      ...(fired > 0
        ? [{ key: 'fired', label: 'Sent', value: formatRestNumber(fired), tone: 'muted' as const }]
        : []),
    ],
    overflow: 0,
  }
}

/* ---------------------------------------------------------- the list cards */

const GUEST_TONES: Record<string, RestTone> = {
  yes: 'good', no: 'bad', maybe: 'warn', invited: 'muted',
}

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'] as const
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function mealPlannerFace(data: Record<string, unknown>): RestingFaceModel {
  const planner = data as unknown as MealPlannerData
  const week = Array.isArray(planner.week) ? planner.week : []
  const columns: RestColumn[] = DAY_NAMES.map((name, day) => {
    const items = MEAL_ORDER
      .map((meal) => week.find((slot) => slot?.day === day && slot?.meal === meal))
      .filter((slot) => text(slot?.dish))
      .slice(0, REST_COLUMN_ITEM_LIMIT)
      .map((slot, index) => ({
        key: text(slot?.id, `${day}-${index}`),
        label: compact(text(slot?.dish), 12),
      }))
    return { key: name, label: name, items, overflow: 0 }
  })
  // A week with nothing planned is a week with nothing to draw.
  if (columns.every((column) => column.items.length === 0)) return { kind: 'icon' }
  return { kind: 'columns', columns }
}

function workoutPlanFace(data: Record<string, unknown>): RestingFaceModel {
  const plan = data as unknown as WorkoutPlanData
  const days = Array.isArray(plan.days) ? plan.days : []
  const day = days[Math.max(0, finite(plan.activeDay) ?? 0)] ?? days[0]
  const exercises = Array.isArray(day?.exercises) ? day.exercises : []
  if (!day || exercises.length === 0) return { kind: 'icon' }
  const visible = exercises.slice(0, REST_ROW_LIMIT - 1)
  return {
    kind: 'rows',
    rows: [
      { key: 'session', label: compact(text(day.label, 'Session'), 24), tone: 'accent' },
      ...visible.map((exercise, index) => ({
        key: text(exercise?.id, `exercise-${index}`),
        label: compact(text(exercise?.name, 'Exercise'), 20),
        done: exercise?.done === true,
        value: `${finite(exercise?.sets) ?? 0}×${finite(exercise?.reps) ?? 0}`,
      })),
    ],
    overflow: Math.max(0, exercises.length - visible.length),
  }
}

// Trip Itinerary folds per worn skin in ./trip.ts, beside the other
// purpose-built families.

function medicationsFace(data: Record<string, unknown>): RestingFaceModel {
  const meds = data as unknown as MedicationsData
  const rows = Array.isArray(meds.rows) ? meds.rows : []
  return listFace('medications', data, rows as unknown as Row[], (entry, index) => {
    const doses = Array.isArray(entry.takenToday) ? entry.takenToday : []
    const taken = doses.filter((dose) => dose === true).length
    return {
      key: text(entry.id, `med-${index}`),
      label: compact(text(entry.name, 'Medication'), 20),
      // Doses taken out of doses due is the card's own reading, not a count of
      // its content — the same shape a Habit card wears.
      ...(doses.length > 0 ? { value: `${taken}/${doses.length}` } : {}),
      done: doses.length > 0 && taken === doses.length,
    }
  })
}

export function expansionRestingFace(
  type: ModuleType,
  data: Record<string, unknown>,
): RestingFaceModel | null {
  switch (type) {
    case 'clock_pulse': return clockPulseFace(data)
    case 'comparator': return comparatorFace(data)
    case 'aggregator': return aggregatorFace(data)
    case 'range_mapper': return rangeMapperFace(data)
    case 'latch': return latchFace(data)
    case 'sequencer': return sequencerFace(data)
    case 'template': return templateFace(data)
    case 'recorder': return recorderFace(data)
    case 'notifier': return notifierFace(data)
    case 'meal_planner': return mealPlannerFace(data)
    case 'workout_plan': return workoutPlanFace(data)
    case 'trip_itinerary': return tripItineraryRestingFace(data)
    case 'medications': return medicationsFace(data)

    case 'subscriptions': {
      const rows = rowsOf(data, 'rows') as unknown as SubscriptionsData['rows']
      return listFace(type, data, rows as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `sub-${index}`),
        label: compact(text(entry.name, 'Subscription'), 20),
        value: `${formatRestNumber(finite(entry.cost) ?? 0)}/${text(entry.cycle, 'monthly').slice(0, 2)}`,
        ...(entry.active === false ? { tone: 'muted' as const } : {}),
      }))
    }
    case 'debt_payoff': {
      const debts = rowsOf(data, 'debts') as unknown as DebtPayoffData['debts']
      return listFace(type, data, debts as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `debt-${index}`),
        label: compact(text(entry.name, 'Debt'), 20),
        value: formatRestNumber(finite(entry.balance) ?? 0),
      }))
    }
    case 'expense_split': {
      const expenses = rowsOf(data, 'expenses') as unknown as ExpenseSplitData['expenses']
      return listFace(type, data, expenses as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `expense-${index}`),
        label: compact(text(entry.desc, 'Expense'), 20),
        value: formatRestNumber(finite(entry.amount) ?? 0),
        ...(text(entry.paidBy) ? { lead: text(entry.paidBy).slice(0, 2) } : {}),
      }))
    }
    case 'invoices': {
      const rows = rowsOf(data, 'rows') as unknown as InvoicesData['rows']
      return listFace(type, data, rows as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `invoice-${index}`),
        label: compact(text(entry.client, 'Client'), 18),
        value: formatRestNumber(finite(entry.amount) ?? 0),
        done: entry.status === 'paid',
        ...(entry.status === 'paid'
          ? { tone: 'good' as const }
          : entry.status === 'draft' ? { tone: 'muted' as const } : {}),
      }))
    }
    case 'home_maintenance': {
      const rows = rowsOf(data, 'rows') as unknown as HomeMaintenanceData['rows']
      return listFace(type, data, rows as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `task-${index}`),
        label: compact(text(entry.task, 'Task'), 20),
        value: text(entry.lastDone) ? shortDate(entry.lastDone) : `${finite(entry.everyMonths) ?? 0}mo`,
      }))
    }
    case 'renewals_vault': {
      const rows = rowsOf(data, 'rows') as unknown as RenewalsVaultData['rows']
      return listFace(type, data, rows as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `renewal-${index}`),
        label: compact(text(entry.item, 'Item'), 20),
        value: shortDate(entry.expires),
      }))
    }
    case 'job_applications': {
      const rows = rowsOf(data, 'rows') as unknown as JobApplicationsData['rows']
      return listFace(type, data, rows as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `application-${index}`),
        label: compact(text(entry.company, 'Company'), 18),
        value: compact(text(entry.stage, 'wishlist'), 10),
        done: entry.stage === 'offer',
        ...(entry.stage === 'offer'
          ? { tone: 'good' as const }
          : entry.stage === 'closed' ? { tone: 'muted' as const } : {}),
      }))
    }
    case 'decision_journal': {
      const entries = rowsOf(data, 'entries') as unknown as DecisionJournalData['entries']
      return listFace(type, data, entries as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `decision-${index}`),
        label: compact(text(entry.decision, 'Decision'), 20),
        value: text(entry.verdict) || `${finite(entry.confidence) ?? 0}%`,
        ...(entry.verdict === 'hit'
          ? { tone: 'good' as const }
          : entry.verdict === 'miss' ? { tone: 'bad' as const } : {}),
      }))
    }
    case 'keep_in_touch': {
      const rows = rowsOf(data, 'rows') as unknown as KeepInTouchData['rows']
      return listFace(type, data, rows as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `person-${index}`),
        label: compact(text(entry.name, 'Person'), 20),
        value: text(entry.lastContact) ? shortDate(entry.lastContact) : `${finite(entry.cadenceDays) ?? 0}d`,
      }))
    }
    case 'gifts_occasions': {
      const rows = rowsOf(data, 'rows') as unknown as GiftsOccasionsData['rows']
      return listFace(type, data, rows as unknown as Row[], (entry, index) => ({
        key: text(entry.id, `gift-${index}`),
        label: compact(text(entry.person, 'Person'), 18),
        value: shortDate(entry.date),
        done: entry.bought === true,
      }))
    }
    case 'guest_list': {
      const rows = rowsOf(data, 'rows') as unknown as GuestListData['rows']
      return listFace(type, data, rows as unknown as Row[], (entry, index) => {
        const plusOnes = finite(entry.plusOnes) ?? 0
        const status = text(entry.status, 'invited')
        return {
          key: text(entry.id, `guest-${index}`),
          label: compact(text(entry.name, 'Guest'), 18),
          value: plusOnes > 0 ? `${status} +${plusOnes}` : status,
          ...(GUEST_TONES[status] ? { tone: GUEST_TONES[status] } : {}),
        }
      })
    }
    case 'recipe': {
      const recipe = data as unknown as RecipeData
      // Quantities scale with the servings the cook set, exactly as the open
      // card scales them.
      const scale = (finite(recipe.servings) ?? 1) / Math.max(1, finite(recipe.baseServings) ?? 1)
      return listFace(type, data, rowsOf(data, 'ingredients'), (entry, index) => ({
        key: text(entry.id, `ingredient-${index}`),
        label: compact(text(entry.item, 'Ingredient'), 20),
        value: `${formatRestNumber((finite(entry.qty) ?? 0) * scale)}${text(entry.unit) ? ` ${text(entry.unit)}` : ''}`,
      }))
    }
    case 'chore_rotation': {
      const rota = data as unknown as ChoreRotationData
      const people = Array.isArray(rota.people) ? rota.people.filter((name) => text(name)) : []
      const chores = Array.isArray(rota.chores) ? rota.chores.filter((name) => text(name)) : []
      if (chores.length === 0) return { kind: 'icon' }
      const offset = finite(rota.offset) ?? 0
      const visible = chores.slice(0, REST_ROW_LIMIT)
      return {
        kind: 'rows',
        // Who has which chore this turn is the whole card; the rotation offset
        // is applied here the way the open card applies it.
        rows: visible.map((chore, index) => ({
          key: `chore-${index}`,
          label: compact(chore, 20),
          ...(people.length > 0
            ? { value: compact(people[(index + offset) % people.length]!, 14) }
            : {}),
        })),
        overflow: Math.max(0, chores.length - visible.length),
      }
    }
    case 'snippet_library': {
      const entries = rowsOf(data, 'entries') as unknown as SnippetLibraryData['entries']
      // The open card sorts by use, so the folded one shows the same snippets
      // at the top rather than a different four.
      const ranked = [...entries].sort(
        (left, right) => (finite(right.useCount) ?? 0) - (finite(left.useCount) ?? 0),
      )
      return listFace(type, data, ranked as unknown as Row[], (entry, index) => {
        const uses = finite(entry.useCount) ?? 0
        return {
          key: text(entry.id, `snippet-${index}`),
          label: compact(text(entry.title, 'Snippet'), 22),
          ...(uses > 0 ? { value: `×${uses}` } : {}),
        }
      })
    }
    case 'weekly_review': {
      const review = data as unknown as WeeklyReviewData
      return listFace(type, data, rowsOf(data, 'prompts'), (entry, index) => ({
        key: text(entry.id, `prompt-${index}`),
        label: compact(text(entry.q, 'Prompt'), 26),
        done: text(entry.answer) !== '' || review.completedThisWeek === true,
      }))
    }
    default:
      return null
  }
}
