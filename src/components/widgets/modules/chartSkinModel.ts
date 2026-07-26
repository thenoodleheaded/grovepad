import type { BarChartData } from '../../../types/spatial'

export type ChartSkin =
  | 'bar'
  | 'line'
  | 'donut'
  | 'pie'
  | 'area'
  | 'sparkline'
  | 'gauge'
  | 'progress_ring'
  | 'heatmap'
  | 'scatter'
  | 'stacked'

export interface ChartDomain {
  min: number
  max: number
  span: number
  zeroRatio: number
}

export interface PlotPoint {
  x: number
  y: number
}

export interface ScatterState {
  xValues: Record<string, number>
}

export interface GaugeState {
  min: number
  max: number
  target: number | null
}

export interface HeatmapState {
  columns: number
}

export interface StackedSeries {
  id: string
  name: string
  color: string
  values: Record<string, number>
}

export interface StackedState {
  series: StackedSeries[]
}

export const CHART_PALETTE = [
  '#38bdf8',
  '#a3e635',
  '#f472b6',
  '#fbbf24',
  '#a78bfa',
  '#2dd4bf',
  '#fb7185',
  '#60a5fa',
] as const

const CHART_SKINS = new Set<ChartSkin>([
  'bar',
  'line',
  'donut',
  'pie',
  'area',
  'sparkline',
  'gauge',
  'progress_ring',
  'heatmap',
  'scatter',
  'stacked',
])

export function chartSkin(raw: unknown): ChartSkin {
  return typeof raw === 'string' && CHART_SKINS.has(raw as ChartSkin)
    ? raw as ChartSkin
    : 'bar'
}

export function finiteChartValue(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

export function chartDomain(
  rawValues: readonly number[],
  includeZero = true,
): ChartDomain {
  const values = rawValues.map(finiteChartValue)
  let min = values.length ? Math.min(...values) : 0
  let max = values.length ? Math.max(...values) : 1
  if (includeZero) {
    min = Math.min(0, min)
    max = Math.max(0, max)
  }
  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.1)
    min -= padding
    max += padding
  }
  const span = max - min
  return {
    min,
    max,
    span,
    zeroRatio: (max - 0) / span,
  }
}

export function plotPoints(
  rawValues: readonly number[],
  width = 300,
  height = 120,
  insetX = 10,
  insetY = 10,
): PlotPoint[] {
  const values = rawValues.map(finiteChartValue)
  if (values.length === 0) return []
  const domain = chartDomain(values, false)
  const usableWidth = Math.max(0, width - insetX * 2)
  const usableHeight = Math.max(0, height - insetY * 2)
  return values.map((value, index) => ({
    x: insetX + (index / Math.max(1, values.length - 1)) * usableWidth,
    y: insetY + ((domain.max - value) / domain.span) * usableHeight,
  }))
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

export function linePath(points: readonly PlotPoint[]): string {
  return points.map(
    (point, index) => `${index === 0 ? 'M' : 'L'} ${rounded(point.x)} ${rounded(point.y)}`,
  ).join(' ')
}

export function areaPath(
  points: readonly PlotPoint[],
  baseline = 110,
): string {
  if (points.length === 0) return ''
  return `${linePath(points)} L ${rounded(points.at(-1)!.x)} ${baseline} L ${rounded(points[0]!.x)} ${baseline} Z`
}

export function chartTrend(rawValues: readonly number[]): {
  delta: number
  percent: number | null
  direction: 'up' | 'down' | 'flat'
} {
  const values = rawValues.map(finiteChartValue)
  const first = values[0] ?? 0
  const latest = values.at(-1) ?? 0
  const delta = latest - first
  return {
    delta,
    percent: first === 0 ? null : (delta / Math.abs(first)) * 100,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  }
}

export function positiveShares(
  values: readonly number[],
): Array<{ fraction: number; offset: number }> {
  const positive = values.map((value) => Math.max(0, finiteChartValue(value)))
  const total = positive.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return positive.map(() => ({ fraction: 0, offset: 0 }))
  let offset = 0
  return positive.map((value) => {
    const fraction = value / total
    const share = { fraction, offset }
    offset += fraction
    return share
  })
}

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

export function scatterState(
  raw: unknown,
  bars: readonly BarChartData['bars'][number][],
): ScatterState {
  const state = safeRecord(raw)
  const requested = safeRecord(state.xValues)
  const xValues: Record<string, number> = {}
  bars.forEach((bar, index) => {
    xValues[bar.id] = typeof requested[bar.id] === 'number' && Number.isFinite(requested[bar.id])
      ? requested[bar.id] as number
      : index + 1
  })
  return { xValues }
}

export function gaugeState(
  raw: unknown,
  values: readonly number[],
): GaugeState {
  const state = safeRecord(raw)
  const domain = chartDomain(values)
  const min = typeof state.min === 'number' && Number.isFinite(state.min)
    ? state.min
    : Math.min(0, domain.min)
  const requestedMax = typeof state.max === 'number' && Number.isFinite(state.max)
    ? state.max
    : Math.max(100, domain.max)
  const max = requestedMax > min ? requestedMax : min + 1
  const target = typeof state.target === 'number' && Number.isFinite(state.target)
    ? Math.min(max, Math.max(min, state.target))
    : null
  return { min, max, target }
}

export function heatmapState(raw: unknown): HeatmapState {
  const state = safeRecord(raw)
  const requested = typeof state.columns === 'number' && Number.isFinite(state.columns)
    ? Math.round(state.columns)
    : 7
  return { columns: Math.min(12, Math.max(3, requested)) }
}

export function stackedState(
  raw: unknown,
  bars: readonly BarChartData['bars'][number][],
): StackedState {
  const state = safeRecord(raw)
  if (!Array.isArray(state.series)) return { series: [] }
  const barIds = new Set(bars.map((bar) => bar.id))
  const seen = new Set<string>()
  const series: StackedSeries[] = []
  for (const rawSeries of state.series.slice(0, 5)) {
    const candidate = safeRecord(rawSeries)
    if (
      typeof candidate.id !== 'string' ||
      seen.has(candidate.id) ||
      typeof candidate.name !== 'string'
    ) continue
    seen.add(candidate.id)
    const rawValues = safeRecord(candidate.values)
    const values: Record<string, number> = {}
    for (const [id, value] of Object.entries(rawValues)) {
      if (barIds.has(id) && typeof value === 'number' && Number.isFinite(value)) {
        values[id] = value
      }
    }
    series.push({
      id: candidate.id,
      name: candidate.name.slice(0, 50),
      color: typeof candidate.color === 'string' && /^#[0-9a-f]{6}$/i.test(candidate.color)
        ? candidate.color
        : CHART_PALETTE[(series.length + 1) % CHART_PALETTE.length]!,
      values,
    })
  }
  return { series }
}
