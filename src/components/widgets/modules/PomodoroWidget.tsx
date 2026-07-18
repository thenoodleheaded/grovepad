import { useEffect, useRef } from 'react'
import { Coffee, Pause, Play, RotateCcw } from 'lucide-react'
import type { PomodoroData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { GlassKey } from '../instruments/GlassInstrumentParts'

interface PomodoroWidgetProps {
  data: PomodoroData
  onChange: (data: PomodoroData) => void
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * Pomodoro focus timer — alternates work/break phases and tallies completed
 * work sessions. Like the Timer widget it persists only start/stop instants,
 * ticking locally so the store isn't written every second.
 */
export function PomodoroWidget({ data, onChange }: PomodoroWidgetProps) {
  const dataRef = useRef(data)
  dataRef.current = data
  const runningRef = useFieldAnchor('running')

  const isRunning = data.endAt !== null
  const now = useSharedClock(250, isRunning)
  const remaining = isRunning
    ? Math.max(0, Math.round((data.endAt! - now) / 1000))
    : data.remainingSeconds
  const isWork = data.phase === 'work'
  const phaseLength = (isWork ? data.workMinutes : data.breakMinutes) * 60

  // On reaching zero, advance to the next phase (crediting a session when a
  // work block finishes) and pause there.
  useEffect(() => {
    if (!isRunning || remaining > 0) return
    const d = dataRef.current
    const nextIsWork = d.phase !== 'work'
    const nextLen = (nextIsWork ? d.workMinutes : d.breakMinutes) * 60
    onChange({
      ...d,
      phase: nextIsWork ? 'work' : 'break',
      endAt: null,
      remainingSeconds: nextLen,
      completed: d.phase === 'work' ? d.completed + 1 : d.completed,
    })
  }, [isRunning, remaining, onChange])

  const toggle = () => {
    if (isRunning) {
      onChange({ ...data, endAt: null, remainingSeconds: remaining })
    } else if (remaining > 0) {
      onChange({ ...data, endAt: Date.now() + remaining * 1000 })
    }
  }

  const reset = () =>
    onChange({ ...data, endAt: null, remainingSeconds: phaseLength })

  const progress = phaseLength > 0 ? 1 - remaining / phaseLength : 0

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2">
        <input
          value={data.label}
          placeholder="Focus on…"
          aria-label="Session label"
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
        />
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isWork
              ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
              : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
          }`}
        >
          {isWork ? 'Work' : <Coffee size={10} aria-hidden />}
          {isWork ? '' : 'Break'}
        </span>
      </div>

      <div ref={runningRef} className="flex flex-1 flex-col items-center justify-center gap-1.5">
        {/* Phase ring — a soft under-glow stroke beneath a crisp one; the
            dashoffset transition only runs while the timer is ticking. */}
        <div className="relative flex items-center justify-center">
          <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90" aria-hidden>
            {Array.from({length:60},(_,index)=>{const angle=index*6*Math.PI/180;const lit=index<Math.round((remaining/Math.max(1,phaseLength))*60);const inner=index%5===0?42:45;return <line key={index} x1={52+Math.cos(angle)*inner} y1={52+Math.sin(angle)*inner} x2={52+Math.cos(angle)*49} y2={52+Math.sin(angle)*49} stroke="currentColor" strokeWidth={index%5===0?1.5:1} opacity={lit ? .8 : .16} className={lit?(isWork?'text-rose-400':'text-emerald-400'):'text-neutral-500'}/>})}
            <circle cx="52" cy="52" r="34" fill="none" strokeWidth="3" className="stroke-neutral-800" />
            <circle
              cx="52"
              cy="52"
              r="34"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={isWork ? 'stroke-rose-400/25' : 'stroke-emerald-400/25'}
              strokeDasharray={2*Math.PI*34}
              strokeDashoffset={2*Math.PI*34 * (1 - Math.min(1, progress))}
              style={{ transition: 'stroke-dashoffset 300ms linear' }}
            />
            <circle
              cx="52"
              cy="52"
              r="34"
              fill="none"
              strokeWidth="4.5"
              strokeLinecap="round"
              className={isWork ? 'stroke-rose-400' : 'stroke-emerald-400'}
              strokeDasharray={2*Math.PI*34}
              strokeDashoffset={2*Math.PI*34 * (1 - Math.min(1, progress))}
              style={{ transition: 'stroke-dashoffset 300ms linear' }}
            />
          </svg>
          <GlassKey onClick={toggle} aria-label={isRunning?'Pause focus timer':'Start focus timer'} className={`absolute grid h-14 w-14 place-items-center rounded-full  text-[11px] font-bold tabular-nums ${
              isRunning ? (isWork ? 'text-rose-300' : 'text-emerald-300') : 'text-neutral-200'
            }`}
          >
            <span>{formatTime(remaining)}</span>{isRunning?<Pause size={10}/>:<Play size={10}/>} 
          </GlassKey>
        </div>
        <div
          className="flex items-center gap-1"
          aria-label={`${data.completed} session${data.completed === 1 ? '' : 's'} done`}
        >
          {data.completed === 0 ? (
            <span className=" text-[10px] text-neutral-600">no sessions yet</span>
          ) : (
            <>
              {Array.from({ length: Math.min(data.completed, 8) }).map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_oklch(88%_0.31_136_/_0.6)]"
                />
              ))}
              {data.completed > 8 && (
                <span className=" text-[9px] tabular-nums text-neutral-500">
                  +{data.completed - 8}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={isRunning ? 'Pause' : 'Start'}
          className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
            isRunning
              ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          {isRunning ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
          {isRunning ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          aria-label="Reset phase"
          onClick={reset}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border gp-hairline text-neutral-500 transition-colors hover:border-neutral-600 hover:text-neutral-300"
        >
          <RotateCcw size={11} aria-hidden />
        </button>
      </div>
    </div>
  )
}
