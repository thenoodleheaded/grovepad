import type { AtlasWidgetData } from '../../types/widgetDataExpansion'
import {
  ATLAS_CATALOG,
  ATLAS_TYPE_SET,
  atlasModeFor,
  type AtlasType,
} from '../../widgets/atlasCatalog'
import { ATLAS_COLLECTION_VISUALS, atlasSkinFor } from '../../widgets/atlasSkins'
import { fieldsFor } from '../../widgets/fields'
import {
  clampFraction,
  compact,
  finite,
  formatRestNumber,
  record,
  REST_BAR_LIMIT,
  REST_ROW_LIMIT,
  type RestingFaceModel,
  type RestRow,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Tracker (Atlas) resting faces.
//
// A Tracker card has two dimensions, and the folded tile has to answer both.
// WHICH of the fifty systems it is — a Fuel Log, a Prayer Times, a Sleep
// Ledger — comes from the type's own hero field and accent. WHAT SHAPE it is
// wearing — Object, Dial, Ledger, Trend, Schedule, Compact — decides the
// grammar. The fifty types all persist the same envelope (a headline number
// against a target, items, a reading history, named times), which is exactly
// why six shapes can serve all of them without any of them lying.
// ---------------------------------------------------------------------------

const TREND_POINTS = 24

/** The card's headline reading, computed the way the open card computes it,
 * so a folded Utility Runway says "12 days left" and not its raw meter value. */
function heroReading(type: AtlasType, data: AtlasWidgetData): { label: string; value: string } {
  const spec = ATLAS_CATALOG[type]
  const field = fieldsFor(type).find((entry) => entry.key === spec.heroField)
  const raw = field ? field.get(data as never) : data.primary
  return { label: field?.label ?? 'Progress', value: displayValue(raw) }
}

function displayValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return `${value.length} points`
  return compact(String(value ?? '—'), 18)
}

function atlasItems(raw: unknown): Array<{ id: string; label: string; value: number; done: boolean }> {
  if (!Array.isArray(raw)) return []
  const items: Array<{ id: string; label: string; value: number; done: boolean }> = []
  for (const entry of raw) {
    const item = record(entry)
    if (!item) continue
    items.push({
      id: typeof item.id === 'string' ? item.id : `item-${items.length}`,
      label: typeof item.label === 'string' ? item.label : '',
      value: finite(item.value) ?? 0,
      done: item.done === true,
    })
  }
  return items
}

/** Minutes past midnight, or null for anything that is not `HH:MM`. */
function minuteOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function scheduleRows(data: AtlasWidgetData): RestRow[] {
  const times = record(data.times) ?? {}
  const entries: Array<{ key: string; label: string; time: string; minute: number }> = []
  for (const [key, value] of Object.entries(times)) {
    if (typeof value !== 'string') continue
    const minute = minuteOf(value)
    if (minute === null) continue
    entries.push({ key, label: key, time: value, minute })
  }
  if (entries.length === 0) {
    // A window rather than a timetable: the two ends are the schedule.
    for (const [key, label] of [['timeStart', 'Opens'], ['timeEnd', 'Closes']] as const) {
      const value = data[key]
      const minute = typeof value === 'string' ? minuteOf(value) : null
      if (minute !== null) entries.push({ key, label, time: value as string, minute })
    }
  }
  entries.sort((left, right) => left.minute - right.minute)

  const now = new Date()
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  // The next one due is the row the open card lights; a day whose entries have
  // all passed lights the first, because that is tomorrow's next.
  const next = entries.find((entry) => entry.minute >= nowMinute) ?? entries[0]
  return entries.slice(0, REST_ROW_LIMIT).map((entry) => ({
    key: entry.key,
    label: compact(entry.label.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()), 18),
    value: entry.time,
    tone: entry === next ? 'accent' as const : 'muted' as const,
  }))
}

export function trackerRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const atlas = data as unknown as AtlasWidgetData
  const type = atlasModeFor(atlas)
  if (!ATLAS_TYPE_SET.has(type)) return null
  const spec = ATLAS_CATALOG[type]
  // A card in private mode hides its reading behind an abstract disc when it
  // is open; a folded tile is MORE exposed, not less — it sits on the board in
  // front of whoever is looking over your shoulder — so it must never print
  // the reading the open card is deliberately withholding.
  if (atlas.privateMode === true) {
    return { kind: 'metric', primary: '•••', secondary: compact(spec.label, 20) }
  }
  const skin = atlasSkinFor(type, atlas)
  const hero = heroReading(type, atlas)
  const target = finite(atlas.target) ?? 0
  const progress = target > 0 ? clampFraction((finite(atlas.primary) ?? 0) / target) : 0
  const items = atlasItems(atlas.items)

  if (skin === 'schedule') {
    const rows = scheduleRows(atlas)
    if (rows.length === 0) return { kind: 'metric', primary: hero.value, secondary: compact(hero.label, 20) }
    return {
      kind: 'rows',
      eyebrow: { label: compact(spec.label, 18), note: hero.value },
      rows,
      overflow: 0,
    }
  }

  if (skin === 'trend') {
    const history = Array.isArray(atlas.history) ? atlas.history : []
    const series = history
      .slice(-TREND_POINTS)
      .map((point) => finite(record(point)?.v))
      .filter((value): value is number => value !== null)
    if (series.length < 2) {
      // Not enough readings to be a line yet — the open card says the same.
      return { kind: 'metric', primary: hero.value, secondary: compact(hero.label, 20) }
    }
    const latest = series.at(-1)!
    const average = series.reduce((sum, value) => sum + value, 0) / series.length
    const peak = Math.max(...series)
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

  if (skin === 'ledger' && items.length > 0) {
    const visible = items.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: { label: compact(spec.label, 18), note: hero.value },
      rows: visible.map((item) => ({
        key: item.id,
        label: compact(item.label || 'Untitled', 24),
        done: item.done,
        value: formatRestNumber(item.value),
      })),
      overflow: Math.max(0, items.length - visible.length),
    }
  }

  if (skin === 'compact') {
    return {
      kind: 'metric',
      primary: hero.value,
      secondary: compact(hero.label, 20),
      ...(target > 0 ? { progress } : {}),
    }
  }

  // Object and Dial are both instruments. A collection card's own hero draws
  // its pieces, so folded it keeps the pieces; everything else keeps the arc.
  if (skin === 'object' && ATLAS_COLLECTION_VISUALS.has(spec.visual) && items.length > 0) {
    const visible = items.slice(0, REST_BAR_LIMIT)
    const peak = Math.max(1, ...visible.map((item) => Math.abs(item.value)))
    return {
      kind: 'bars',
      eyebrow: { label: compact(spec.label, 18), note: hero.value },
      bars: visible.map((item) => ({
        key: item.id,
        label: compact(item.label || 'Untitled', 20),
        value: formatRestNumber(item.value),
        fraction: Math.abs(item.value) / peak,
        ...(item.done ? { tone: 'good' as const } : {}),
      })),
    }
  }

  return {
    kind: 'gauge',
    progress,
    primary: hero.value,
    secondary: compact(hero.label, 20),
    ...(target > 0 ? { caption: `of ${formatRestNumber(target)}` } : {}),
  }
}
