import { Minus, Plus, TrendingDown, TrendingUp, X } from 'lucide-react'
import type { MetricsData, MetricTrend } from '../../../types/spatial'

interface MetricsWidgetProps {
  data: MetricsData
  onChange: (data: MetricsData) => void
}

const NEXT_TREND: Record<MetricTrend, MetricTrend> = { up: 'flat', flat: 'down', down: 'up' }

const TREND_STYLES: Record<MetricTrend, string> = {
  up: 'text-emerald-400',
  down: 'text-red-400',
  flat: 'text-neutral-500',
}

function TrendIcon({ trend }: { trend: MetricTrend }) {
  if (trend === 'up') return <TrendingUp size={12} aria-hidden />
  if (trend === 'down') return <TrendingDown size={12} aria-hidden />
  return <Minus size={12} aria-hidden />
}

/** KPI tile grid — value, unit, label, and a tap-to-cycle trend arrow. */
export function MetricsWidget({ data, onChange }: MetricsWidgetProps) {
  // The first tile is the wireable KPI — pipe a number in to drive it live.
  const setTile = (id: string, patch: Partial<MetricsData['tiles'][number]>) =>
    onChange({
      tiles: data.tiles.map((tile) => (tile.id === id ? { ...tile, ...patch } : tile)),
    })

  const removeTile = (id: string) =>
    onChange({ tiles: data.tiles.filter((tile) => tile.id !== id) })

  const addTile = () =>
    onChange({
      tiles: [
        ...data.tiles,
        { id: crypto.randomUUID(), label: '', value: '0', unit: '', trend: 'flat' },
      ],
    })

  return (
    <div className="gp-flat-visual flex h-full flex-col">
      <div className="grid grid-cols-2 gap-1.5">
        {data.tiles.map((tile) => (
          <div
            key={tile.id}
            className="group/tile relative rounded-xl border gp-hairline bg-neutral-900/50 p-2 transition-colors hover:border-neutral-600"
          >
            <button
              type="button"
              aria-label="Remove metric"
              onClick={() => removeTile(tile.id)}
              className="absolute right-1.5 top-1.5 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/tile:opacity-100 group-hover/tile:pointer-events-auto"
            >
              <X size={10} aria-hidden />
            </button>
            <div className="flex items-baseline gap-0.5">
              <input
                value={tile.value}
                aria-label="Metric value"
                onChange={(e) => setTile(tile.id, { value: e.target.value })}
                className="w-full min-w-0 bg-transparent  text-lg font-bold tabular-nums text-neutral-100 outline-none"
              />
              <input
                value={tile.unit}
                placeholder=""
                aria-label="Unit"
                onChange={(e) => setTile(tile.id, { unit: e.target.value })}
                className="w-7 shrink-0 bg-transparent  text-[10px] text-neutral-500 outline-none"
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              <input
                value={tile.label}
                placeholder="Metric…"
                aria-label="Metric label"
                onChange={(e) => setTile(tile.id, { label: e.target.value })}
                className="w-full min-w-0 bg-transparent text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700"
              />
              <button
                type="button"
                aria-label={`Trend: ${tile.trend}`}
                onClick={() => setTile(tile.id, { trend: NEXT_TREND[tile.trend] })}
                className={`shrink-0 transition-colors ${TREND_STYLES[tile.trend]}`}
              >
                <TrendIcon trend={tile.trend} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex h-8 items-center border-t gp-hairline">
        <button
          type="button"
          onClick={addTile}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add metric
        </button>
      </div>
    </div>
  )
}
