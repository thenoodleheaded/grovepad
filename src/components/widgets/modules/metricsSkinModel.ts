import type { MetricsData, MetricTrend } from '../../../types/spatial'

export type MetricsSkin =
  | 'kpi_tiles'
  | 'big_number'
  | 'scoreboard'
  | 'traffic_lights'
  | 'delta'
  | 'target'
  | 'executive_strip'

export type MetricTone = 'positive' | 'negative' | 'pending' | 'neutral'

export interface DeltaState {
  previousValues: Record<string, string>
  period: string
}

export interface MetricDelta {
  value: number
  percent: number | null
  direction: MetricTrend
}

export interface TargetState {
  targets: Record<string, number>
}

export interface MetricTarget {
  target: number
  variance: number
  progress: number
  reached: boolean
}

export interface ExecutiveState {
  owners: Record<string, string>
  updatedAt: Record<string, string>
}

const METRICS_SKINS = new Set<MetricsSkin>([
  'kpi_tiles',
  'big_number',
  'scoreboard',
  'traffic_lights',
  'delta',
  'target',
  'executive_strip',
])

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function finite(raw: unknown, fallback = 0): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

function stringMap(raw: unknown, maxLength: number): Record<string, string> {
  const source = record(raw)
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, value]) =>
      typeof value === 'string' || typeof value === 'number'
        ? [[key, String(value).slice(0, maxLength)]]
        : [],
    ),
  )
}

export function metricsSkin(raw: unknown): MetricsSkin {
  return typeof raw === 'string' && METRICS_SKINS.has(raw as MetricsSkin)
    ? raw as MetricsSkin
    : 'kpi_tiles'
}

export function metricNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string' || !raw.trim()) return null
  const value = Number(raw.trim().replaceAll(',', ''))
  return Number.isFinite(value) ? value : null
}

export function metricTone(trend: MetricTrend): MetricTone {
  if (trend === 'up') return 'positive'
  if (trend === 'down') return 'negative'
  return 'pending'
}

export function metricTrendLabel(trend: MetricTrend): string {
  if (trend === 'up') return 'Rising'
  if (trend === 'down') return 'Falling'
  return 'Steady'
}

export function metricSummary(tiles: MetricsData['tiles']): {
  numericCount: number
  total: number
  positive: number
  negative: number
  flat: number
} {
  const values = tiles
    .map((tile) => metricNumber(tile.value))
    .filter((value): value is number => value !== null)
  return {
    numericCount: values.length,
    total: rounded(values.reduce((sum, value) => sum + value, 0)),
    positive: tiles.filter((tile) => tile.trend === 'up').length,
    negative: tiles.filter((tile) => tile.trend === 'down').length,
    flat: tiles.filter((tile) => tile.trend === 'flat').length,
  }
}

function defaultPreviousValue(tile: MetricsData['tiles'][number]): string {
  const current = metricNumber(tile.value)
  if (current === null) return ''
  if (tile.trend === 'flat') return String(current)
  const factor = tile.trend === 'up' ? 0.9 : 1.1
  return String(rounded(current * factor))
}

export function deltaState(raw: unknown, tiles: MetricsData['tiles']): DeltaState {
  const state = record(raw)
  const stored = stringMap(state.previousValues, 40)
  return {
    previousValues: Object.fromEntries(
      tiles.map((tile) => [tile.id, stored[tile.id] ?? defaultPreviousValue(tile)]),
    ),
    period:
      typeof state.period === 'string' && state.period.trim()
        ? state.period.trim().slice(0, 40)
        : 'Previous period',
  }
}

export function metricDelta(currentRaw: unknown, previousRaw: unknown): MetricDelta | null {
  const current = metricNumber(currentRaw)
  const previous = metricNumber(previousRaw)
  if (current === null || previous === null) return null
  const value = rounded(current - previous)
  return {
    value,
    percent: previous === 0 ? null : rounded(value / Math.abs(previous) * 100),
    direction: value > 0 ? 'up' : value < 0 ? 'down' : 'flat',
  }
}

function defaultTarget(tile: MetricsData['tiles'][number]): number {
  const current = metricNumber(tile.value) ?? 0
  if (current === 0) return 100
  if (current < 0) return 0
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(current))) - 1)
  return rounded(Math.ceil(current * 1.2 / magnitude) * magnitude)
}

export function targetState(raw: unknown, tiles: MetricsData['tiles']): TargetState {
  const state = record(raw)
  const stored = record(state.targets)
  return {
    targets: Object.fromEntries(
      tiles.map((tile) => [
        tile.id,
        Math.max(0, finite(stored[tile.id], defaultTarget(tile))),
      ]),
    ),
  }
}

export function metricTarget(currentRaw: unknown, targetRaw: unknown): MetricTarget {
  const current = metricNumber(currentRaw) ?? 0
  const target = Math.max(0, finite(targetRaw, 0))
  const variance = rounded(current - target)
  return {
    target,
    variance,
    progress: target <= 0 ? (current >= target ? 1 : 0) : Math.min(1, Math.max(0, current / target)),
    reached: current >= target,
  }
}

export function executiveState(raw: unknown, tiles: MetricsData['tiles']): ExecutiveState {
  const state = record(raw)
  const owners = stringMap(state.owners, 48)
  const storedDates = stringMap(state.updatedAt, 10)
  return {
    owners: Object.fromEntries(tiles.map((tile) => [tile.id, owners[tile.id] ?? 'Unassigned'])),
    updatedAt: Object.fromEntries(
      tiles.map((tile) => {
        const value = storedDates[tile.id] ?? ''
        return [tile.id, localDate(value) ? value : '']
      }),
    ),
  }
}

function localDate(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime())
    || date.getFullYear() !== Number(match[1])
    || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])
    ? null
    : date
}

export function freshnessLabel(raw: string, now = new Date()): string {
  const date = localDate(raw)
  if (!date) return 'Live'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return raw
}
