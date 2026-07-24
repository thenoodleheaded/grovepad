import { Flag, Pause, Play, RotateCcw } from 'lucide-react'
import type { StopwatchData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { formatStopwatch } from '../../../utils/widgetClock'
import { WidgetPanel } from '../WidgetPanel'

interface StopwatchWidgetProps {
  data: StopwatchData
  onChange: (data: StopwatchData) => void
}

/**
 * Stopwatch — persists only instants, never ticks the store.
 *
 * The card's own outline is the dial (WidgetClockRing), so the time sits bare
 * in the middle of it rather than inside a second nested frame. Transport is
 * three equal icon keys on one island: no labels to re-read, no primary button
 * stretching wider than its siblings.
 */
export function StopwatchWidget({ data, onChange }: StopwatchWidgetProps) {
  const isRunning = data.startedAt !== null
  const now = useSharedClock(50, isRunning)
  const elapsed = data.elapsedMs + (isRunning ? now - data.startedAt! : 0)
  const toggle = () => {
    if (isRunning) onChange({ ...data, elapsedMs: elapsed, startedAt: null })
    else onChange({ ...data, startedAt: Date.now() })
  }

  const reset = () => onChange({ elapsedMs: 0, startedAt: null, laps: [] })
  const lap = () => onChange({ ...data, laps: [...data.laps, elapsed] })

  const lastLap = data.laps.at(-1)

  return (
    <div className="gp-clock-body flex h-full flex-col items-center justify-center gap-2.5 px-1">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <span
          className={`font-semibold leading-none tabular-nums transition-colors duration-300 ${
            isRunning ? 'text-neutral-50' : 'text-neutral-400'
          }`}
          style={{ fontSize: 'clamp(20px, 15cqmin, 44px)' }}
        >
          {formatStopwatch(elapsed)}
        </span>
        {/* The most recent lap is the one reading a runner actually wants; the
            full history stays in the card only while it is tall enough. */}
        {lastLap !== undefined && (
          <span className="mt-1.5 text-[10px] tabular-nums text-neutral-600">
            Lap {data.laps.length} · {formatStopwatch(lastLap - (data.laps.at(-2) ?? 0))}
          </span>
        )}
      </div>

      <WidgetPanel grip={false} floor="controls" className="flex shrink-0 items-center gap-1 p-1">
        <StopwatchKey label="Reset" onClick={reset} disabled={elapsed === 0}>
          <RotateCcw size={13} aria-hidden />
        </StopwatchKey>
        <StopwatchKey
          label={isRunning ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
          onClick={toggle}
          accent
        >
          {isRunning ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </StopwatchKey>
        <StopwatchKey label="Lap" onClick={lap} disabled={!isRunning}>
          <Flag size={13} aria-hidden />
        </StopwatchKey>
      </WidgetPanel>
    </div>
  )
}

function StopwatchKey({ label, onClick, children, disabled = false, accent = false }: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  accent?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={accent ? { color: 'var(--gp-widget-accent)' } : undefined}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 active:scale-90 disabled:pointer-events-none disabled:opacity-25 ${
        accent ? 'bg-white/[0.09] hover:bg-white/[0.14]' : 'text-neutral-400 hover:bg-white/[0.07] hover:text-neutral-100'
      }`}
    >
      {children}
    </button>
  )
}
