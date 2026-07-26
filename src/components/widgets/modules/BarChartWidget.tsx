import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleGauge,
  Grid3X3,
  Layers3,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import { useId, useState, type CSSProperties } from 'react'
import type { BarChartData, ModuleData } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import {
  areaPath,
  chartDomain,
  chartSkin,
  chartTrend,
  CHART_PALETTE,
  finiteChartValue,
  gaugeState,
  heatmapState,
  linePath,
  plotPoints,
  positiveShares,
  scatterState,
  stackedState,
  type ChartSkin,
  type StackedState,
} from './chartSkinModel'

interface BarChartWidgetProps {
  data: BarChartData
  onChange: (data: BarChartData) => void
}

function compactNumber(value: number): string {
  const finite = finiteChartValue(value)
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(finite) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(finite) < 10 ? 1 : 0,
  }).format(finite)
}

function pieGradient(values: readonly number[], colors: readonly string[]): string {
  const shares = positiveShares(values)
  const stops = shares.flatMap((share, index) => {
    if (share.fraction <= 0) return []
    const start = share.offset * 360
    const end = (share.offset + share.fraction) * 360
    return `${colors[index]} ${start}deg ${end}deg`
  })
  return stops.length
    ? `conic-gradient(from -90deg, ${stops.join(', ')})`
    : 'conic-gradient(color-mix(in oklab, var(--gp-widget-ink, #fff), transparent 92%) 0deg 360deg)'
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') return <ArrowUpRight size={11} aria-hidden />
  if (direction === 'down') return <ArrowDownRight size={11} aria-hidden />
  return <ArrowRight size={11} aria-hidden />
}

/** One coherent Chart studio with eleven purpose-built visualizations. */
export function BarChartWidget({ data, onChange }: BarChartWidgetProps) {
  const [editorOpen, setEditorOpen] = useState(false)
  const gradientId = `gp-chart-${useId().replaceAll(':', '')}`
  const skin = chartSkin(data.mode)
  const bars = data.bars
  const values = bars.map((bar) => finiteChartValue(bar.value))
  const colors = bars.map(
    (bar, index) => bar.color ?? CHART_PALETTE[index % CHART_PALETTE.length]!,
  )
  const latest = values.at(-1) ?? 0
  const total = values.reduce((sum, value) => sum + value, 0)
  const average = values.length ? total / values.length : 0
  const maximum = values.length ? Math.max(...values) : 0
  const trend = chartTrend(values)
  const points = plotPoints(values, 320, 142, 18, 16)
  const line = linePath(points)
  const area = areaPath(points, 126)
  const scatter = scatterState(skinStateFor(data, 'scatter'), bars)
  const gauge = gaugeState(skinStateFor(data, 'gauge'), values)
  const heatmap = heatmapState(skinStateFor(data, 'heatmap'))
  const stacked = stackedState(skinStateFor(data, 'stacked'), bars)
  const suffix = data.unit ?? ''

  const baseData = (patch: Partial<BarChartData> = {}): BarChartData => ({
    ...data,
    ...patch,
    mode: skin,
  })

  const setBar = (
    id: string,
    patch: Partial<BarChartData['bars'][number]>,
  ) => {
    onChange(baseData({
      bars: bars.map((bar) => bar.id === id ? { ...bar, ...patch } : bar),
    }))
  }

  const addBar = () => {
    const index = bars.length
    onChange(baseData({
      bars: [
        ...bars,
        {
          id: crypto.randomUUID(),
          label: `Series ${index + 1}`,
          value: latest,
          color: CHART_PALETTE[index % CHART_PALETTE.length],
        },
      ],
    }))
  }

  const removeBar = (id: string) => {
    onChange(baseData({ bars: bars.filter((bar) => bar.id !== id) }))
  }

  const updateSkinState = (
    value: ChartSkin,
    state: Record<string, unknown>,
  ) => {
    onChange(dataWithSkinState(
      baseData() as ModuleData,
      value,
      state,
    ) as BarChartData)
  }

  const updateStacked = (next: StackedState) => {
    updateSkinState('stacked', { series: next.series })
  }

  const chartHeader = (
    <header className="gp-chart-heading">
      <span className="gp-chart-kicker">
        {skin === 'gauge' || skin === 'progress_ring'
          ? <CircleGauge size={12} aria-hidden />
          : skin === 'heatmap'
            ? <Grid3X3 size={12} aria-hidden />
            : skin === 'stacked'
              ? <Layers3 size={12} aria-hidden />
              : <BarChart3 size={12} aria-hidden />}
      </span>
      <span className="gp-chart-title-stack">
        <input
          value={data.title}
          aria-label="Chart title"
          placeholder="Untitled chart"
          onChange={(event) => onChange(baseData({ title: event.target.value }))}
        />
        <small>{bars.length} points · {compactNumber(total)} total</small>
      </span>
      <input
        value={suffix}
        aria-label="Chart unit"
        placeholder="unit"
        className="gp-chart-unit"
        onChange={(event) => onChange(baseData({ unit: event.target.value }))}
      />
      <button
        type="button"
        aria-label={editorOpen ? 'Close chart data editor' : 'Edit chart data'}
        aria-expanded={editorOpen}
        className="gp-chart-edit-trigger"
        onClick={() => setEditorOpen((open) => !open)}
      >
        {editorOpen ? <X size={12} aria-hidden /> : <Settings2 size={12} aria-hidden />}
      </button>
    </header>
  )

  let visualization: React.ReactNode

  if (bars.length === 0) {
    visualization = (
      <div className="gp-chart-empty">
        <BarChart3 size={24} aria-hidden />
        <strong>Start your series</strong>
        <span>Add a point to draw this chart.</span>
        <button type="button" onClick={addBar}><Plus size={11} aria-hidden /> Add point</button>
      </div>
    )
  } else if (skin === 'line' || skin === 'area') {
    visualization = (
      <div className={`gp-chart-plot gp-chart-${skin}`}>
        <svg viewBox="0 0 320 142" preserveAspectRatio="none" role="img" aria-label={`${skin === 'area' ? 'Area' : 'Line'} chart`}>
          <defs>
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gp-widget-accent)" stopOpacity="0.48" />
              <stop offset="100%" stopColor="var(--gp-widget-accent)" stopOpacity="0.02" />
            </linearGradient>
            <filter id={`${gradientId}-glow`}>
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g className="gp-chart-grid-lines" aria-hidden>
            {[24, 58, 92, 126].map((y) => <line key={y} x1="12" x2="308" y1={y} y2={y} />)}
          </g>
          {skin === 'area' && <path className="gp-chart-area-fill" d={area} fill={`url(#${gradientId}-area)`} />}
          <path className="gp-chart-line-path" d={line} filter={`url(#${gradientId}-glow)`} />
          {points.map((point, index) => (
            <circle
              key={bars[index]!.id}
              className="gp-chart-line-point"
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? 4 : 2.6}
            >
              <title>{`${bars[index]!.label}: ${compactNumber(values[index]!)}${suffix}`}</title>
            </circle>
          ))}
        </svg>
        <div className="gp-chart-axis-labels">
          {bars.map((bar) => <span key={bar.id}>{bar.label || '—'}</span>)}
        </div>
        <footer className="gp-chart-stats">
          <span><small>Latest</small><strong>{compactNumber(latest)}{suffix}</strong></span>
          <span><small>Average</small><strong>{compactNumber(average)}{suffix}</strong></span>
          <span data-trend={trend.direction}><small>Trend</small><strong><TrendIcon direction={trend.direction} />{compactNumber(Math.abs(trend.delta))}</strong></span>
        </footer>
      </div>
    )
  } else if (skin === 'donut' || skin === 'pie') {
    const largestIndex = values.reduce(
      (best, value, index) => value > (values[best] ?? Number.NEGATIVE_INFINITY) ? index : best,
      0,
    )
    const positiveTotal = values.reduce((sum, value) => sum + Math.max(0, value), 0)
    visualization = (
      <div className={`gp-chart-share gp-chart-${skin}`}>
        <div className="gp-chart-disc-wrap">
          <div
            className="gp-chart-disc"
            style={{ background: pieGradient(values, colors) }}
          >
            {skin === 'donut' && (
              <span className="gp-chart-donut-core">
                <small>Total</small>
                <strong>{compactNumber(positiveTotal)}</strong>
                <i>{suffix}</i>
              </span>
            )}
          </div>
          {skin === 'pie' && (
            <span className="gp-chart-pie-caption">
              <small>Largest</small>
              <strong>{bars[largestIndex]?.label || '—'}</strong>
            </span>
          )}
        </div>
        <div className="gp-chart-legend">
          {bars.map((bar, index) => {
            const share = positiveTotal > 0 ? Math.max(0, values[index]!) / positiveTotal * 100 : 0
            return (
              <span key={bar.id}>
                <i style={{ background: colors[index] }} />
                <b>{bar.label || `Point ${index + 1}`}</b>
                <small>{share.toFixed(share >= 10 ? 0 : 1)}%</small>
              </span>
            )
          })}
        </div>
      </div>
    )
  } else if (skin === 'sparkline') {
    visualization = (
      <div className="gp-chart-sparkline">
        <div className="gp-chart-spark-hero">
          <span>
            <small>Latest reading</small>
            <strong>{compactNumber(latest)}<i>{suffix}</i></strong>
          </span>
          <span data-trend={trend.direction}>
            <TrendIcon direction={trend.direction} />
            {trend.percent === null ? compactNumber(trend.delta) : `${Math.abs(trend.percent).toFixed(1)}%`}
          </span>
        </div>
        <svg viewBox="0 0 320 122" preserveAspectRatio="none" role="img" aria-label="Sparkline chart">
          <defs>
            <linearGradient id={`${gradientId}-spark`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gp-widget-accent)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--gp-widget-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath(plotPoints(values, 320, 122, 5, 8), 122)} fill={`url(#${gradientId}-spark)`} />
          <path d={linePath(plotPoints(values, 320, 122, 5, 8))} className="gp-chart-spark-path" />
        </svg>
        <div className="gp-chart-spark-labels">
          <span>{bars[0]?.label || 'Start'}</span>
          <span>{bars.at(-1)?.label || 'Now'}</span>
        </div>
      </div>
    )
  } else if (skin === 'gauge') {
    const ratio = Math.min(1, Math.max(0, (latest - gauge.min) / (gauge.max - gauge.min)))
    const targetRatio = gauge.target === null
      ? null
      : (gauge.target - gauge.min) / (gauge.max - gauge.min)
    visualization = (
      <div className="gp-chart-gauge">
        <svg viewBox="0 0 260 145" role="img" aria-label="Gauge chart">
          <defs>
            <linearGradient id={`${gradientId}-gauge`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="color-mix(in oklab, var(--gp-widget-accent), #2dd4bf 35%)" />
              <stop offset="100%" stopColor="var(--gp-widget-accent)" />
            </linearGradient>
          </defs>
          <path className="gp-chart-gauge-track" d="M 35 118 A 95 95 0 0 1 225 118" pathLength="100" />
          <path
            className="gp-chart-gauge-value"
            d="M 35 118 A 95 95 0 0 1 225 118"
            pathLength="100"
            stroke={`url(#${gradientId}-gauge)`}
            strokeDasharray={`${ratio * 100} 100`}
          />
          {targetRatio !== null && (
            <g
              className="gp-chart-gauge-target"
              transform={`rotate(${targetRatio * 180 - 90} 130 118)`}
            >
              <line x1="130" y1="17" x2="130" y2="30" />
            </g>
          )}
        </svg>
        <span className="gp-chart-gauge-readout">
          <small>Current</small>
          <strong>{compactNumber(latest)}<i>{suffix}</i></strong>
        </span>
        <footer>
          <span>{compactNumber(gauge.min)}</span>
          {gauge.target !== null && <span>Target {compactNumber(gauge.target)}</span>}
          <span>{compactNumber(gauge.max)}</span>
        </footer>
      </div>
    )
  } else if (skin === 'progress_ring') {
    const progress = Math.min(100, Math.max(0, latest))
    visualization = (
      <div className="gp-chart-progress">
        <div className="gp-chart-progress-ring">
          <svg viewBox="0 0 150 150" role="img" aria-label={`${progress}% progress`}>
            <circle className="gp-chart-progress-track" cx="75" cy="75" r="61" pathLength="100" />
            <circle
              className="gp-chart-progress-value"
              cx="75"
              cy="75"
              r="61"
              pathLength="100"
              strokeDasharray={`${progress} 100`}
            />
          </svg>
          <span>
            <strong>{compactNumber(progress)}%</strong>
            <small>complete</small>
          </span>
        </div>
        <div className="gp-chart-progress-copy">
          <small>{bars.at(-1)?.label || 'Latest point'}</small>
          <strong>{progress >= 100 ? 'Goal reached' : `${compactNumber(100 - progress)}% to go`}</strong>
          <div><i style={{ width: `${progress}%` }} /></div>
          <span data-trend={trend.direction}><TrendIcon direction={trend.direction} /> {compactNumber(Math.abs(trend.delta))} since start</span>
        </div>
      </div>
    )
  } else if (skin === 'heatmap') {
    const magnitude = Math.max(1, ...values.map(Math.abs))
    visualization = (
      <div className="gp-chart-heatmap">
        <div
          className="gp-chart-heat-grid"
          style={{
            '--gp-chart-columns': Math.min(
              heatmap.columns,
              Math.max(3, bars.length),
            ),
          } as CSSProperties}
        >
          {bars.map((bar, index) => {
            const level = Math.max(0.1, Math.abs(values[index]!) / magnitude)
            return (
              <button
                key={bar.id}
                type="button"
                aria-label={`${bar.label}: ${compactNumber(values[index]!)}${suffix}`}
                title={`${bar.label}: ${compactNumber(values[index]!)}${suffix}`}
                style={{
                  '--gp-heat-color': colors[index],
                  '--gp-heat-opacity': 0.14 + level * 0.68,
                } as CSSProperties}
                onClick={() => setBar(bar.id, { value: values[index]! + 1 })}
              >
                <span>{bar.label || index + 1}</span>
                <strong>{compactNumber(values[index]!)}</strong>
              </button>
            )
          })}
        </div>
        <footer className="gp-chart-heat-footer">
          <span>Lower</span><i /><i /><i /><i /><span>Higher</span>
          <small>Tap a cell to add one</small>
        </footer>
      </div>
    )
  } else if (skin === 'scatter') {
    const xValues = bars.map((bar) => scatter.xValues[bar.id] ?? 0)
    const xDomain = chartDomain(xValues, false)
    const yDomain = chartDomain(values, false)
    const scatterPoints = bars.map((bar, index) => ({
      bar,
      value: values[index]!,
      color: colors[index]!,
      x: 22 + ((xValues[index]! - xDomain.min) / xDomain.span) * 276,
      y: 126 - ((values[index]! - yDomain.min) / yDomain.span) * 104,
    }))
    visualization = (
      <div className="gp-chart-scatter">
        <svg viewBox="0 0 320 148" preserveAspectRatio="none" role="img" aria-label="Scatter plot">
          <g className="gp-chart-grid-lines" aria-hidden>
            {[22, 56, 91, 126].map((y) => <line key={y} x1="22" x2="298" y1={y} y2={y} />)}
            {[22, 91, 160, 229, 298].map((x) => <line key={x} x1={x} x2={x} y1="18" y2="130" />)}
          </g>
          {scatterPoints.map((point) => (
            <g key={point.bar.id} className="gp-chart-scatter-point">
              <circle cx={point.x} cy={point.y} r="7" fill={point.color} />
              <circle cx={point.x} cy={point.y} r="12" fill="transparent" stroke={point.color} />
              <title>{`${point.bar.label}: x ${compactNumber(scatter.xValues[point.bar.id]!)}, y ${compactNumber(point.value)}`}</title>
            </g>
          ))}
        </svg>
        <footer>
          <span>X {compactNumber(xDomain.min)} – {compactNumber(xDomain.max)}</span>
          <span>{bars.length} observations</span>
          <span>Y {compactNumber(yDomain.min)} – {compactNumber(yDomain.max)}</span>
        </footer>
      </div>
    )
  } else if (skin === 'stacked') {
    const allSeries = [
      {
        id: 'primary',
        name: data.title || 'Primary',
        color: 'var(--gp-widget-accent)',
        values: Object.fromEntries(bars.map((bar) => [bar.id, Math.max(0, finiteChartValue(bar.value))])),
      },
      ...stacked.series,
    ]
    visualization = (
      <div className="gp-chart-stacked">
        <div className="gp-chart-stacked-legend">
          {allSeries.map((series) => (
            <span key={series.id}><i style={{ background: series.color }} />{series.name}</span>
          ))}
        </div>
        <div className="gp-chart-stacked-rows">
          {bars.map((bar) => {
            const rowTotal = allSeries.reduce(
              (sum, series) => sum + Math.max(0, finiteChartValue(series.values[bar.id])),
              0,
            )
            return (
              <div key={bar.id} className="gp-chart-stacked-row">
                <span>{bar.label || 'Untitled'}</span>
                <div>
                  {allSeries.map((series) => {
                    const value = Math.max(0, finiteChartValue(series.values[bar.id]))
                    return (
                      <i
                        key={series.id}
                        title={`${series.name}: ${compactNumber(value)}`}
                        style={{
                          width: `${rowTotal > 0 ? value / rowTotal * 100 : 0}%`,
                          background: series.color,
                        }}
                      />
                    )
                  })}
                </div>
                <strong>{compactNumber(rowTotal)}{suffix}</strong>
              </div>
            )
          })}
        </div>
        <footer>
          <span>{allSeries.length} series</span>
          <strong>{compactNumber(bars.reduce(
            (grand, bar) => grand + allSeries.reduce(
              (sum, series) => sum + Math.max(0, finiteChartValue(series.values[bar.id])),
              0,
            ),
            0,
          ))}{suffix} combined</strong>
        </footer>
      </div>
    )
  } else {
    const domain = chartDomain(values)
    const zeroY = domain.zeroRatio * 100
    visualization = (
      <div className="gp-chart-bars">
        <div className="gp-chart-bar-stage">
          <i className="gp-chart-zero-line" style={{ top: `${zeroY}%` }} />
          {bars.map((bar, index) => {
            const value = values[index]!
            const valueRatio = Math.abs(value) / domain.span * 100
            return (
              <div key={bar.id} className="gp-chart-bar-slot">
                <span
                  className="gp-chart-bar-value"
                  style={{
                    bottom: value >= 0 ? `${100 - zeroY}%` : 'auto',
                    top: value < 0 ? `${zeroY}%` : 'auto',
                    height: `${Math.max(1.5, valueRatio)}%`,
                    '--gp-bar-color': colors[index],
                  } as CSSProperties}
                >
                  <strong>{compactNumber(value)}</strong>
                </span>
                <small>{bar.label || `Point ${index + 1}`}</small>
              </div>
            )
          })}
        </div>
        <footer className="gp-chart-stats">
          <span><small>Total</small><strong>{compactNumber(total)}{suffix}</strong></span>
          <span><small>Average</small><strong>{compactNumber(average)}{suffix}</strong></span>
          <span><small>Peak</small><strong>{compactNumber(maximum)}{suffix}</strong></span>
        </footer>
      </div>
    )
  }

  const editor = editorOpen && (
    <section className="gp-chart-editor" aria-label="Chart data editor">
      <header>
        <span>
          <strong>Series data</strong>
          <small>Every skin reads these same points</small>
        </span>
        <button type="button" aria-label="Close chart data editor" onClick={() => setEditorOpen(false)}>
          <X size={12} aria-hidden />
        </button>
      </header>

      {(skin === 'gauge' || skin === 'heatmap') && (
        <div className="gp-chart-special-settings">
          {skin === 'gauge' ? (
            <>
              <label>Min<input type="number" value={gauge.min} onChange={(event) => updateSkinState('gauge', { ...gauge, min: Number(event.target.value) })} /></label>
              <label>Max<input type="number" value={gauge.max} onChange={(event) => updateSkinState('gauge', { ...gauge, max: Number(event.target.value) })} /></label>
              <label>Target<input type="number" value={gauge.target ?? ''} placeholder="—" onChange={(event) => updateSkinState('gauge', { ...gauge, target: event.target.value === '' ? null : Number(event.target.value) })} /></label>
            </>
          ) : (
            <label>Columns<input type="number" min={3} max={12} value={heatmap.columns} onChange={(event) => updateSkinState('heatmap', { columns: Number(event.target.value) })} /></label>
          )}
        </div>
      )}

      <div className="gp-chart-editor-list" data-floor-overflow="scroll">
        {bars.map((bar, index) => (
          <div key={bar.id} className="gp-chart-editor-row">
            <input
              type="color"
              aria-label={`${bar.label || `Point ${index + 1}`} color`}
              value={colors[index]}
              onChange={(event) => setBar(bar.id, { color: event.target.value })}
            />
            <input
              aria-label={`Point ${index + 1} label`}
              value={bar.label}
              placeholder={`Point ${index + 1}`}
              onChange={(event) => setBar(bar.id, { label: event.target.value })}
            />
            {skin === 'scatter' && (
              <label>
                <span>X</span>
                <input
                  type="number"
                  aria-label={`${bar.label || `Point ${index + 1}`} X value`}
                  value={scatter.xValues[bar.id]}
                  onChange={(event) => updateSkinState('scatter', {
                    xValues: {
                      ...scatter.xValues,
                      [bar.id]: Number(event.target.value),
                    },
                  })}
                />
              </label>
            )}
            <label>
              <span>{skin === 'scatter' ? 'Y' : 'Value'}</span>
              <input
                type="number"
                aria-label={`${bar.label || `Point ${index + 1}`} value`}
                value={bar.value}
                onChange={(event) => setBar(bar.id, { value: Number(event.target.value) })}
              />
            </label>
            <button type="button" aria-label={`Remove ${bar.label || `point ${index + 1}`}`} onClick={() => removeBar(bar.id)}>
              <Trash2 size={10} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      {skin === 'stacked' && (
        <div className="gp-chart-stack-editor">
          <header>
            <span>Additional series</span>
            <button
              type="button"
              disabled={stacked.series.length >= 5}
              onClick={() => {
                const index = stacked.series.length
                updateStacked({
                  series: [
                    ...stacked.series,
                    {
                      id: crypto.randomUUID(),
                      name: `Series ${index + 2}`,
                      color: CHART_PALETTE[(index + 1) % CHART_PALETTE.length]!,
                      values: Object.fromEntries(bars.map((bar) => [bar.id, 0])),
                    },
                  ],
                })
              }}
            >
              <Plus size={10} aria-hidden /> Series
            </button>
          </header>
          {stacked.series.map((series) => (
            <div key={series.id} className="gp-chart-stack-series">
              <input
                type="color"
                aria-label={`${series.name} color`}
                value={series.color}
                onChange={(event) => updateStacked({
                  series: stacked.series.map((item) => item.id === series.id
                    ? { ...item, color: event.target.value }
                    : item),
                })}
              />
              <input
                aria-label="Stacked series name"
                value={series.name}
                onChange={(event) => updateStacked({
                  series: stacked.series.map((item) => item.id === series.id
                    ? { ...item, name: event.target.value }
                    : item),
                })}
              />
              {bars.map((bar, index) => (
                <label key={bar.id} title={bar.label || `Point ${index + 1}`}>
                  <span>{(bar.label || String(index + 1)).slice(0, 2)}</span>
                  <input
                    type="number"
                    aria-label={`${series.name} ${bar.label || `point ${index + 1}`} value`}
                    value={series.values[bar.id] ?? 0}
                    onChange={(event) => updateStacked({
                      series: stacked.series.map((item) => item.id === series.id
                        ? {
                            ...item,
                            values: { ...item.values, [bar.id]: Number(event.target.value) },
                          }
                        : item),
                    })}
                  />
                </label>
              ))}
              <button
                type="button"
                aria-label={`Remove ${series.name}`}
                onClick={() => updateStacked({
                  series: stacked.series.filter((item) => item.id !== series.id),
                })}
              >
                <Trash2 size={10} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="gp-chart-add-point" onClick={addBar}>
        <Plus size={11} aria-hidden /> Add point
      </button>
    </section>
  )

  return (
    <div
      className="gp-chart-skin"
      data-chart-skin={skin}
      data-floor-overflow="scroll"
      data-floor-min-w="300"
      data-floor-min-h="240"
    >
      {chartHeader}
      <main className="gp-chart-canvas">
        {visualization}
      </main>
      {editor}
    </div>
  )
}
