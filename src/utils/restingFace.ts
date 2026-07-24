import type { ModuleType, Size, Widget } from '../types/spatial'
import { GRID_SIZE, ICON_MIN_EDGE } from '../types/spatial'
import { titleCapsuleWidth } from './titleCapsuleWidth'

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

export interface RestRow {
  key: string
  label: string
  /** Tri-state: undefined = the item has no completion concept. */
  done?: boolean
  /** Right-aligned trailing value (poll votes, budget amounts, metric tiles). */
  value?: string
}

export type RestingFaceModel =
  | { kind: 'icon' }
  | { kind: 'image' }
  | { kind: 'metric'; primary: string; secondary: string; progress?: number }
  | { kind: 'boolean'; label: string; active: boolean }
  | { kind: 'text'; text: string; tint?: string }
  | { kind: 'rows'; rows: readonly RestRow[]; overflow: number }
  | { kind: 'clock' }
  | {
      kind: 'chart'
      /** Readouts stacked down the right of the plot, most important first. */
      stats: readonly { label: string; value: string }[]
    }
  | { kind: 'stars'; value: number }
  | { kind: 'week' }
  | { kind: 'palette'; colors: readonly string[] }

export interface RestingFace {
  model: RestingFaceModel
  size: Size
}

export const REST_ROW_LIMIT = 6
const MARK_SAMPLE_LIMIT = 24
const TEXT_CLAMP = 220
const TEXT_LINE_LIMIT = 6

// Layout constants shared with WidgetRestingFace.tsx — change together.
const REST_PAD_X = 12
const REST_ROW_HEIGHT = 16
const REST_TEXT_LINE_HEIGHT = 14
const PAD_Y = 10
const OVERFLOW_LINE = 14
const ROW_GLYPH = 16
const ROW_VALUE_GAP = 10
const MIN_TILE = GRID_SIZE
const MAX_TILE_WIDTH = 240
const CHART_WIDTH = 140
const CHART_STATS_WIDTH = 64
const WEEK_WIDTH = 164
const WEEK_HEIGHT = 60
const STARS_WIDTH = 5 * 16 + 4 * 4 + REST_PAD_X * 2
/** Keep in step with BooleanFace's track in WidgetRestingFace.tsx. */
const BOOLEAN_SWITCH_WIDTH = 26

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

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function compact(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean
}

function formatRestNumber(value: number): string {
  const magnitude = Math.abs(value)
  if (magnitude >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (magnitude >= 1_000) return `${Math.round(value / 100) / 10}k`
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 10) / 10)
}

function formatRestDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remainder = safe % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function humanize(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase())
}

/** Snap up to the full-cell lattice: a resting tile sits on the same grid as
 * every other widget box, so tiles, icons, and cards always line up. */
function snap(value: number): number {
  return Math.max(MIN_TILE, Math.ceil(value / GRID_SIZE) * GRID_SIZE)
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
  if (type === 'media') {
    return data.url || data.localBlobKey ? { kind: 'image' } : { kind: 'icon' }
  }
  if (type === 'bar_chart' || type === 'line_chart' || type === 'pie_chart') {
    const series = CHART_ARRAY_KEYS.map((key) => data[key]).find(Array.isArray)
    if (!Array.isArray(series) || series.length === 0) return { kind: 'icon' }
    return { kind: 'chart', stats: chartStats(series, typeof data.unit === 'string' ? data.unit : '') }
  }
  if (type === 'calendar') return { kind: 'week' }
  if (type === 'rating') return { kind: 'stars', value: finite(data.value) ?? 0 }
  if (type === 'color_palette') {
    const colors = Array.isArray(data.colors) ? paletteColors(data.colors) : null
    return colors ? { kind: 'palette', colors } : { kind: 'icon' }
  }
  if (type === 'toggle' || type === 'branch_gate') {
    const enabled = data.value === true
    const activeLabel = enabled ? data.trueLabel : data.falseLabel
    return {
      kind: 'boolean',
      label: typeof activeLabel === 'string' && activeLabel.trim()
        ? compact(activeLabel, 24)
        : enabled ? 'On' : 'Off',
      active: enabled,
    }
  }
  if (type === 'timer' || type === 'stopwatch' || type === 'pomodoro' || type === 'timekeeper') {
    // The dial is the face: the card's own outline carries the marks, so the
    // tile only needs room for the readout inside them.
    return { kind: 'clock' }
  }
  if (type === 'formula') {
    const a = finite(data.a)
    const b = finite(data.b)
    if (a === null || b === null) return null
    const operator = typeof data.operator === 'string' ? data.operator : 'add'
    const result = operator === 'subtract' ? a - b
      : operator === 'multiply' ? a * b
        : operator === 'divide' ? (b === 0 ? 0 : a / b)
          : operator === 'modulo' ? (b === 0 ? 0 : a % b)
            : a + b
    return { kind: 'metric', primary: formatRestNumber(result), secondary: 'Result' }
  }
  if (type === 'notes' || type === 'sticky_note' || type === 'quote' || type === 'code' || type === 'meeting_notes') {
    const text = typeof data.text === 'string' ? data.text
      : typeof data.content === 'string' ? data.content
        : typeof data.body === 'string' ? data.body
          : ''
    if (!text.trim()) return { kind: 'icon' }
    return {
      kind: 'text',
      text: compact(text, TEXT_CLAMP),
      ...(type === 'sticky_note' && typeof data.color === 'string' ? { tint: data.color } : {}),
    }
  }
  if (type === 'table') {
    const rows = Array.isArray(data.rows) ? data.rows : []
    // Row 0 is the header: printing it as a record would state a column name
    // where the reader expects a value.
    const body = rows.slice(1).filter((row): row is unknown[] => Array.isArray(row))
    if (body.length === 0) return { kind: 'icon' }
    const shown = body.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      rows: shown.map((row, index) => {
        const cells = row.filter((cell): cell is string => typeof cell === 'string' && cell.trim() !== '')
        return {
          key: `row-${index}`,
          label: compact(cells[0] ?? '', 40),
          ...(cells.length > 1 ? { value: compact(cells[cells.length - 1]!, 10) } : {}),
        }
      }).filter((row) => row.label !== ''),
      overflow: Math.max(0, body.length - shown.length),
    }
  }
  if (type === 'canvas_node') return { kind: 'text', text: 'Open canvas' }
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
    case 'boolean':
      // Switch track (26) + its gap (10) + the label, which renders a size up
      // from the measuring font and so needs the 1.15 correction.
      return {
        width: snap(REST_PAD_X * 2 + BOOLEAN_SWITCH_WIDTH + 10 + measureFaceText(model.label) * 1.15),
        height: GRID_SIZE,
      }
    case 'metric': {
      const textWidth = Math.max(
        measureFaceText(model.primary) * 1.5, // primary renders at 15px, measured at 10px
        measureFaceText(model.secondary.toUpperCase()) * 0.85,
      )
      const progressWidth = model.progress === undefined ? 0 : 54 + 8
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + textWidth + progressWidth)),
        height: GRID_SIZE,
      }
    }
    case 'clock':
      // Square, because a dial is: the marks sit at equal clock angles, so a
      // wide tile would crowd them at twelve and six and fling them apart at
      // the sides. Three cells leaves room for the readout inside the bezel.
      return { width: GRID_SIZE * 3, height: GRID_SIZE * 3 }
    case 'stars':
      return { width: snap(STARS_WIDTH), height: GRID_SIZE }
    case 'palette':
      return { width: snap(REST_PAD_X * 2 + model.colors.length * 18), height: GRID_SIZE }
    case 'chart':
      // The plot needs real width to be a chart rather than a decoration, and
      // the readout column claims a fixed strip down its right edge.
      return { width: snap(CHART_WIDTH + CHART_STATS_WIDTH), height: GRID_SIZE * 2 }
    case 'week':
      return { width: snap(WEEK_WIDTH), height: snap(WEEK_HEIGHT) }
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
    case 'rows': {
      let widest = 0
      for (const row of model.rows) {
        const valueWidth = row.value === undefined ? 0 : ROW_VALUE_GAP + measureFaceText(row.value)
        widest = Math.max(widest, ROW_GLYPH + measureFaceText(row.label) + valueWidth)
      }
      return {
        width: Math.min(MAX_TILE_WIDTH, snap(REST_PAD_X * 2 + widest)),
        height: snap(
          PAD_Y * 2 + model.rows.length * REST_ROW_HEIGHT + (model.overflow > 0 ? OVERFLOW_LINE : 0),
        ),
      }
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
  const model = specialModel(widget.type, data) ?? genericModel(data)
  const size = modelSize(model, widget)
  // Every face except the bare icon and the bare image stays wide enough for
  // its floating title capsule; content can exceed that, never undercut it.
  // Re-snapped after the max: the capsule floor is text-measured, and an
  // off-lattice floor would un-grid every tile whose title is its widest part.
  if (model.kind !== 'icon' && model.kind !== 'image') {
    size.width = snap(Math.max(size.width, titleCapsuleWidth(widget.title)))
  }

  const face: RestingFace = { model, size }
  faceCache.set(widget, face)
  return face
}
