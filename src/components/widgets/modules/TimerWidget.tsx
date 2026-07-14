import { useEffect, useRef } from 'react'
import { Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react'
import type { TimerData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { GlassKey, GlassWell, SevenSegment } from '../instruments/GlassInstrumentParts'

interface TimerWidgetProps {
  data: TimerData
  onChange: (data: TimerData) => void
}

const MIN_DURATION = 30
const MAX_DURATION = 4 * 3600
const STEP = 60

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** Countdown timer — persists only start/stop instants, never ticks the store. */
export function TimerWidget({ data, onChange }: TimerWidgetProps) {
  const dataRef = useRef(data)
  dataRef.current = data

  const isRunning = data.endAt !== null
  const now = useSharedClock(250, isRunning)
  const remaining = isRunning ? Math.max(0, Math.round((data.endAt! - now) / 1000)) : data.remainingSeconds
  const runningRef = useFieldAnchor('running')

  // Auto-pause the instant the countdown hits zero.
  useEffect(() => {
    if (isRunning && remaining <= 0) {
      onChange({ ...dataRef.current, endAt: null, remainingSeconds: 0 })
    }
  }, [isRunning, remaining, onChange])

  const toggle = () => {
    if (isRunning) {
      onChange({ ...data, endAt: null, remainingSeconds: remaining })
    } else if (remaining > 0) {
      onChange({ ...data, endAt: Date.now() + remaining * 1000 })
    }
  }

  const reset = () => onChange({ ...data, endAt: null, remainingSeconds: data.durationSeconds })

  const adjustDuration = (delta: number) => {
    const next = Math.min(MAX_DURATION, Math.max(MIN_DURATION, data.durationSeconds + delta))
    onChange({ ...data, durationSeconds: next, remainingSeconds: next, endAt: null })
  }

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <input
        value={data.label}
        placeholder="Timer…"
        aria-label="Timer label"
        onChange={(e) => onChange({ ...data, label: e.target.value })}
        className="gp-input--bare w-full text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
      />

      <div ref={runningRef} data-running={isRunning} className="flex flex-1 items-center justify-center">
        <GlassWell className={`flex min-h-16 w-full items-center justify-center px-4 ${remaining<=10?'border-rose-400/30':''}`}>
          <SevenSegment value={formatTime(remaining)} urgent={remaining<=10}/>
        </GlassWell>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Decrease duration by 1 minute"
          disabled={isRunning}
          onClick={() => adjustDuration(-STEP)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border gp-hairline text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300 disabled:pointer-events-none disabled:opacity-30"
        >
          <Minus size={11} aria-hidden />
        </button>
        <GlassKey
          type="button"
          onClick={toggle}
          aria-label={isRunning ? 'Pause' : 'Start'}
          className={`flex h-8 flex-1 items-center justify-center gap-1.5 text-[11px] font-semibold ${isRunning?'text-[var(--gp-widget-accent)]':'text-neutral-200'}`}
        >
          {isRunning ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
          {isRunning ? 'Pause' : 'Start'}
        </GlassKey>
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
          aria-label="Increase duration by 1 minute"
          disabled={isRunning}
          onClick={() => adjustDuration(STEP)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border gp-hairline text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300 disabled:pointer-events-none disabled:opacity-30"
        >
          <Plus size={11} aria-hidden />
        </button>
      </div>
    </div>
  )
}
