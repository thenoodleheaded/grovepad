import { useEffect, useRef } from 'react'
import { Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react'
import type { TimerData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { formatClock } from '../../../utils/widgetClock'
import { WidgetPanel } from '../WidgetPanel'

interface TimerWidgetProps {
  data: TimerData
  onChange: (data: TimerData) => void
}

const MIN_DURATION = 30
const MAX_DURATION = 4 * 3600
const STEP = 60

/**
 * Countdown timer — persists only start/stop instants, never ticks the store.
 *
 * The card's outline is the dial, so the remaining time reads bare in the
 * middle of it: no inner well, no second frame around a number that the ring
 * is already describing. Transport is one island of equal icon keys.
 */
export function TimerWidget({ data, onChange }: TimerWidgetProps) {
  const dataRef = useRef(data)
  dataRef.current = data

  const isRunning = data.endAt !== null
  const now = useSharedClock(250, isRunning)
  const remaining = isRunning ? Math.max(0, Math.round((data.endAt! - now) / 1000)) : data.remainingSeconds
  // Auto-pause the instant the countdown hits zero.
  useEffect(() => {
    if (isRunning && remaining <= 0) {
      onChange({ ...dataRef.current, endAt: null, remainingSeconds: 0 })
    }
  }, [isRunning, remaining, onChange])

  const toggle = () => {
    if (isRunning) onChange({ ...data, endAt: null, remainingSeconds: remaining })
    else if (remaining > 0) onChange({ ...data, endAt: Date.now() + remaining * 1000 })
  }

  const reset = () => onChange({ ...data, endAt: null, remainingSeconds: data.durationSeconds })

  const adjustDuration = (delta: number) => {
    const next = Math.min(MAX_DURATION, Math.max(MIN_DURATION, data.durationSeconds + delta))
    onChange({ ...data, durationSeconds: next, remainingSeconds: next, endAt: null })
  }

  const urgent = remaining <= 10 && remaining > 0

  return (
    <div className="gp-clock-body flex h-full flex-col items-center justify-center gap-2.5 px-1">
      <input
        value={data.label}
        placeholder="Timer…"
        aria-label="Timer label"
        onChange={(e) => onChange({ ...data, label: e.target.value })}
        className="gp-input--bare w-full shrink-0 text-center text-[12px] text-neutral-300 outline-none placeholder:text-neutral-700"
      />

      <div

        data-running={isRunning}
        className="flex min-h-0 flex-1 flex-col items-center justify-center"
      >
        <span
          className="font-semibold leading-none tabular-nums transition-colors duration-300"
          style={{
            fontSize: 'clamp(22px, 20cqmin, 56px)',
            color: urgent ? 'oklch(70% 0.2 22)' : isRunning ? 'var(--gp-widget-accent)' : 'rgb(212 212 212)',
          }}
        >
          {formatClock(remaining)}
        </span>
        <span className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.16em] text-neutral-600">
          {isRunning ? 'Counting down' : remaining > 0 ? `of ${formatClock(data.durationSeconds)}` : 'Done'}
        </span>
      </div>

      <WidgetPanel grip={false} floor="controls" className="flex shrink-0 items-center gap-1 p-1">
        <TimerKey label="Subtract a minute" onClick={() => adjustDuration(-STEP)} disabled={isRunning}>
          <Minus size={13} aria-hidden />
        </TimerKey>
        <TimerKey label={isRunning ? 'Pause' : 'Start'} onClick={toggle} accent>
          {isRunning ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </TimerKey>
        <TimerKey label="Reset" onClick={reset}>
          <RotateCcw size={13} aria-hidden />
        </TimerKey>
        <TimerKey label="Add a minute" onClick={() => adjustDuration(STEP)} disabled={isRunning}>
          <Plus size={13} aria-hidden />
        </TimerKey>
      </WidgetPanel>
    </div>
  )
}

function TimerKey({ label, onClick, children, disabled = false, accent = false }: {
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
