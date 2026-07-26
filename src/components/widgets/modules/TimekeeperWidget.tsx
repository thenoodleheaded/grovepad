import { useEffect, useRef } from 'react'
import {
  ArrowRight,
  Flag,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Swords,
} from 'lucide-react'
import type {
  StopwatchData,
  TimekeeperData,
  TimerData,
} from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { formatClock, formatStopwatch } from '../../../utils/widgetClock'
import { CountdownWidget } from './CountdownWidget'
import { PomodoroWidget } from './PomodoroWidget'
import { StopwatchWidget } from './StopwatchWidget'
import { TimerWidget } from './TimerWidget'
import { WorldClockWidget } from './WorldClockWidget'
import {
  advanceInterval,
  chessClockState,
  chessRemaining,
  deadlineData,
  intervalState,
  multiStageState,
  timekeeperMode,
  worldClockData,
  type ChessClockState,
  type IntervalState,
  type MultiStageState,
} from './timeSkinModel'

/** One persistent time toolbox. Changing its skin never discards another clock. */
export function TimekeeperWidget({
  data,
  onChange,
}: {
  data: TimekeeperData
  onChange: (data: TimekeeperData) => void
}) {
  const mode = timekeeperMode(data.mode)
  const updateState = (key: string, state: object) =>
    onChange(dataWithSkinState(data, key, state as Record<string, unknown>) as TimekeeperData)

  return (
    <div className="gp-time-skin" data-time-mode={mode}>
      {mode === 'countdown' && (
        <TimerWidget data={data.countdown} onChange={(countdown) => onChange({ ...data, countdown })} />
      )}
      {mode === 'pomodoro' && (
        <PomodoroWidget data={data.pomodoro} onChange={(pomodoro) => onChange({ ...data, pomodoro })} />
      )}
      {mode === 'stopwatch' && (
        <StopwatchWidget data={data.stopwatch} onChange={(stopwatch) => onChange({ ...data, stopwatch })} />
      )}
      {mode === 'deadline' && (
        <CountdownWidget
          data={deadlineData(data)}
          onChange={(deadline) => onChange({ ...data, deadline })}
        />
      )}
      {mode === 'world_clock' && (
        <WorldClockWidget
          data={worldClockData(data)}
          onChange={(worldClock) => onChange({ ...data, worldClock })}
        />
      )}
      {mode === 'hourglass' && (
        <HourglassView
          data={data.countdown}
          onChange={(countdown) => onChange({ ...data, countdown })}
        />
      )}
      {(mode === 'intervals' || mode === 'tabata') && (
        <IntervalView
          preset={mode}
          state={intervalState(skinStateFor(data, mode), mode)}
          onChange={(state) => updateState(mode, state)}
        />
      )}
      {mode === 'chess_clock' && (
        <ChessClockView
          state={chessClockState(skinStateFor(data, mode))}
          onChange={(state) => updateState(mode, state)}
        />
      )}
      {mode === 'lap_timer' && (
        <LapTimerView
          data={data.stopwatch}
          onChange={(stopwatch) => onChange({ ...data, stopwatch })}
        />
      )}
      {mode === 'multi_stage_timer' && (
        <MultiStageView
          state={multiStageState(skinStateFor(data, mode))}
          onChange={(state) => updateState(mode, state)}
        />
      )}
    </div>
  )
}

function TimeKey({
  label,
  children,
  onClick,
  primary = false,
  disabled = false,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-primary={primary || undefined}
      disabled={disabled}
      className="gp-time-key"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function HourglassView({ data, onChange }: { data: TimerData; onChange: (data: TimerData) => void }) {
  const dataRef = useRef(data)
  dataRef.current = data
  const running = data.endAt !== null
  const now = useSharedClock(250, running)
  const remaining = running ? Math.max(0, Math.round((data.endAt! - now) / 1000)) : data.remainingSeconds
  useEffect(() => {
    if (running && remaining <= 0) onChange({ ...dataRef.current, endAt: null, remainingSeconds: 0 })
  }, [onChange, remaining, running])
  const fraction = Math.max(0, Math.min(1, remaining / Math.max(1, data.durationSeconds)))
  const toggle = () => onChange(running
    ? { ...data, endAt: null, remainingSeconds: remaining }
    : { ...data, endAt: Date.now() + remaining * 1000 })

  return (
    <div className="gp-time-hourglass">
      <header><span>Quiet timer</span><small>{running ? 'Sand is falling' : remaining ? 'Ready' : 'Complete'}</small></header>
      <main>
        <span className="gp-time-hourglass-art" data-running={running || undefined} aria-hidden="true">
          <i /><b style={{ height: `${fraction * 42}%` }} /><em style={{ height: `${(1 - fraction) * 42}%` }} />
        </span>
        <span className="gp-time-hourglass-readout"><strong>{formatClock(remaining)}</strong><small>{data.label || 'Hourglass'}</small></span>
      </main>
      <footer>
        <TimeKey label="Reset hourglass" onClick={() => onChange({ ...data, endAt: null, remainingSeconds: data.durationSeconds })}><RotateCcw size={13} /></TimeKey>
        <TimeKey label={running ? 'Pause hourglass' : 'Start hourglass'} primary onClick={toggle} disabled={remaining <= 0}>
          {running ? <Pause size={14} /> : <Play size={14} />}
        </TimeKey>
      </footer>
    </div>
  )
}

function IntervalView({
  preset,
  state,
  onChange,
}: {
  preset: 'intervals' | 'tabata'
  state: IntervalState
  onChange: (state: IntervalState) => void
}) {
  const stateRef = useRef(state)
  stateRef.current = state
  const running = state.endAt !== null
  const now = useSharedClock(250, running)
  const remaining = running ? Math.max(0, Math.round((state.endAt! - now) / 1000)) : state.remainingSeconds
  useEffect(() => {
    if (running && remaining <= 0) onChange(advanceInterval(stateRef.current))
  }, [onChange, remaining, running])
  const toggle = () => onChange(running
    ? { ...state, endAt: null, remainingSeconds: remaining }
    : { ...state, endAt: Date.now() + remaining * 1000 })
  const reset = () => onChange({
    ...state,
    currentRound: 1,
    phase: 'work',
    endAt: null,
    remainingSeconds: state.workSeconds,
    durationSeconds: state.workSeconds,
  })
  const setNumber = (key: 'workSeconds' | 'restSeconds' | 'rounds', value: number) => {
    const next = { ...state, [key]: value, endAt: null }
    onChange(key === 'workSeconds' && state.phase === 'work'
      ? { ...next, remainingSeconds: value, durationSeconds: value }
      : key === 'restSeconds' && state.phase === 'rest'
        ? { ...next, remainingSeconds: value, durationSeconds: value }
        : next)
  }

  return (
    <div className="gp-time-interval" data-preset={preset} data-phase={state.phase}>
      <header>
        <span>{preset === 'tabata' ? 'TABATA PROTOCOL' : 'INTERVAL SEQUENCE'}</span>
        <small>Round {state.currentRound} / {state.rounds}</small>
      </header>
      <main>
        <span className="gp-time-interval-phase">{state.phase === 'work' ? preset === 'tabata' ? 'GO' : 'WORK' : 'RECOVER'}</span>
        <strong>{formatClock(remaining)}</strong>
        <i><b style={{ width: `${Math.max(0, Math.min(1, remaining / state.durationSeconds)) * 100}%` }} /></i>
        <div>
          <label><small>Work</small><input disabled={running} type="number" min="5" value={state.workSeconds} aria-label="Work seconds" onChange={(event) => setNumber('workSeconds', Number(event.target.value))} /><span>sec</span></label>
          <label><small>Rest</small><input disabled={running} type="number" min="5" value={state.restSeconds} aria-label="Rest seconds" onChange={(event) => setNumber('restSeconds', Number(event.target.value))} /><span>sec</span></label>
          <label><small>Rounds</small><input disabled={running} type="number" min="1" value={state.rounds} aria-label="Rounds" onChange={(event) => setNumber('rounds', Number(event.target.value))} /></label>
        </div>
      </main>
      <footer>
        <TimeKey label="Reset intervals" onClick={reset}><RotateCcw size={13} /></TimeKey>
        <TimeKey label={running ? 'Pause intervals' : 'Start intervals'} primary onClick={toggle}>{running ? <Pause size={14} /> : <Play size={14} />}</TimeKey>
        <TimeKey label="Skip interval" onClick={() => onChange(advanceInterval({ ...state, endAt: null }))}><SkipForward size={13} /></TimeKey>
      </footer>
    </div>
  )
}

function ChessClockView({ state, onChange }: { state: ChessClockState; onChange: (state: ChessClockState) => void }) {
  const running = state.active !== null && state.startedAt !== null
  const now = useSharedClock(50, running)
  const remaining = chessRemaining(state, now)
  const switchTo = (active: 0 | 1) => {
    const committed = chessRemaining(state, Date.now())
    onChange({ ...state, remainingMs: committed, active, startedAt: Date.now() })
  }
  const reset = () => onChange({
    ...state,
    remainingMs: [state.durationSeconds * 1000, state.durationSeconds * 1000],
    active: null,
    startedAt: null,
  })
  const pause = () => onChange({ ...state, remainingMs: chessRemaining(state, Date.now()), active: null, startedAt: null })

  return (
    <div className="gp-time-chess">
      <header><Swords size={13} /><strong>Chess clock</strong><button type="button" onClick={reset}>Reset match</button></header>
      <main>
        {[0, 1].map((index) => (
          <button
            type="button"
            key={index}
            data-active={state.active === index || undefined}
            aria-label={`${index === 0 ? state.playerOne : state.playerTwo} clock`}
            onClick={() => switchTo(index === 0 ? 1 : 0)}
          >
            <small>{index === 0 ? state.playerOne : state.playerTwo}</small>
            <strong>{formatClock(remaining[index]! / 1000)}</strong>
            <span>{state.active === index ? 'Your move' : state.active === null ? 'Tap to begin' : 'Waiting'}</span>
          </button>
        ))}
      </main>
      <footer><button type="button" onClick={pause} disabled={!running}><Pause size={12} /> Pause both clocks</button></footer>
    </div>
  )
}

function LapTimerView({ data, onChange }: { data: StopwatchData; onChange: (data: StopwatchData) => void }) {
  const running = data.startedAt !== null
  const now = useSharedClock(50, running)
  const elapsed = data.elapsedMs + (running ? now - data.startedAt! : 0)
  const toggle = () => onChange(running
    ? { ...data, elapsedMs: elapsed, startedAt: null }
    : { ...data, startedAt: Date.now() })
  const lap = () => onChange({ ...data, laps: [...data.laps, elapsed] })

  return (
    <div className="gp-time-laps">
      <header><span>Lap timer</span><small>{data.laps.length} splits recorded</small></header>
      <main>
        <strong>{formatStopwatch(elapsed)}</strong>
        <div>
          {data.laps.length === 0
            ? <span className="gp-time-laps-empty"><Flag size={14} />Start the clock, then mark a lap.</span>
            : data.laps.slice(-4).reverse().map((lapTime, reverseIndex) => {
              const index = data.laps.length - reverseIndex - 1
              const split = lapTime - (data.laps[index - 1] ?? 0)
              return <span key={`${index}-${lapTime}`}><small>Lap {index + 1}</small><b>{formatStopwatch(split)}</b><em>{formatStopwatch(lapTime)}</em></span>
            })}
        </div>
      </main>
      <footer>
        <TimeKey label="Reset lap timer" onClick={() => onChange({ elapsedMs: 0, startedAt: null, laps: [] })}><RotateCcw size={13} /></TimeKey>
        <TimeKey label={running ? 'Pause lap timer' : 'Start lap timer'} primary onClick={toggle}>{running ? <Pause size={14} /> : <Play size={14} />}</TimeKey>
        <TimeKey label="Record lap" disabled={!running} onClick={lap}><Flag size={13} /></TimeKey>
      </footer>
    </div>
  )
}

function MultiStageView({ state, onChange }: { state: MultiStageState; onChange: (state: MultiStageState) => void }) {
  const stateRef = useRef(state)
  stateRef.current = state
  const running = state.endAt !== null
  const now = useSharedClock(250, running)
  const remaining = running ? Math.max(0, Math.round((state.endAt! - now) / 1000)) : state.remainingSeconds
  const select = (index: number) => {
    const duration = state.stages[index]!.durationSeconds
    onChange({ ...state, activeIndex: index, durationSeconds: duration, remainingSeconds: duration, endAt: null })
  }
  const advance = () => select((state.activeIndex + 1) % state.stages.length)
  useEffect(() => {
    if (running && remaining <= 0) {
      const live = stateRef.current
      const index = (live.activeIndex + 1) % live.stages.length
      const duration = live.stages[index]!.durationSeconds
      onChange({ ...live, activeIndex: index, durationSeconds: duration, remainingSeconds: duration, endAt: null })
    }
  }, [onChange, remaining, running])
  const toggle = () => onChange(running
    ? { ...state, endAt: null, remainingSeconds: remaining }
    : { ...state, endAt: Date.now() + remaining * 1000 })

  return (
    <div className="gp-time-stages">
      <header><span>Multi-stage timer</span><small>{state.activeIndex + 1} of {state.stages.length}</small></header>
      <main>
        <section>
          <small>Now</small>
          <strong>{state.stages[state.activeIndex]!.label}</strong>
          <b>{formatClock(remaining)}</b>
        </section>
        <div>
          {state.stages.map((stage, index) => (
            <button type="button" key={stage.id} data-active={index === state.activeIndex || undefined} onClick={() => select(index)}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{stage.label}</strong>
              <small>{formatClock(stage.durationSeconds)}</small>
              {index === state.activeIndex && <ArrowRight size={10} />}
            </button>
          ))}
        </div>
      </main>
      <footer>
        <TimeKey label="Reset stage" onClick={() => select(state.activeIndex)}><RotateCcw size={13} /></TimeKey>
        <TimeKey label={running ? 'Pause stages' : 'Start stages'} primary onClick={toggle}>{running ? <Pause size={14} /> : <Play size={14} />}</TimeKey>
        <TimeKey label="Next stage" onClick={advance}><SkipForward size={13} /></TimeKey>
      </footer>
    </div>
  )
}
