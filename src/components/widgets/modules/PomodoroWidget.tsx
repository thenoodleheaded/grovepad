import { useEffect, useRef } from 'react'
import { Coffee, Pause, Play, RotateCcw } from 'lucide-react'
import type { PomodoroData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { formatClock } from '../../../utils/widgetClock'
import { WidgetPanel } from '../WidgetPanel'

interface PomodoroWidgetProps {
  data: PomodoroData
  onChange: (data: PomodoroData) => void
}

const WORK_INK = 'oklch(70% 0.18 18)'
const BREAK_INK = 'oklch(78% 0.16 162)'

/**
 * Pomodoro — alternates work/break phases and tallies completed sessions.
 * Persists only start/stop instants, ticking locally so the store isn't
 * written every second.
 *
 * The card's outline carries the phase dial, so the time reads bare in the
 * middle of it. Completed sessions are pips under the clock — the one piece
 * of history the ring itself cannot say.
 */
export function PomodoroWidget({ data, onChange }: PomodoroWidgetProps) {
  const dataRef = useRef(data)
  dataRef.current = data
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
    if (isRunning) onChange({ ...data, endAt: null, remainingSeconds: remaining })
    else if (remaining > 0) onChange({ ...data, endAt: Date.now() + remaining * 1000 })
  }

  const reset = () => onChange({ ...data, endAt: null, remainingSeconds: phaseLength })
  const ink = isWork ? WORK_INK : BREAK_INK

  return (
    <div className="gp-clock-body flex h-full flex-col items-center justify-center gap-2.5 px-1">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <span
          className="font-semibold leading-none tabular-nums transition-colors duration-300"
          style={{ fontSize: 'clamp(22px, 20cqmin, 56px)', color: isRunning ? ink : 'rgb(212 212 212)' }}
        >
          {formatClock(remaining)}
        </span>
        <span
          className="mt-1.5 flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.16em]"
          style={{ color: ink }}
        >
          {isWork ? 'Focus' : <><Coffee size={9} aria-hidden />Break</>}
        </span>

        {/* Sessions banked so far — the history the dial cannot express. */}
        {data.completed > 0 && (
          <div
            className="mt-2 flex items-center gap-1"
            aria-label={`${data.completed} session${data.completed === 1 ? '' : 's'} done`}
          >
            {Array.from({ length: Math.min(data.completed, 8) }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: WORK_INK, boxShadow: `0 0 6px ${WORK_INK}` }}
              />
            ))}
            {data.completed > 8 && (
              <span className="text-[9px] tabular-nums text-neutral-500">+{data.completed - 8}</span>
            )}
          </div>
        )}
      </div>

      <WidgetPanel grip={false} floor="controls" className="flex shrink-0 items-center gap-1 p-1">
        <PomodoroKey label={isRunning ? 'Pause' : 'Start'} onClick={toggle} ink={ink} accent>
          {isRunning ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </PomodoroKey>
        <PomodoroKey label="Reset phase" onClick={reset}>
          <RotateCcw size={13} aria-hidden />
        </PomodoroKey>
      </WidgetPanel>
    </div>
  )
}

function PomodoroKey({ label, onClick, children, ink, accent = false }: {
  label: string
  onClick: () => void
  children: React.ReactNode
  ink?: string
  accent?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={accent ? { color: ink } : undefined}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 active:scale-90 ${
        accent ? 'bg-white/[0.09] hover:bg-white/[0.14]' : 'text-neutral-400 hover:bg-white/[0.07] hover:text-neutral-100'
      }`}
    >
      {children}
    </button>
  )
}
