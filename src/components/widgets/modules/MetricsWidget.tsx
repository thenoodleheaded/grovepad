import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  ChartNoAxesColumn,
  CircleDot,
  Diff,
  Gauge,
  Maximize2,
  Plus,
  Settings2,
  Target,
  Trophy,
  X,
} from 'lucide-react'
import type { MetricsData, MetricTrend } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import {
  deltaState,
  executiveState,
  freshnessLabel,
  metricDelta,
  metricSummary,
  metricTarget,
  metricTone,
  metricTrendLabel,
  metricsSkin,
  targetState,
  type DeltaState,
  type ExecutiveState,
  type MetricsSkin,
  type TargetState,
} from './metricsSkinModel'

interface MetricsWidgetProps {
  data: MetricsData
  skin?: MetricsSkin
  onChange: (data: MetricsData) => void
}

type MetricTile = MetricsData['tiles'][number]

const NEXT_TREND: Record<MetricTrend, MetricTrend> = {
  up: 'flat',
  flat: 'down',
  down: 'up',
}

const SKIN_META = {
  kpi_tiles: { label: 'KPI tiles', icon: ChartNoAxesColumn },
  big_number: { label: 'Big number', icon: Maximize2 },
  scoreboard: { label: 'Scoreboard', icon: Trophy },
  traffic_lights: { label: 'Traffic lights', icon: CircleDot },
  delta: { label: 'Delta', icon: Diff },
  target: { label: 'Targets', icon: Target },
  executive_strip: { label: 'Executive strip', icon: BriefcaseBusiness },
} as const

function TrendIcon({ trend, size = 11 }: { trend: MetricTrend; size?: number }) {
  if (trend === 'up') return <ArrowUpRight size={size} aria-hidden="true" />
  if (trend === 'down') return <ArrowDownRight size={size} aria-hidden="true" />
  return <ArrowRight size={size} aria-hidden="true" />
}

function displayValue(tile: MetricTile): string {
  return `${tile.value || '—'}${tile.unit}`
}

function todayKey(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Seven purpose-built KPI views over one shared, circuit-writable tile collection. */
export function MetricsWidget({ data, skin: rawSkin, onChange }: MetricsWidgetProps) {
  const skin = metricsSkin(rawSkin ?? data.skin)
  const [studioOpen, setStudioOpen] = useState(false)
  const summary = metricSummary(data.tiles)
  const MetaIcon = SKIN_META[skin].icon

  const setTile = (id: string, patch: Partial<MetricTile>) =>
    onChange({
      ...data,
      tiles: data.tiles.map((tile) => (tile.id === id ? { ...tile, ...patch } : tile)),
    })

  const removeTile = (id: string) =>
    onChange({ ...data, tiles: data.tiles.filter((tile) => tile.id !== id) })

  const addTile = () =>
    onChange({
      ...data,
      tiles: [
        ...data.tiles,
        {
          id: globalThis.crypto?.randomUUID?.() ?? `metric-${Date.now()}`,
          label: '',
          value: '0',
          unit: '',
          trend: 'flat',
        },
      ],
    })

  const updateSkinState = (value: MetricsSkin, state: object) =>
    onChange(
      dataWithSkinState(data, value, state as Record<string, unknown>) as MetricsData,
    )

  return (
    <div
      data-floor-panel="rows"
      data-floor-overflow="scroll"
      data-metrics-skin={skin}
      className="gp-metrics-skin"
    >
      <header className="gp-metrics-heading">
        <span className="gp-metrics-kicker" aria-hidden="true"><MetaIcon size={13} /></span>
        <span className="gp-metrics-title-stack">
          <strong>{SKIN_META[skin].label}</strong>
          <small>{data.tiles.length} {data.tiles.length === 1 ? 'metric' : 'metrics'} · {summary.positive} rising · {summary.negative} falling</small>
        </span>
        <span className="gp-metrics-health" data-tone={summary.negative > summary.positive ? 'negative' : summary.positive ? 'positive' : 'pending'}>
          <i />
          {summary.negative > summary.positive ? 'Needs attention' : summary.positive ? 'Healthy' : 'Steady'}
        </span>
        <button
          type="button"
          className="gp-metrics-studio-trigger"
          aria-label="Edit metrics"
          aria-expanded={studioOpen}
          onClick={() => setStudioOpen((open) => !open)}
        >
          <Settings2 size={13} />
        </button>
      </header>

      <main className="gp-metrics-workspace">
        {data.tiles.length === 0 ? (
          <MetricsEmpty onAdd={addTile} />
        ) : (
          <>
            {skin === 'kpi_tiles' && (
              <KpiTiles tiles={data.tiles} setTile={setTile} />
            )}
            {skin === 'big_number' && (
              <BigNumber tiles={data.tiles} setTile={setTile} summary={summary} />
            )}
            {skin === 'scoreboard' && (
              <Scoreboard tiles={data.tiles} setTile={setTile} />
            )}
            {skin === 'traffic_lights' && (
              <TrafficLights tiles={data.tiles} setTile={setTile} />
            )}
            {skin === 'delta' && (
              <DeltaView
                tiles={data.tiles}
                state={deltaState(skinStateFor(data, 'delta'), data.tiles)}
                updateState={(state) => updateSkinState('delta', state)}
              />
            )}
            {skin === 'target' && (
              <TargetView
                tiles={data.tiles}
                state={targetState(skinStateFor(data, 'target'), data.tiles)}
                updateState={(state) => updateSkinState('target', state)}
              />
            )}
            {skin === 'executive_strip' && (
              <ExecutiveStrip
                tiles={data.tiles}
                state={executiveState(skinStateFor(data, 'executive_strip'), data.tiles)}
                updateState={(state) => updateSkinState('executive_strip', state)}
              />
            )}
          </>
        )}
      </main>

      <footer className="gp-metrics-footer">
        <button type="button" onClick={addTile}><Plus size={10} /> Metric</button>
        <span>{summary.numericCount} numeric · total {summary.total.toLocaleString()}</span>
      </footer>

      {studioOpen && (
        <MetricsStudio
          tiles={data.tiles}
          setTile={setTile}
          removeTile={removeTile}
          addTile={addTile}
          onClose={() => setStudioOpen(false)}
        />
      )}
    </div>
  )
}

interface ReadViewProps {
  tiles: MetricTile[]
  setTile: (id: string, patch: Partial<MetricTile>) => void
}

function TrendButton({ tile, setTile, compact = false }: {
  tile: MetricTile
  setTile: ReadViewProps['setTile']
  compact?: boolean
}) {
  return (
    <button
      type="button"
      className="gp-metrics-trend"
      data-tone={metricTone(tile.trend)}
      data-compact={compact || undefined}
      aria-label={`${tile.label || 'Metric'} trend: ${tile.trend}`}
      title="Cycle trend"
      onClick={() => setTile(tile.id, { trend: NEXT_TREND[tile.trend] })}
    >
      <TrendIcon trend={tile.trend} size={compact ? 9 : 11} />
      <span>{metricTrendLabel(tile.trend)}</span>
    </button>
  )
}

function KpiTiles({ tiles, setTile }: ReadViewProps) {
  return (
    <div className="gp-metrics-kpi-grid gp-metrics-scroll">
      {tiles.map((tile, index) => (
        <article key={tile.id} data-tone={metricTone(tile.trend)}>
          <header><span>{String(index + 1).padStart(2, '0')}</span><i /></header>
          <strong>{tile.value || '—'}<small>{tile.unit}</small></strong>
          <p>{tile.label || 'Untitled metric'}</p>
          <TrendButton tile={tile} setTile={setTile} compact />
        </article>
      ))}
    </div>
  )
}

function BigNumber({ tiles, setTile, summary }: ReadViewProps & {
  summary: ReturnType<typeof metricSummary>
}) {
  const primary = tiles[0]!
  return (
    <div className="gp-metrics-big-number">
      <section data-tone={metricTone(primary.trend)}>
        <span className="gp-metrics-eyebrow">{primary.label || 'Primary metric'}</span>
        <strong>{primary.value || '—'}<small>{primary.unit}</small></strong>
        <TrendButton tile={primary} setTile={setTile} />
        <div>
          <span><small>Portfolio total</small><b>{summary.total.toLocaleString()}</b></span>
          <span><small>Signals up</small><b>{summary.positive}</b></span>
          <span><small>Watching</small><b>{summary.negative + summary.flat}</b></span>
        </div>
      </section>
      {tiles.length > 1 && (
        <aside className="gp-metrics-big-support gp-metrics-scroll">
          {tiles.slice(1).map((tile) => (
            <article key={tile.id} data-tone={metricTone(tile.trend)}>
              <i />
              <span><small>{tile.label || 'Metric'}</small><strong>{displayValue(tile)}</strong></span>
              <TrendIcon trend={tile.trend} size={12} />
            </article>
          ))}
        </aside>
      )}
    </div>
  )
}

function Scoreboard({ tiles, setTile }: ReadViewProps) {
  const leaders = tiles.slice(0, 2)
  return (
    <div className="gp-metrics-scoreboard">
      <div className="gp-metrics-score-stage">
        {leaders.map((tile, index) => (
          <section key={tile.id} data-tone={metricTone(tile.trend)}>
            <header><span>{index === 0 ? 'A' : 'B'}</span><p>{tile.label || `Metric ${index + 1}`}</p></header>
            <strong>{tile.value || '—'}<small>{tile.unit}</small></strong>
            <TrendButton tile={tile} setTile={setTile} compact />
          </section>
        ))}
        {leaders.length === 1 && (
          <section data-empty><Plus size={16} /><span>Add a second metric to compare</span></section>
        )}
      </div>
      {tiles.length > 2 && (
        <div className="gp-metrics-score-ticker gp-metrics-scroll">
          {tiles.slice(2).map((tile, index) => (
            <span key={tile.id} data-tone={metricTone(tile.trend)}>
              <small>{index + 3}</small><b>{tile.label || 'Metric'}</b><strong>{displayValue(tile)}</strong>
              <TrendIcon trend={tile.trend} size={9} />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function TrafficLights({ tiles, setTile }: ReadViewProps) {
  return (
    <div className="gp-metrics-lights gp-metrics-scroll">
      {tiles.map((tile, index) => {
        const tone = metricTone(tile.trend)
        return (
          <article key={tile.id} data-tone={tone}>
            <span className="gp-metrics-signal" aria-label={`${tile.label || 'Metric'}: ${metricTrendLabel(tile.trend)}`}>
              <i data-light="negative" />
              <i data-light="pending" />
              <i data-light="positive" />
            </span>
            <span className="gp-metrics-light-copy">
              <small>{String(index + 1).padStart(2, '0')} · {metricTrendLabel(tile.trend)}</small>
              <strong>{tile.label || 'Untitled metric'}</strong>
            </span>
            <b>{tile.value || '—'}<small>{tile.unit}</small></b>
            <TrendButton tile={tile} setTile={setTile} compact />
          </article>
        )
      })}
    </div>
  )
}

interface DeltaViewProps {
  tiles: MetricTile[]
  state: DeltaState
  updateState: (state: DeltaState) => void
}

function DeltaView({ tiles, state, updateState }: DeltaViewProps) {
  const setPrevious = (id: string, value: string) =>
    updateState({ ...state, previousValues: { ...state.previousValues, [id]: value } })
  return (
    <div className="gp-metrics-delta">
      <header>
        <span>Compare against</span>
        <input
          value={state.period}
          aria-label="Delta comparison period"
          onChange={(event) => updateState({ ...state, period: event.target.value })}
        />
        <small>Current</small><small>Change</small>
      </header>
      <div className="gp-metrics-delta-list gp-metrics-scroll">
        {tiles.map((tile, index) => {
          const delta = metricDelta(tile.value, state.previousValues[tile.id])
          const tone = delta ? metricTone(delta.direction) : 'neutral'
          return (
            <article key={tile.id} data-tone={tone}>
              <span className="gp-metrics-delta-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="gp-metrics-delta-name"><strong>{tile.label || 'Metric'}</strong><small>{state.period}</small></span>
              <label>
                <span>Previous</span>
                <input
                  value={state.previousValues[tile.id] ?? ''}
                  inputMode="decimal"
                  aria-label={`${tile.label || 'Metric'} previous value`}
                  onChange={(event) => setPrevious(tile.id, event.target.value)}
                />
              </label>
              <b>{displayValue(tile)}</b>
              <span className="gp-metrics-delta-value">
                <TrendIcon trend={delta?.direction ?? 'flat'} size={11} />
                <strong>{delta ? `${delta.value > 0 ? '+' : ''}${delta.value.toLocaleString()}` : '—'}</strong>
                <small>{delta?.percent === null || !delta ? '—' : `${delta.percent > 0 ? '+' : ''}${delta.percent}%`}</small>
              </span>
            </article>
          )
        })}
      </div>
    </div>
  )
}

interface TargetViewProps {
  tiles: MetricTile[]
  state: TargetState
  updateState: (state: TargetState) => void
}

function TargetView({ tiles, state, updateState }: TargetViewProps) {
  const setTarget = (id: string, value: number) =>
    updateState({ targets: { ...state.targets, [id]: value } })
  return (
    <div className="gp-metrics-targets gp-metrics-scroll">
      {tiles.map((tile, index) => {
        const result = metricTarget(tile.value, state.targets[tile.id])
        return (
          <article key={tile.id} data-reached={result.reached || undefined}>
            <header>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{tile.label || 'Untitled metric'}</strong>
              <b>{Math.round(result.progress * 100)}%</b>
            </header>
            <div className="gp-metrics-target-values">
              <span><small>Current</small><strong>{displayValue(tile)}</strong></span>
              <ArrowRight size={11} />
              <label><small>Target</small><input
                type="number"
                value={result.target}
                aria-label={`${tile.label || 'Metric'} target`}
                onChange={(event) => setTarget(tile.id, Number(event.target.value))}
              /><i>{tile.unit}</i></label>
              <span data-variance={result.variance >= 0 ? 'positive' : 'negative'}>
                <small>Variance</small>
                <strong>{result.variance > 0 ? '+' : ''}{result.variance.toLocaleString()}</strong>
              </span>
            </div>
            <i className="gp-metrics-target-track"><b style={{ width: `${result.progress * 100}%` }} /></i>
          </article>
        )
      })}
    </div>
  )
}

interface ExecutiveStripProps {
  tiles: MetricTile[]
  state: ExecutiveState
  updateState: (state: ExecutiveState) => void
}

function ExecutiveStrip({ tiles, state, updateState }: ExecutiveStripProps) {
  const setOwner = (id: string, owner: string) =>
    updateState({ ...state, owners: { ...state.owners, [id]: owner } })
  const setUpdated = (id: string, updatedAt: string) =>
    updateState({ ...state, updatedAt: { ...state.updatedAt, [id]: updatedAt } })
  return (
    <div className="gp-metrics-executive">
      <header><span>KPI</span><span>Reading</span><span>Signal</span><span>Owner</span><span>Freshness</span></header>
      <div className="gp-metrics-executive-list gp-metrics-scroll">
        {tiles.map((tile, index) => (
          <article key={tile.id} data-tone={metricTone(tile.trend)}>
            <span className="gp-metrics-exec-name"><i /><small>{String(index + 1).padStart(2, '0')}</small><strong>{tile.label || 'Metric'}</strong></span>
            <b>{displayValue(tile)}</b>
            <span className="gp-metrics-exec-signal"><TrendIcon trend={tile.trend} size={10} />{metricTrendLabel(tile.trend)}</span>
            <input
              value={state.owners[tile.id] ?? ''}
              aria-label={`${tile.label || 'Metric'} owner`}
              placeholder="Owner"
              onChange={(event) => setOwner(tile.id, event.target.value)}
            />
            <label>
              <input
                type="date"
                value={state.updatedAt[tile.id] ?? ''}
                aria-label={`${tile.label || 'Metric'} freshness date`}
                onChange={(event) => setUpdated(tile.id, event.target.value)}
              />
              <button type="button" onClick={() => setUpdated(tile.id, todayKey())}>
                {freshnessLabel(state.updatedAt[tile.id] ?? '')}
              </button>
            </label>
          </article>
        ))}
      </div>
    </div>
  )
}

function MetricsEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="gp-metrics-empty">
      <Gauge size={20} />
      <strong>No readings yet</strong>
      <span>Add the first KPI to begin monitoring.</span>
      <button type="button" onClick={onAdd}><Plus size={10} /> Add metric</button>
    </div>
  )
}

interface MetricsStudioProps {
  tiles: MetricTile[]
  setTile: ReadViewProps['setTile']
  removeTile: (id: string) => void
  addTile: () => void
  onClose: () => void
}

function MetricsStudio({
  tiles,
  setTile,
  removeTile,
  addTile,
  onClose,
}: MetricsStudioProps) {
  return (
    <div className="gp-metrics-studio" role="dialog" aria-label="Metrics studio">
      <header>
        <span><BarChart3 size={13} /></span>
        <div><strong>Metrics studio</strong><small>Edit the readings shared by every view</small></div>
        <button type="button" aria-label="Close metrics studio" onClick={onClose}><X size={12} /></button>
      </header>
      <div className="gp-metrics-studio-list gp-metrics-scroll">
        {tiles.map((tile, index) => (
          <article key={tile.id} data-tone={metricTone(tile.trend)}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <label><small>Metric</small><input
              value={tile.label}
              aria-label={`Metric ${index + 1} label`}
              placeholder="Metric name"
              onChange={(event) => setTile(tile.id, { label: event.target.value })}
            /></label>
            <label><small>Value</small><input
              value={tile.value}
              aria-label={`Metric ${index + 1} value`}
              inputMode="decimal"
              placeholder="0"
              onChange={(event) => setTile(tile.id, { value: event.target.value })}
            /></label>
            <label><small>Unit</small><input
              value={tile.unit}
              aria-label={`Metric ${index + 1} unit`}
              placeholder="—"
              onChange={(event) => setTile(tile.id, { unit: event.target.value })}
            /></label>
            <button
              type="button"
              className="gp-metrics-studio-trend"
              data-tone={metricTone(tile.trend)}
              aria-label={`Cycle ${tile.label || `metric ${index + 1}`} trend`}
              onClick={() => setTile(tile.id, { trend: NEXT_TREND[tile.trend] })}
            >
              <TrendIcon trend={tile.trend} size={11} />
              <span>{metricTrendLabel(tile.trend)}</span>
            </button>
            <button
              type="button"
              className="gp-metrics-studio-remove"
              aria-label={`Remove ${tile.label || `metric ${index + 1}`}`}
              onClick={() => removeTile(tile.id)}
            >
              <X size={10} />
            </button>
          </article>
        ))}
      </div>
      <footer><button type="button" onClick={addTile}><Plus size={10} /> Add metric</button></footer>
    </div>
  )
}
