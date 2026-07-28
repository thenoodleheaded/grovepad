import type { DatePickerData, FormField, FormWidgetData, LogbookData, MeetingNotesData, ModuleType, PollData, ProsConsData, ProsConsItem, Size, Widget } from '../types/spatial'
import { GRID_SIZE, ICON_MIN_EDGE } from '../types/spatial'
import {
  noteCalloutTone,
  noteVersionSnapshots,
  type NoteSkinMode,
} from '../components/widgets/modules/noteSkinModel'
import {
  dateDay,
  dateReading,
  deadlineLeadDays,
  deadlineProgress,
  mediumDayText,
  MILESTONE_STATUS_LABELS,
  milestoneDetail,
  rangeEndDay,
  rangeSpan,
  shortDayText,
} from '../components/widgets/modules/dateSkinModel'
import {
  logbookEntries,
  logbookEntryDetails,
  logbookSkinMode,
  orderedLogbookEntries,
} from '../components/widgets/modules/logbookSkinModel'
import {
  EMOJI_CHOICES,
  formatRating,
  npsBand,
  npsScore,
  ratingConfidence,
  ratingSkinMode,
  trafficChoice,
} from '../components/widgets/modules/ratingSkinModel'
import {
  meetingItemDetails,
  meetingNotesSkinMode,
} from '../components/widgets/modules/meetingNotesSkinModel'
import {
  habitBestRun,
  habitDoneCount,
  habitSkinMode,
} from '../components/widgets/modules/habitSkinModel'
import {
  formFields,
  formSkinMode,
  inspectionCheck,
  inspectionChecks,
  inspectionResult,
  ratingValue,
  RATING_MAX,
} from '../components/widgets/modules/formSkinModel'
import {
  prosConsItems,
  prosConsSkinMode,
  prosConsWeights,
  redTeamDetail,
  redTeamDetails,
  reversibilityFor,
  reversibilityMap,
  statedItems,
  weightFor,
} from '../components/widgets/modules/prosConsSkinModel'
import {
  liveRoomState,
  pollBallotCount,
  pollOptions,
  pollSkinMode,
  pollTallies,
  totalPollVotes,
} from '../components/widgets/modules/pollSkinModel'
import {
  cataloguedSkin,
  dressWithCatalogueSkin,
  skinDetails,
} from './restingFaces/catalogue'
import { calendarRestingFace } from './restingFaces/calendar'
import { canvasLmsRestingFace } from './restingFaces/canvasLms'
import { trackerRestingFace } from './restingFaces/atlas'
import { goalRestingFace, progressRestingFace } from './restingFaces/goal'
import {
  locationRestingFace,
  toggleRestingFace,
} from './restingFaces/structure'
import {
  canvasNodeRestingFace,
  mediaRestingFace,
  sketchpadRestingFace,
} from './restingFaces/visual'
import {
  bulletsRestingFace,
  codeRestingFace,
  linksRestingFace,
  textInputRestingFace,
} from './restingFaces/text'
import {
  calculatorRestingFace,
  counterRestingFace,
  formulaRestingFace,
  numberInputRestingFace,
} from './restingFaces/numeric'
import { tableRestingFace } from './restingFaces/table'
import { tasksRestingFace } from './restingFaces/tasks'
import { timekeeperRestingFace } from './restingFaces/time'
import { titleCapsuleWidth } from './titleCapsuleWidth'
import { clamp01 } from './math'
import {
  compact,
  finite,
  formatRestDuration,
  formatRestNumber,
  record,
  NOTE_REST_LINE_LIMIT,
  NOTE_REST_VERSION_LIMIT,
  REST_ROW_LIMIT,
  type RestEyebrow,
  type RestingFace,
  type RestingFaceModel,
  type RestLine,
  type RestNoteLine,
  type RestNoteLineKind,
  type RestReadout,
  type RestRow,
} from './restingFaceModel'

// ---------------------------------------------------------------------------
// Resting face model — the single source for WHAT a resting widget shows and
// HOW MUCH SPACE it occupies.
//
// The law: a resting face is the widget's information drawn as itself, in
// exactly the pixels that information needs. Content decides the tile size;
// the tile never decides how much content fits. Corollaries:
// - A count of the content is not the content. Faces show real rows, real
//   text, real values — never "N items".
// - A widget with nothing to show collapses to a bare icon cell.
// - A widget whose content is an image rests as the image itself.
//
// Everything here is pure and bounded: at most ROW_LIMIT rows, MARK_LIMIT
// marks, TEXT_CLAMP characters — resting render cost never grows with data.
// Geometry consumers (edge layers, ports) and the face renderer both read
// this model, so visuals and anchors can never disagree.
// ---------------------------------------------------------------------------

export type {
  RestBar,
  RestCell,
  RestChip,
  RestColumn,
  RestEyebrow,
  RestLane,
  RestLine,
  RestNode,
  RestNoteLine,
  RestNoteLineKind,
  RestNoteModel,
  RestReadout,
  RestRow,
  RestTone,
  RestingFace,
  RestingFaceModel,
} from './restingFaceModel'
export {
  NOTE_REST_LINE_LIMIT,
  NOTE_REST_VERSION_LIMIT,
  REST_ROW_LIMIT,
} from './restingFaceModel'

const MARK_SAMPLE_LIMIT = 24
const TEXT_CLAMP = 220
const TEXT_LINE_LIMIT = 6
const NOTE_REST_TEXT_LIMIT = 420
const NOTE_REST_LINE_CHARS = 58

// Layout constants shared with WidgetRestingFace.tsx — change together.
const REST_PAD_X = 12
const REST_ROW_HEIGHT = 16
const REST_TEXT_LINE_HEIGHT = 14
const PAD_Y = 10
const OVERFLOW_LINE = 14
const ROW_GLYPH = 16
const ROW_VALUE_GAP = 10
/** One outline step, matching RowsFace's indent in WidgetRestingFace.tsx. */
const ROW_INDENT = 9
const MIN_TILE = GRID_SIZE
const MAX_TILE_WIDTH = 240
const CHART_WIDTH = 140
const CHART_STATS_WIDTH = 64
const STARS_WIDTH = 5 * 16 + 4 * 4 + REST_PAD_X * 2
/** Keep in step with BooleanFace's track in WidgetRestingFace.tsx. */
const BOOLEAN_SWITCH_WIDTH = 26

// Skin grammars. A board, a month, or a timeline is a two-dimensional shape:
// squeezing it into the six-cell text ceiling would turn it back into a list,
// which is exactly what folding it must NOT do. They get their own ceiling.
const MAX_WIDE_TILE = 360
const EYEBROW_HEIGHT = 14
const COLUMN_HEADER = 13
const COLUMN_ITEM = 13
const COLUMN_GAP = 6
const COLUMN_MIN_WIDTH = 42
const COLUMN_MAX_WIDTH = 96
const DENSE_CELL = 15
const DENSE_GAP = 2
const GRID_ROW_HEIGHT = 14
const GRID_COL_GAP = 8
const BAR_ROW_HEIGHT = 16
const BAR_TRACK_WIDTH = 54
const GAUGE_DIAMETER = 46
const CHIP_HEIGHT = 17
const CHIP_GAP = 4
const CHIP_PAD = 12
const LINE_HEIGHT = 13
const LINE_GAP = 12
const NODE_WIDTH = 46
const NODE_CONNECTOR = 12
const NODE_HEIGHT = 30
const TIMELINE_LABEL = 62
const TIMELINE_TRACK = 118
const TIMELINE_ROW = 15
const TIMELINE_SCALE = 10
const SPLIT_DIVIDER = 22
const CLOCK_READOUT_WIDTH = 92
const CLOCK_READOUT_HEIGHT = 28
const PAPER_WIDTH = GRID_SIZE * 4
const PAPER_HEIGHT = GRID_SIZE * 3

const ARRAY_KEYS = [
  'items', 'rows', 'entries', 'steps', 'tasks', 'cards', 'options', 'tiles',
  'events', 'habits', 'debts', 'people', 'exercises', 'prompts', 'keyResults',
  'ingredients', 'zones', 'links', 'columns',
] as const

const CHART_ARRAY_KEYS = ['bars', 'points', 'segments'] as const

const LABEL_KEYS = [
  'label', 'text', 'title', 'name', 'front', 'word', 'task', 'description', 'url',
] as const

const VALUE_KEYS = [
  'value', 'amount', 'votes', 'hours', 'score', 'quantity', 'cost', 'balance', 'count',
] as const

const NUMBER_KEYS = [
  'result', 'value', 'total', 'count', 'progress', 'score', 'rating', 'balance',
  'amount', 'hours', 'current', 'target', 'input', 'held', 'quantity', 'cost',
  'remainingSeconds', 'durationSeconds', 'pillsLeft', 'fireCount', 'streak', 'bpm',
] as const

const STRING_KEYS = [
  'result', 'status', 'stage', 'pick', 'nextAction', 'message', 'text', 'content',
  'body', 'objective', 'tripName', 'caption', 'decision', 'question', 'date',
  'time', 'role', 'name',
] as const

const COMPLETE_STATUSES = new Set(['complete', 'completed', 'done', 'closed', 'resolved', 'paid', 'yes', 'taken'])

// ---------------------------------------------------------------------------
// Text measurement — canvas when available, deterministic estimate otherwise
// (tests, SSR). Slightly generous so truncation is a safety net, not the norm.
// ---------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null | undefined
const FACE_FONT = '500 10px "Clash Display"'

function measureFaceText(text: string): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined'
      ? document.createElement('canvas').getContext('2d')
      : null
  }
  if (measureCtx) {
    measureCtx.font = FACE_FONT
    return measureCtx.measureText(text).width * 1.06
  }
  return text.length * 5.6
}

const NOTE_SKINS = new Set<NoteSkinMode>([
  'plain',
  'sticky',
  'quote',
  'daily_log',
  'markdown_page',
  'typewriter',
  'callout',
  'versioned_note',
])

function noteSkin(type: ModuleType, raw: unknown): NoteSkinMode {
  if (type === 'sticky_note') return 'sticky'
  if (type === 'quote') return 'quote'
  return typeof raw === 'string' && NOTE_SKINS.has(raw as NoteSkinMode)
    ? raw as NoteSkinMode
    : 'plain'
}

/**
 * A Note preview is deliberately a tiny tokenizer rather than a mounted
 * editor or the full Markdown renderer. It reads a bounded prefix, emits at
 * most five short lines, and preserves just enough syntax to keep Markdown
 * visibly Markdown-shaped.
 */
function notePreviewLines(raw: string, skin: NoteSkinMode): RestNoteLine[] {
  const source = raw.slice(0, NOTE_REST_TEXT_LIMIT).replace(/\r\n?/g, '\n')
  const result: RestNoteLine[] = []
  let inCode = false

  const push = (kind: RestNoteLineKind, value: string) => {
    let remaining = value.replace(/\s+/g, ' ').trim()
    if (kind === 'rule') {
      result.push({ kind, text: '' })
      return
    }
    while (remaining && result.length < NOTE_REST_LINE_LIMIT) {
      if (remaining.length <= NOTE_REST_LINE_CHARS) {
        result.push({ kind, text: remaining })
        break
      }
      const breakAt = Math.max(
        1,
        remaining.lastIndexOf(' ', NOTE_REST_LINE_CHARS),
      )
      result.push({ kind, text: remaining.slice(0, breakAt).trimEnd() })
      remaining = remaining.slice(breakAt).trimStart()
    }
  }

  for (const rawLine of source.split('\n')) {
    if (result.length >= NOTE_REST_LINE_LIMIT) break
    const line = rawLine.trim()
    if (!line) continue

    if (skin === 'markdown_page') {
      if (/^```/.test(line)) {
        inCode = !inCode
        continue
      }
      if (inCode) {
        push('code', line)
        continue
      }
      const heading = line.match(/^#{1,3}\s+(.+)$/)
      if (heading) {
        push('heading', heading[1] ?? '')
        continue
      }
      const bullet = line.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/)
      if (bullet) {
        push('bullet', bullet[1] ?? '')
        continue
      }
      const quote = line.match(/^>\s?(.+)$/)
      if (quote) {
        push('quote', quote[1] ?? '')
        continue
      }
      if (/^(?:---+|___+|\*\*\*+)$/.test(line)) {
        push('rule', '')
        continue
      }
    }

    push('text', line)
  }

  return result
}

function noteRestModel(type: ModuleType, data: Record<string, unknown>): RestingFaceModel {
  const skin = noteSkin(type, data.mode)
  const text = typeof data.text === 'string' ? data.text : ''
  const states = record(data.skinStates) ?? {}
  const state = record(states[skin]) ?? {}
  const lines = notePreviewLines(text, skin)
  const attribution = skin === 'quote' && typeof data.attribution === 'string'
    ? compact(data.attribution.slice(0, 100), 48)
    : ''
  const versions = skin === 'versioned_note'
    ? noteVersionSnapshots(state.snapshots)
      .slice(0, NOTE_REST_VERSION_LIMIT)
      .map((snapshot) => compact(snapshot.label, 34))
    : []

  if (lines.length === 0 && !attribution && versions.length === 0) return { kind: 'icon' }

  const color = skin === 'sticky' && (
    data.color === 'yellow' ||
    data.color === 'pink' ||
    data.color === 'blue' ||
    data.color === 'green' ||
    data.color === 'purple'
  ) ? data.color : undefined
  const date = skin === 'daily_log' && typeof state.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.date)
    ? state.date
    : undefined

  return {
    kind: 'note',
    skin,
    lines,
    ...(color ? { color } : {}),
    ...(attribution ? { attribution } : {}),
    ...(date ? { date } : {}),
    ...(skin === 'callout' ? { tone: noteCalloutTone(state.tone) } : {}),
    ...(versions.length > 0 ? { versions } : {}),
  }
}

function humanize(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase())
}

/** Snap up to the full-cell lattice: a resting tile sits on the same grid as
 * every other widget box, so tiles, icons, and cards always line up. */
function snap(value: number): number {
  return Math.max(MIN_TILE, Math.ceil(value / GRID_SIZE) * GRID_SIZE)
}

/**
 * The eyebrow renders a size down, in caps, and letter-spaced. The tracking is
 * a real 0.11em per character and has to be measured, or a long skin name
 * ("Programmer", "Birthday & Anniversary") is sized to fit and then truncates
 * anyway.
 */
function eyebrowWidth(eyebrow: RestEyebrow): number {
  const label = eyebrow.label.toUpperCase()
  return (
    measureFaceText(label) * 0.85 + label.length * 0.9 +
    (eyebrow.note ? measureFaceText(eyebrow.note) * 0.9 + 10 : 0)
  )
}

// ---------------------------------------------------------------------------
// Row extraction — the anti-"N items" machinery. An array of records becomes
// real rows: label, optional completion, optional trailing value.
// ---------------------------------------------------------------------------

function itemCompletion(item: Record<string, unknown>): boolean | undefined {
  for (const key of ['done', 'completed', 'checked', 'resolved', 'bought', 'booked'] as const) {
    if (typeof item[key] === 'boolean') return item[key]
  }
  const status = typeof item.status === 'string' ? item.status.toLowerCase() : null
  return status ? COMPLETE_STATUSES.has(status) : undefined
}

function itemLabel(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (Array.isArray(value)) {
    // A table row: its first textual cell stands for the row.
    const cell = value.find((entry) => typeof entry === 'string' && entry.trim())
    return typeof cell === 'string' ? cell.trim() : null
  }
  const item = record(value)
  if (!item) return null
  for (const key of LABEL_KEYS) {
    const label = item[key]
    if (typeof label === 'string' && label.trim()) return label.trim()
  }
  return null
}

function itemValue(value: unknown): string | undefined {
  const item = record(value)
  if (!item) return undefined
  for (const key of VALUE_KEYS) {
    const raw = finite(item[key])
    if (raw !== null) return formatRestNumber(raw)
  }
  return undefined
}

function rowsFromArray(values: readonly unknown[]): { rows: RestRow[]; overflow: number } | null {
  const rows: RestRow[] = []
  for (let index = 0; index < values.length && rows.length < REST_ROW_LIMIT; index++) {
    const label = itemLabel(values[index])
    if (label === null) continue
    const item = record(values[index])
    rows.push({
      key: item && typeof item.id === 'string' ? item.id : `row-${index}`,
      label: compact(label, 40),
      done: item ? itemCompletion(item) : undefined,
      value: itemValue(values[index]),
    })
  }
  if (rows.length === 0) return null
  // Only rows that yielded a label count as shown; everything else overflows.
  const labeled = values.filter((value) => itemLabel(value) !== null).length
  return { rows, overflow: Math.max(0, labeled - rows.length) }
}

function paletteColors(values: readonly unknown[]): readonly string[] | null {
  const colors: string[] = []
  for (const candidate of values.slice(0, MARK_SAMPLE_LIMIT)) {
    if (colors.length >= 6) break
    const raw = typeof candidate === 'string'
      ? candidate
      : record(candidate) && typeof (candidate as { color?: unknown }).color === 'string'
        ? (candidate as { color: string }).color
        : null
    if (raw && /^(#[\da-f]{3,8}|(?:rgb|hsl|oklch)\()/i.test(raw)) colors.push(raw)
  }
  return colors.length > 1 ? colors : null
}

// ---------------------------------------------------------------------------
// Per-type specials, then the generic ladder.
// ---------------------------------------------------------------------------

/**
 * The readouts worth printing beside a plot. A chart's shape shows the trend;
 * these are the numbers the shape cannot state exactly — where it stands now,
 * how far it moved, and the range it moved inside.
 */
function chartStats(series: readonly unknown[], unit: string): { label: string; value: string }[] {
  const values: number[] = []
  for (const point of series) {
    const value = typeof point === 'number' ? point : finite(record(point)?.value)
    if (value !== null && value !== undefined) values.push(value)
  }
  if (values.length === 0) return []
  const suffix = (n: number) => `${formatRestNumber(n)}${unit}`
  const latest = values.at(-1)!
  const first = values[0]!
  const stats = [{ label: 'Now', value: suffix(latest) }]
  if (values.length > 1) {
    const delta = latest - first
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
    stats.push({ label: 'Change', value: `${sign}${suffix(Math.abs(delta))}` })
    // Printing the peak only tells the reader something when the series is
    // not currently sitting on it.
    const peak = Math.max(...values)
    if (peak !== latest) stats.push({ label: 'Peak', value: suffix(peak) })
  }
  return stats
}

function specialModel(type: ModuleType, data: Record<string, unknown>): RestingFaceModel | null {
  // Skinned families answer for themselves: each module below reads the same
  // skin model the open card reads, so the folded tile wears the same shape.
  if (type === 'tracker') return trackerRestingFace(data)
  if (type === 'checklist') return tasksRestingFace(data)
  if (type === 'table') return tableRestingFace(data)
  if (type === 'goal_tracker') return goalRestingFace(data)
  if (type === 'progress') return progressRestingFace(data)
  if (type === 'counter') return counterRestingFace(data)
  if (type === 'calculator') return calculatorRestingFace(data)
  if (type === 'formula') return formulaRestingFace(data)
  if (type === 'number_input') return numberInputRestingFace(data)
  if (type === 'bullets') return bulletsRestingFace(data)
  if (type === 'links') return linksRestingFace(data)
  if (type === 'media') return mediaRestingFace(data)
  if (type === 'sketchpad') return sketchpadRestingFace(data)
  if (type === 'bar_chart' || type === 'line_chart' || type === 'pie_chart') {
    const series = CHART_ARRAY_KEYS.map((key) => data[key]).find(Array.isArray)
    if (!Array.isArray(series) || series.length === 0) return { kind: 'icon' }
    return { kind: 'chart', stats: chartStats(series, typeof data.unit === 'string' ? data.unit : '') }
  }
  if (type === 'calendar') return calendarRestingFace(data)
  if (type === 'canvas_lms') return canvasLmsRestingFace(data)
  if (type === 'location') return locationRestingFace(data)
  /**
   * A folded Date card shows the answer its skin is for, not the field it
   * stores: a Deadline rests as the days left, a Range as its two ends, a
   * Milestone as its status. All of it comes from the one shared reading, so a
   * resting tile can never contradict the open card or a `days_until` wire.
   */
  if (type === 'date_picker') {
    const dateData = data as unknown as DatePickerData
    const reading = dateReading(dateData)
    if (!reading.day) return { kind: 'icon' }
    if (reading.skin === 'range') {
      const span = rangeSpan(dateDay(dateData.date), rangeEndDay(dateData))
      if (!span) return { kind: 'icon' }
      return {
        kind: 'rows',
        rows: [
          { key: 'span', label: `${span.nights} ${span.nights === 1 ? 'night' : 'nights'}`, value: shortDayText(span.start) },
          { key: 'end', label: 'Ends', value: shortDayText(span.end) },
        ],
        overflow: 0,
      }
    }
    if (reading.skin === 'milestone') {
      const detail = milestoneDetail(dateData)
      return {
        kind: 'rows',
        rows: [
          { key: 'status', label: MILESTONE_STATUS_LABELS[detail.status], value: mediumDayText(reading.day) },
          ...(detail.owner ? [{ key: 'owner', label: compact(detail.owner, 24), value: reading.phrase }] : []),
        ],
        overflow: 0,
      }
    }
    if (reading.skin === 'deadline') {
      const days = reading.days ?? 0
      return {
        kind: 'metric',
        primary: days === 0 ? 'Today' : String(Math.abs(days)),
        secondary: days === 0 ? 'Due' : days < 0 ? 'Days overdue' : 'Days left',
        progress: deadlineProgress(days, deadlineLeadDays(dateData)),
      }
    }
    // Anniversary, Recurring Date and Date & Time all rest as the phrase the
    // card leads with, over the day it resolves to.
    return {
      kind: 'metric',
      primary: reading.phrase,
      secondary: mediumDayText(reading.day),
    }
  }
  if (type === 'logbook') {
    const logData = data as unknown as LogbookData
    const entries = logbookEntries(data.entries)
    if (entries.length === 0) return { kind: 'icon' }
    const skin = logbookSkinMode(data.skin)
    const details = logbookEntryDetails(logData, skin)
    const visible = orderedLogbookEntries(entries, 'newest').slice(0, 4)
    const valueFor = (entry: (typeof visible)[number]): string => {
      const detail = details[entry.id] ?? {}
      if (skin === 'incident_log') return detail.status ?? entry.level
      if (skin === 'lab_notebook') return detail.conclusion ? 'Conclusion' : detail.hypothesis ? 'Hypothesis' : 'Experiment'
      if (skin === 'change_log') return detail.version || detail.changeKind || 'Change'
      if (skin === 'maintenance_log') return detail.nextService || detail.asset || 'Service'
      if (skin === 'audit_trail') return detail.actor || detail.source || 'Event'
      if (skin === 'travel_log') return detail.place || detail.distance || 'Waypoint'
      return new Intl.DateTimeFormat('en', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(entry.timestamp))
    }
    return {
      kind: 'rows',
      rows: visible.map((entry) => ({
        key: entry.id,
        label: compact(entry.text || 'Empty entry', 28),
        value: compact(valueFor(entry), 16),
      })),
      overflow: Math.max(0, entries.length - visible.length),
    }
  }
  if (type === 'pros_cons') {
    const sheet = data as unknown as ProsConsData
    const skin = prosConsSkinMode(sheet.skin)
    const pros = statedItems(prosConsItems(sheet.pros))
    const cons = statedItems(prosConsItems(sheet.cons))
    if (pros.length === 0 && cons.length === 0) return { kind: 'icon' }
    const weights = prosConsWeights(sheet)
    const reversibility = reversibilityMap(sheet)
    const attacks = redTeamDetails(sheet)
    // Each skin folds to the number it is actually about: the weighted call
    // shows weights, the one-way check shows what cannot be undone.
    const valueFor = (item: ProsConsItem, side: 'pro' | 'con'): string => {
      if (skin === 'weighted_trade_off') return `×${weightFor(weights, item.id)}`
      if (skin === 'reversible_irreversible') {
        return reversibilityFor(reversibility, item.id) === 'irreversible' ? 'one-way' : 'undoable'
      }
      if (skin === 'red_team' && side === 'con') return redTeamDetail(attacks, item.id).severity
      return side === 'pro' ? 'pro' : 'con'
    }
    const visible = [
      ...pros.map((item) => ({ item, side: 'pro' as const })),
      ...cons.map((item) => ({ item, side: 'con' as const })),
    ].slice(0, 4)
    return {
      kind: 'rows',
      rows: visible.map(({ item, side }) => ({
        key: item.id,
        label: compact(item.text, 28),
        value: compact(valueFor(item, side), 16),
      })),
      overflow: Math.max(0, pros.length + cons.length - visible.length),
    }
  }
  if (type === 'form') {
    const form = data as unknown as FormWidgetData
    const fields = formFields(form.fields)
    if (fields.length === 0) return { kind: 'icon' }
    const skin = formSkinMode(form.skin)
    const checks = inspectionChecks(form)
    const valueFor = (field: FormField): string => {
      if (skin === 'inspection') return inspectionResult(field, inspectionCheck(checks, field.id))
      if (skin === 'feedback' && field.type === 'number') {
        const score = ratingValue(field)
        return score > 0 ? `${score}/${RATING_MAX}` : '—'
      }
      if (field.type === 'checkbox') return field.value === true ? 'yes' : 'no'
      const answer = String(field.value ?? '').trim()
      return answer || (field.required ? 'required' : '—')
    }
    const visible = fields.slice(0, 4)
    return {
      kind: 'rows',
      rows: visible.map((field) => ({
        key: field.id,
        label: compact(field.label || 'Untitled question', 28),
        value: compact(valueFor(field), 16),
      })),
      overflow: Math.max(0, fields.length - visible.length),
    }
  }
  if (type === 'poll') {
    const pollData = data as unknown as PollData
    const options = pollOptions(pollData.options)
    const total = totalPollVotes(options)
    // Nothing named and nothing cast is nothing to show.
    if (options.length === 0 || (total === 0 && options.every((option) => !option.label.trim()))) {
      return { kind: 'icon' }
    }
    const skin = pollSkinMode(pollData.skin)
    // A room that has not revealed its result must not leak it while folded.
    const masked = skin === 'live_room' && !liveRoomState(pollData).revealed
    const ballots = pollBallotCount(pollData, 'approval')
    const visible = pollTallies(options, 'leading').slice(0, 4)
    const valueFor = (tally: (typeof visible)[number]): string => {
      if (masked) return '•••'
      if (total === 0) return '—'
      if (skin === 'pairwise') return `${tally.votes}W`
      if (skin === 'approval' && ballots > 0) return `${tally.votes}/${ballots}`
      return `${tally.share}%`
    }
    return {
      kind: 'rows',
      rows: visible.map((tally) => ({
        key: tally.option.id,
        label: compact(tally.option.label || 'Untitled option', 28),
        value: valueFor(tally),
      })),
      overflow: Math.max(0, options.length - visible.length),
    }
  }
  if (type === 'rating') {
    const value = finite(data.value) ?? 0
    const skin = ratingSkinMode(data.skin)
    if (skin === 'emoji') {
      return {
        kind: 'text',
        text: EMOJI_CHOICES.find((choice) => choice.value === Math.round(value))?.emoji ?? '—',
      }
    }
    if (skin === 'traffic_light') {
      const signal = trafficChoice(value)
      const emoji = signal?.tone === 'green' ? '🟢' : signal?.tone === 'amber' ? '🟡' : signal ? '🔴' : '⚪'
      return { kind: 'text', text: `${emoji} ${signal?.label ?? 'No status'}` }
    }
    if (skin === 'nps') {
      const score = npsScore(value)
      return { kind: 'metric', primary: `${score}/10`, secondary: npsBand(score) }
    }
    if (skin === 'rubric') {
      return { kind: 'metric', primary: `${formatRating(value)}/5`, secondary: 'Rubric' }
    }
    if (skin === 'confidence') {
      const states = record(data.skinStates)
      const confidence = ratingConfidence(record(states?.confidence) ?? {})
      return {
        kind: 'metric',
        primary: `${formatRating(value)}/5`,
        secondary: `${confidence.percent}% confident`,
      }
    }
    if (skin === 'slider') {
      return { kind: 'metric', primary: `${formatRating(value)}/5`, secondary: 'Rating' }
    }
    return { kind: 'stars', value }
  }
  if (type === 'habit') {
    const done = habitDoneCount(data.days)
    const skin = habitSkinMode(data.skin)
    const secondary = skin === 'chain'
      ? `${habitBestRun(data.days)} day chain`
      : skin === 'scorecard'
        ? 'Weekly score'
        : skin === 'routine_stack'
          ? 'Routine stack'
          : skin === 'minimum_target'
            ? 'Minimum / target'
            : skin === 'flexible_frequency'
              ? 'Flexible week'
              : skin === 'month_heatmap'
                ? 'This month'
                : 'This week'
    return { kind: 'metric', primary: `${done}/7`, secondary, progress: done / 7 }
  }
  if (type === 'color_palette') {
    const colors = Array.isArray(data.colors) ? paletteColors(data.colors) : null
    return colors ? { kind: 'palette', colors } : { kind: 'icon' }
  }
  if (type === 'toggle') return toggleRestingFace(data)
  if (type === 'branch_gate') {
    const enabled = data.value === true
    const activeLabel = enabled ? data.trueLabel : data.falseLabel
    return typeof activeLabel === 'string' && activeLabel.trim()
      ? { kind: 'boolean', label: compact(activeLabel, 24), active: enabled }
      : { kind: 'boolean', label: enabled ? 'On' : 'Off', active: enabled }
  }
  if (type === 'timekeeper') return timekeeperRestingFace(data)
  if (type === 'timer' || type === 'stopwatch' || type === 'pomodoro') {
    // Retired standalone types kept for old-board hydration: the dial is the
    // face, and the card's own outline carries the marks.
    return { kind: 'clock', shape: 'dial' }
  }
  if (type === 'notes' || type === 'sticky_note' || type === 'quote') {
    return noteRestModel(type, data)
  }
  /**
   * A meeting rests as the work it left behind. It was previously grouped with
   * Code and read `text`/`content`/`body` — none of which a meeting has — so
   * every card rested as a bare icon no matter how full it was. The trailing
   * value is whatever the worn skin made that item mean.
   */
  if (type === 'meeting_notes') {
    const meeting = data as unknown as MeetingNotesData
    const actions = Array.isArray(meeting.actions) ? meeting.actions : []
    const skin = meetingNotesSkinMode(meeting.skin)
    if (actions.length > 0) {
      const details = meetingItemDetails(meeting, skin)
      const visible = actions.slice(0, 4)
      const valueFor = (id: string): string => {
        const detail = details[id] ?? {}
        if (skin === 'agenda') return detail.minutes ? `${detail.minutes} min` : ''
        if (skin === 'decision_review') return detail.review || detail.owner || ''
        return detail.owner || detail.due || ''
      }
      return {
        kind: 'rows',
        rows: visible.map((action) => ({
          key: action.id,
          label: compact(action.text || 'Untitled item', 28),
          done: action.done,
          value: compact(valueFor(action.id), 16) || undefined,
        })),
        overflow: Math.max(0, actions.length - visible.length),
      }
    }
    const notes = typeof meeting.notes === 'string' ? meeting.notes : ''
    if (!notes.trim()) return { kind: 'icon' }
    return { kind: 'text', text: compact(notes, TEXT_CLAMP) }
  }
  if (type === 'code') return codeRestingFace(data)
  /**
   * A Text Input's content is the string it emits, and `value` is not one of
   * the generic content keys — so a card holding a real address, query, or
   * command rested as a blank icon and hid the only thing it had to say.
   */
  if (type === 'text_input') return textInputRestingFace(data)
  if (type === 'canvas_node') return canvasNodeRestingFace(data)
  return null
}

function genericModel(data: Record<string, unknown>): RestingFaceModel {
  for (const key of ARRAY_KEYS) {
    const values = data[key]
    if (!Array.isArray(values) || values.length === 0) continue
    const rows = rowsFromArray(values)
    if (rows) return { kind: 'rows', rows: rows.rows, overflow: rows.overflow }
    const colors = paletteColors(values)
    if (colors) return { kind: 'palette', colors }
  }

  if (typeof data.value === 'boolean') {
    return { kind: 'boolean', label: data.value ? 'On' : 'Off', active: data.value }
  }

  for (const key of NUMBER_KEYS) {
    const value = finite(data[key])
    if (value === null) continue
    const target = finite(data.target)
    const max = finite(data.max)
    const min = finite(data.min) ?? 0
    const progress = max !== null && max > min ? clamp01((value - min) / (max - min))
      : (key === 'current' || key === 'value' || key === 'progress') && target !== null && target > 0 ? clamp01(value / target)
        : key === 'progress' ? clamp01(value > 1 ? value / 100 : value)
          : undefined
    return {
      kind: 'metric',
      primary: key === 'remainingSeconds' || key === 'durationSeconds'
        ? formatRestDuration(value)
        : formatRestNumber(value),
      secondary: humanize(key),
      ...(progress === undefined ? {} : { progress }),
    }
  }

  for (const key of STRING_KEYS) {
    const value = data[key]
    if (typeof value !== 'string' || !value.trim()) continue
    return { kind: 'text', text: compact(value, TEXT_CLAMP) }
  }

  return { kind: 'icon' }
}

// ---------------------------------------------------------------------------
// Sizing — each face declares exactly the box its content needs.
// ---------------------------------------------------------------------------

function modelSize(model: RestingFaceModel, widget: Pick<Widget, 'size' | 'title'>): Size {
  switch (model.kind) {
    case 'icon':
      // Never one cell. A bare icon tile is the same shape as the icon scale
      // state, so it obeys the same floor: 2×2 is the smallest anything
      // icon-shaped is allowed to be, here or anywhere else.
      return { width: ICON_MIN_EDGE, height: ICON_MIN_EDGE }
    case 'image':
      // The image rests at its own stored footprint; the resting resize
      // handle (ratio-locked) is what changes it.
      return widget.size
    case 'boolean': {
      // Switch track (26) + its gap (10) + the label, which renders a size up
      // from the measuring font and so needs the 1.15 correction. A checkbox
      // or power button is square and narrower than the track.
      const control = model.shape === 'checkbox' || model.shape === 'power' ? 16 : BOOLEAN_SWITCH_WIDTH
      return {
        width: snap(REST_PAD_X * 2 + control + 10 + measureFaceText(model.label) * 1.15),
        height: GRID_SIZE,
      }
    }
    case 'metric': {
      const textWidth = Math.max(
        measureFaceText(model.primary) * 1.5, // primary renders at 15px, measured at 10px
        measureFaceText(model.secondary.toUpperCase()) * 0.85,
        model.eyebrow ? eyebrowWidth(model.eyebrow) : 0,
      )
      const progressWidth = model.progress === undefined ? 0 : 54 + 8
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + textWidth + progressWidth)),
        height: model.eyebrow ? snap(GRID_SIZE + EYEBROW_HEIGHT) : GRID_SIZE,
      }
    }
    case 'clock': {
      // Square, because a dial is: the marks sit at equal clock angles, so a
      // wide tile would crowd them at twelve and six and fling them apart at
      // the sides. Three cells leaves room for the readout inside the bezel.
      if (!model.shape || model.shape === 'dial') {
        return { width: GRID_SIZE * 3, height: GRID_SIZE * 3 }
      }
      // The other shapes hang their context off the readout instead of ringing
      // it, so they measure like any other stacked face.
      let widest = model.eyebrow ? eyebrowWidth(model.eyebrow) : 0
      for (const row of model.rows ?? []) {
        widest = Math.max(
          widest,
          measureFaceText(row.label) + (row.value ? measureFaceText(row.value) + ROW_VALUE_GAP : 0),
        )
      }
      const chipRun = (model.chips ?? []).reduce(
        (sum, chip) => sum + measureFaceText(chip.text) * 1.05 + CHIP_PAD + CHIP_GAP,
        0,
      )
      widest = Math.max(widest, Math.min(MAX_TILE_WIDTH - REST_PAD_X * 2, chipRun), CLOCK_READOUT_WIDTH)
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + widest)),
        height: snap(
          PAD_Y * 2 +
          (model.eyebrow ? EYEBROW_HEIGHT : 0) +
          CLOCK_READOUT_HEIGHT +
          (model.chips && model.chips.length > 0 ? CHIP_HEIGHT + CHIP_GAP : 0) +
          (model.rows?.length ?? 0) * REST_ROW_HEIGHT,
        ),
      }
    }
    case 'stars':
      return { width: snap(STARS_WIDTH), height: GRID_SIZE }
    case 'palette':
      return { width: snap(REST_PAD_X * 2 + model.colors.length * 18), height: GRID_SIZE }
    case 'chart':
      // The plot needs real width to be a chart rather than a decoration, and
      // the readout column claims a fixed strip down its right edge.
      return { width: snap(CHART_WIDTH + CHART_STATS_WIDTH), height: GRID_SIZE * 2 }
    case 'text': {
      const total = measureFaceText(model.text)
      const inner = Math.min(MAX_TILE_WIDTH - REST_PAD_X * 2, Math.max(88, total))
      const lines = Math.min(TEXT_LINE_LIMIT, Math.max(1, Math.ceil(total / inner)))
      return {
        width: lines === 1
          ? snap(REST_PAD_X * 2 + total)
          : Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + inner)),
        height: snap(PAD_Y * 2 + lines * REST_TEXT_LINE_HEIGHT),
      }
    }
    case 'note': {
      const skinFloor = {
        plain: 140,
        sticky: 160,
        quote: 180,
        daily_log: 200,
        markdown_page: 200,
        typewriter: 200,
        callout: 180,
        versioned_note: 220,
      }[model.skin]
      let widest = 0
      for (const line of model.lines) {
        const scale = line.kind === 'heading' ? 1.18 : line.kind === 'code' ? 0.9 : 1
        widest = Math.max(widest, measureFaceText(line.text) * scale)
      }
      if (model.attribution) widest = Math.max(widest, measureFaceText(model.attribution) + 24)
      for (const version of model.versions ?? []) {
        widest = Math.max(widest, measureFaceText(version) + 42)
      }

      const header = model.skin === 'plain' || model.skin === 'sticky' || model.skin === 'quote' ? 0 : 20
      const footer = model.skin === 'quote' && model.attribution ? 16
        : model.skin === 'versioned_note' && model.versions?.length
          ? 8 + model.versions.length * 13
          : 0
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(Math.max(skinFloor, REST_PAD_X * 2 + widest))),
        height: snap(
          PAD_Y * 2 +
          header +
          Math.max(1, model.lines.length) * REST_TEXT_LINE_HEIGHT +
          footer,
        ),
      }
    }
    case 'rows': {
      let widest = 0
      for (const row of model.rows) {
        const valueWidth = row.value === undefined ? 0 : ROW_VALUE_GAP + measureFaceText(row.value)
        const leadWidth = row.lead === undefined ? 0 : measureFaceText(row.lead) + 6
        const indentWidth = (row.indent ?? 0) * ROW_INDENT
        widest = Math.max(widest, indentWidth + leadWidth + ROW_GLYPH + measureFaceText(row.label) + valueWidth)
      }
      if (model.eyebrow) widest = Math.max(widest, eyebrowWidth(model.eyebrow))
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + widest)),
        height: snap(
          PAD_Y * 2 +
          (model.eyebrow ? EYEBROW_HEIGHT : 0) +
          model.rows.length * REST_ROW_HEIGHT +
          (model.overflow > 0 ? OVERFLOW_LINE : 0) +
          (model.meter === undefined ? 0 : 6),
        ),
      }
    }
    case 'columns': {
      const perRow = Math.max(1, Math.min(model.wrap ?? model.columns.length, model.columns.length))
      const bandCount = Math.ceil(model.columns.length / perRow)
      const widths: number[] = []
      const heights: number[] = []
      for (const column of model.columns) {
        let widest = measureFaceText(column.label) * 0.8 +
          (column.note ? measureFaceText(column.note) * 0.8 + 8 : 0)
        for (const item of column.items) {
          widest = Math.max(
            widest,
            (measureFaceText(item.label) + (item.value ? measureFaceText(item.value) + 6 : 0)) * 0.88,
          )
        }
        widths.push(Math.min(COLUMN_MAX_WIDTH, Math.max(COLUMN_MIN_WIDTH, widest + 10)))
        heights.push(column.items.length * COLUMN_ITEM + (column.overflow > 0 ? 10 : 0))
      }
      // Each band is as wide as its widest members and as tall as its fullest
      // column, so a matrix's short quadrant never squashes the busy one.
      let widest = 0
      let stacked = 0
      for (let band = 0; band < bandCount; band++) {
        const slice = widths.slice(band * perRow, band * perRow + perRow)
        widest = Math.max(widest, slice.reduce((sum, value) => sum + value, 0) + COLUMN_GAP * (slice.length - 1))
        stacked += COLUMN_HEADER + Math.max(
          COLUMN_ITEM,
          ...heights.slice(band * perRow, band * perRow + perRow),
        )
      }
      return {
        width: Math.min(MAX_WIDE_TILE, snap(REST_PAD_X * 2 + widest)),
        height: snap(
          PAD_Y * 2 +
          (model.eyebrow ? EYEBROW_HEIGHT : 0) +
          stacked +
          COLUMN_GAP * (bandCount - 1),
        ),
      }
    }
    case 'grid': {
      const rows = Math.max(1, Math.ceil(model.cells.length / Math.max(1, model.cols)))
      if (model.dense) {
        return {
          width: Math.min(
            MAX_WIDE_TILE,
            snap(Math.max(
              REST_PAD_X * 2 + model.cols * DENSE_CELL + (model.cols - 1) * DENSE_GAP,
              model.eyebrow ? REST_PAD_X * 2 + eyebrowWidth(model.eyebrow) : 0,
            )),
          ),
          height: snap(
            PAD_Y * 2 +
            (model.eyebrow ? EYEBROW_HEIGHT : 0) +
            (model.header ? DENSE_CELL : 0) +
            rows * DENSE_CELL + (rows - 1) * DENSE_GAP,
          ),
        }
      }
      // A text grid takes its column widths from its own widest cell, so a
      // folded table lines its columns up the way the open one does.
      const columnWidths = new Array<number>(model.cols).fill(0)
      model.header?.forEach((text, index) => {
        if (index < model.cols) columnWidths[index] = measureFaceText(text)
      })
      model.cells.forEach((cell, index) => {
        const column = index % model.cols
        columnWidths[column] = Math.max(columnWidths[column]!, measureFaceText(cell.text))
      })
      const width = columnWidths.reduce((sum, value) => sum + value, 0) +
        GRID_COL_GAP * Math.max(0, model.cols - 1)
      return {
        width: Math.min(MAX_WIDE_TILE, snap(REST_PAD_X * 2 + Math.max(width, model.eyebrow ? eyebrowWidth(model.eyebrow) : 0))),
        height: snap(
          PAD_Y * 2 +
          (model.eyebrow ? EYEBROW_HEIGHT : 0) +
          (model.header ? GRID_ROW_HEIGHT : 0) +
          rows * GRID_ROW_HEIGHT,
        ),
      }
    }
    case 'bars': {
      let widest = 0
      for (const bar of model.bars) {
        widest = Math.max(widest, measureFaceText(bar.label) + 8 + measureFaceText(bar.value))
      }
      widest = Math.max(widest, BAR_TRACK_WIDTH)
      if (model.eyebrow) widest = Math.max(widest, eyebrowWidth(model.eyebrow))
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + Math.max(BAR_TRACK_WIDTH + 24, widest))),
        height: snap(
          PAD_Y * 2 + (model.eyebrow ? EYEBROW_HEIGHT : 0) + model.bars.length * BAR_ROW_HEIGHT,
        ),
      }
    }
    case 'gauge': {
      const textWidth = Math.max(
        measureFaceText(model.primary) * 1.4,
        measureFaceText(model.secondary.toUpperCase()) * 0.85,
        model.caption ? measureFaceText(model.caption) * 0.85 : 0,
      )
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + Math.max(GAUGE_DIAMETER + 10 + textWidth, model.eyebrow ? eyebrowWidth(model.eyebrow) : 0))),
        height: snap(PAD_Y * 2 + GAUGE_DIAMETER + (model.eyebrow ? EYEBROW_HEIGHT : 0)),
      }
    }
    case 'chips': {
      const inner = MAX_TILE_WIDTH - REST_PAD_X * 2
      let line = 0
      let lines = 1
      for (const chip of model.chips) {
        const width = measureFaceText(chip.text) * 1.05 + CHIP_PAD
        if (line > 0 && line + width > inner) { lines += 1; line = 0 }
        line += width + CHIP_GAP
      }
      const widest = model.chips.reduce(
        (max, chip) => Math.max(max, measureFaceText(chip.text) * 1.05 + CHIP_PAD),
        model.eyebrow ? eyebrowWidth(model.eyebrow) : 0,
      )
      const packed = model.chips.reduce(
        (sum, chip) => sum + measureFaceText(chip.text) * 1.05 + CHIP_PAD + CHIP_GAP,
        0,
      )
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + Math.max(widest, Math.min(inner, packed)))),
        height: snap(
          PAD_Y * 2 +
          (model.eyebrow ? EYEBROW_HEIGHT : 0) +
          lines * CHIP_HEIGHT + (lines - 1) * CHIP_GAP +
          (model.overflow > 0 ? 10 : 0),
        ),
      }
    }
    case 'lines': {
      const scale = model.mono ? 1.02 : 1
      let widest = model.eyebrow ? eyebrowWidth(model.eyebrow) : 0
      const measure = (line: RestLine) =>
        (measureFaceText(line.left) + (line.right ? measureFaceText(line.right) + LINE_GAP : 0)) * scale
      for (const line of model.lines) widest = Math.max(widest, measure(line))
      if (model.total) widest = Math.max(widest, measure(model.total) * 1.15)
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + widest)),
        height: snap(
          PAD_Y * 2 +
          (model.eyebrow ? EYEBROW_HEIGHT : 0) +
          Math.max(1, model.lines.length) * LINE_HEIGHT +
          (model.total ? LINE_HEIGHT + 5 : 0),
        ),
      }
    }
    case 'chain': {
      if (model.shape === 'stack') {
        let widest = model.eyebrow ? eyebrowWidth(model.eyebrow) : 0
        for (const node of model.nodes) {
          widest = Math.max(widest, 14 + measureFaceText(node.label) + (node.caption ? measureFaceText(node.caption) + 8 : 0))
        }
        return {
          width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + widest)),
          height: snap(
            PAD_Y * 2 +
            (model.eyebrow ? EYEBROW_HEIGHT : 0) +
            model.nodes.length * REST_ROW_HEIGHT +
            (model.overflow > 0 ? OVERFLOW_LINE : 0),
          ),
        }
      }
      const span = model.nodes.length * NODE_WIDTH +
        Math.max(0, model.nodes.length - 1) * NODE_CONNECTOR +
        (model.overflow > 0 ? NODE_CONNECTOR + 18 : 0)
      return {
        width: Math.min(MAX_WIDE_TILE, snap(REST_PAD_X * 2 + span)),
        height: snap(
          PAD_Y * 2 +
          (model.eyebrow ? EYEBROW_HEIGHT : 0) +
          NODE_HEIGHT +
          (model.shape === 'circular' ? 10 : 0),
        ),
      }
    }
    case 'timeline': {
      let labelWidth = 0
      for (const lane of model.lanes) labelWidth = Math.max(labelWidth, measureFaceText(lane.label))
      const label = Math.min(TIMELINE_LABEL, Math.max(34, labelWidth))
      return {
        width: Math.min(MAX_WIDE_TILE, snap(REST_PAD_X * 2 + label + 8 + TIMELINE_TRACK)),
        height: snap(
          PAD_Y * 2 +
          (model.eyebrow ? EYEBROW_HEIGHT : 0) +
          TIMELINE_SCALE +
          model.lanes.length * TIMELINE_ROW,
        ),
      }
    }
    case 'split': {
      const side = (readout: RestReadout) => Math.max(
        measureFaceText(readout.primary) * 1.4,
        measureFaceText(readout.secondary.toUpperCase()) * 0.85,
      )
      const divider = model.divider ? measureFaceText(model.divider) * 1.2 + 12 : SPLIT_DIVIDER
      return {
        width: Math.min(
          MAX_TILE_WIDTH,
          snap(REST_PAD_X * 2 + side(model.left) + divider + side(model.right)),
        ),
        height: snap(PAD_Y * 2 + (model.eyebrow ? EYEBROW_HEIGHT : 0) + 30),
      }
    }
    case 'paper':
      return {
        width: PAPER_WIDTH,
        height: snap(PAPER_HEIGHT + (model.eyebrow ? EYEBROW_HEIGHT : 0)),
      }
  }
}

const faceCache = new WeakMap<object, RestingFace>()

/**
 * The resting face for one widget: what it shows and the exact tile it needs.
 * Cached per widget record (widget objects are immutable snapshots), so edge
 * layers can call this per frame for free.
 */
export function restingFace(widget: Pick<Widget, 'type' | 'data' | 'size' | 'title'>): RestingFace {
  const cached = faceCache.get(widget)
  if (cached) return cached

  const data = record(widget.data) ?? {}
  const base = specialModel(widget.type, data) ?? genericModel(data)
  // A catalogued skin dresses the open card rather than replacing its body, so
  // the tile takes the same dress and whatever the base face left blank.
  const blueprint = cataloguedSkin(widget.type, data)
  const model = blueprint
    ? dressWithCatalogueSkin(base, blueprint, skinDetails(data, blueprint.value))
    : base
  const size = modelSize(model, widget)
  // Every face except the bare icon and the bare image stays wide enough for
  // its floating title capsule; content can exceed that, never undercut it.
  // Re-snapped after the max: the capsule floor is text-measured, and an
  // off-lattice floor would un-grid every tile whose title is its widest part.
  if (model.kind !== 'icon' && model.kind !== 'image') {
    size.width = snap(Math.max(size.width, titleCapsuleWidth(widget.title)))
  }

  const face: RestingFace = {
    model,
    size,
    ...(blueprint ? { presentation: blueprint.presentation } : {}),
  }
  faceCache.set(widget, face)
  return face
}
