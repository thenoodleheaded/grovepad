import { Flag, Pause, Play, RotateCcw } from 'lucide-react'
import type { StopwatchData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { useSharedClock } from '../../../hooks/useSharedClock'

interface StopwatchWidgetProps {
  data: StopwatchData
  onChange: (data: StopwatchData) => void
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

/** Stopwatch with laps — persists only instants, never ticks the store. */
export function StopwatchWidget({ data, onChange }: StopwatchWidgetProps) {
  const isRunning = data.startedAt !== null
  const now = useSharedClock(50, isRunning)
  const elapsed = data.elapsedMs + (isRunning ? now - data.startedAt! : 0)
  const runningRef = useFieldAnchor('running')

  const toggle = () => {
    if (isRunning) {
      onChange({ ...data, elapsedMs: elapsed, startedAt: null })
    } else {
      onChange({ ...data, startedAt: Date.now() })
    }
  }

  const reset = () => onChange({ elapsedMs: 0, startedAt: null, laps: [] })
  const lap = () => onChange({ ...data, laps: [...data.laps, elapsed] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div ref={runningRef} className="flex shrink-0 flex-1 items-center justify-center">
        <span
          className={`gp-hero font-mono transition-[color,opacity] duration-300 ${
            isRunning ? '' : 'opacity-80'
          }`}
        >
          {formatMs(elapsed)}
        </span>
      </div>

      {data.laps.length > 0 && (
        <div className="max-h-20 shrink-0 overflow-y-auto rounded-lg border gp-hairline px-2 py-1">
          {data.laps.map((lapMs, i) => {
            const prev = i === 0 ? 0 : data.laps[i - 1]!
            return (
              <div key={i} className="flex h-5 items-center justify-between font-mono text-[10px] tabular-nums">
                <span className="text-neutral-600">Lap {i + 1}</span>
                <span className="text-neutral-500">+{formatMs(lapMs - prev)}</span>
                <span className="text-neutral-300">{formatMs(lapMs)}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex h-8 shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Reset"
          onClick={reset}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border gp-hairline text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300"
        >
          <RotateCcw size={11} aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={isRunning ? 'Pause' : 'Start'}
          style={
            isRunning
              ? {
                  background: 'color-mix(in oklab, var(--gp-widget-accent), transparent 86%)',
                  color: 'var(--gp-widget-accent)',
                }
              : undefined
          }
          className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
            isRunning
              ? ''
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          {isRunning ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
          {isRunning ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
        </button>
        <button
          type="button"
          aria-label="Lap"
          disabled={!isRunning}
          onClick={lap}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border gp-hairline text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300 disabled:pointer-events-none disabled:opacity-30"
        >
          <Flag size={11} aria-hidden />
        </button>
      </div>
    </div>
  )
}
