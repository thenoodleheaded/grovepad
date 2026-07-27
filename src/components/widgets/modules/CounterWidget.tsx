import { useEffect, useState, type CSSProperties } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Gauge,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import type { CounterData, ModuleData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { COUNTER_STEP_LIMIT } from '../../../utils/widgetValueValidation'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { WidgetPanel } from '../WidgetPanel'
import { withoutPanelItem } from '../panelRemoval'
import {
  counterSkin,
  formatElapsed,
  goalCounterState,
  goalReading,
  multiCounterState,
  multiCounterTotal,
  periodEntryLabel,
  periodLabel,
  periodState,
  rateReading,
  rollPeriod,
  safeCount,
  safeCounterStep,
  tallyGroups,
  timedRateState,
  type CounterPeriod,
  type CounterSkin,
} from './counterSkinModel'

interface CounterWidgetProps {
  data: CounterData
  onChange: (data: CounterData) => void
  skin?: CounterSkin
}

const PERIODS: CounterPeriod[] = ['daily', 'weekly', 'monthly']

/** A tally counter — one label, one number, worn seven different ways. */
export function CounterWidget({ data, onChange, skin: requestedSkin }: CounterWidgetProps) {
  const skin = requestedSkin ?? counterSkin(data.skin)
  const step = safeCounterStep(data.step)
  const count = safeCount(data.count)
  // Removal waits for the panel's exit transition, so a tally fades out
  // instead of the list snapping shut under the pointer.
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set())

  // Only the rate skin needs a ticking clock; everything else is static.
  const tick = useSharedClock(1000, skin === 'timed_rate', false)
  // The period skin needs to notice a day boundary, not every second.
  const periodTick = useSharedClock(60_000, skin === 'resetting_period', true)

  const base = (next: Partial<CounterData> = {}): CounterData => ({ ...data, skin, ...next })
  const write = (next: Partial<CounterData>) => onChange(base(next))
  const writeState = (value: string, state: Record<string, unknown>, next: Partial<CounterData> = {}) =>
    onChange(dataWithSkinState(base(next) as ModuleData, value, state) as CounterData)

  const nudge = (delta: number) => write({ count: safeCount(count + delta) })
  const reset = () => write({ count: 0 })

  const period = periodState(skinStateFor(data, 'resetting_period'), new Date(periodTick))

  // A card left open across midnight banks the finished period on its own.
  useEffect(() => {
    if (skin !== 'resetting_period') return
    const rolled = rollPeriod(period, count, new Date(periodTick))
    if (!rolled.rolled) return
    writeState('resetting_period', { ...rolled.state }, { count: rolled.count })
    // `period` and `count` are derived from the same data this effect writes;
    // depending on the tick alone keeps it to one roll per boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin, periodTick])

  const labelField = (
    <input
      value={data.label}
      placeholder="What are you counting?"
      aria-label="Counter label"
      onChange={(event) => write({ label: event.target.value })}
      className="gp-counter-label gp-input--bare"
    />
  )

  const stepField = (
    <label className="gp-counter-step">
      <span>Step</span>
      <input
        type="number"
        min={1}
        max={COUNTER_STEP_LIMIT}
        step={1}
        value={data.step}
        aria-label="Step size"
        onChange={(event) => write({ step: safeCounterStep(Number(event.target.value)) })}
        className="gp-input--bare"
      />
    </label>
  )

  const resetButton = (
    <button type="button" className="gp-counter-reset" aria-label="Reset counter" onClick={reset}>
      <RotateCcw size={10} aria-hidden />
      Reset
    </button>
  )

  let body: React.ReactNode

  if (skin === 'clicker') {
    body = (
      <div className="gp-counter-clicker">
        {labelField}
        <button
          type="button"
          className="gp-counter-tap"
          aria-label={`Count one more — currently ${count}`}
          onClick={() => nudge(step)}
        >
          <strong className="gp-counter-tabular" key={count}>{count}</strong>
          <span>Tap to count</span>
        </button>
        <footer>
          <button
            type="button"
            aria-label={`Undo — decrease by ${step}`}
            onClick={() => nudge(-step)}
            className="gp-counter-undo"
          >
            <Minus size={11} aria-hidden />
            Undo
          </button>
          {resetButton}
        </footer>
      </div>
    )
  } else if (skin === 'goal_counter') {
    const state = goalCounterState(skinStateFor(data, 'goal_counter'))
    const reading = goalReading(count, state)
    body = (
      <div className="gp-counter-goal" data-reached={reading.reached || undefined}>
        {labelField}
        <div className="gp-counter-goal-main">
          <span
            className="gp-counter-ring"
            style={{ '--gp-counter-progress': reading.progress } as CSSProperties}
            role="img"
            aria-label={`${reading.percent}% of ${reading.target}`}
          >
            <i aria-hidden />
            <b className="gp-counter-tabular">{reading.percent}<em>%</em></b>
          </span>
          <dl className="gp-counter-goal-stats">
            <div><dt>Current</dt><dd className="gp-counter-tabular">{reading.current}</dd></div>
            <div><dt>Target</dt><dd>
              <input
                type="number"
                min={1}
                value={state.target}
                aria-label="Goal target"
                onChange={(event) => writeState('goal_counter', {
                  target: Number(event.target.value),
                })}
                className="gp-input--bare gp-counter-target"
              />
            </dd></div>
            <div><dt>{reading.reached ? 'Over' : 'To go'}</dt><dd className="gp-counter-tabular">
              {reading.reached ? reading.current - reading.target : reading.remaining}
            </dd></div>
          </dl>
        </div>
        <footer>
          <div className="gp-counter-pair">
            <button type="button" aria-label={`Decrease by ${step}`} onClick={() => nudge(-step)}>
              <Minus size={13} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Increase by ${step}`}
              onClick={() => nudge(step)}
              data-primary
            >
              <Plus size={13} aria-hidden />
            </button>
          </div>
          {resetButton}
        </footer>
      </div>
    )
  } else if (skin === 'up_down') {
    body = (
      <div className="gp-counter-updown">
        {labelField}
        <div className="gp-counter-updown-main">
          <button
            type="button"
            className="gp-counter-arrow"
            aria-label={`Increase by ${step}`}
            onClick={() => nudge(step)}
          >
            <ChevronUp size={20} aria-hidden />
          </button>
          <strong className="gp-counter-tabular" key={count}>{count}</strong>
          <button
            type="button"
            className="gp-counter-arrow"
            aria-label={`Decrease by ${step}`}
            onClick={() => nudge(-step)}
          >
            <ChevronDown size={20} aria-hidden />
          </button>
        </div>
        <footer>{stepField}{resetButton}</footer>
      </div>
    )
  } else if (skin === 'multi_counter') {
    const state = multiCounterState(skinStateFor(data, 'multi_counter'))
    const total = multiCounterTotal(state)
    const put = (counters: typeof state.counters) =>
      writeState('multi_counter', { counters })
    body = (
      <div className="gp-counter-multi">
        <header>
          <span>{data.label.trim() || 'Tallies'}</span>
          <small className="gp-counter-tabular">{total} total</small>
        </header>
        <div className="gp-counter-multi-list" data-floor-overflow="scroll">
          {state.counters.length === 0 && (
            <p className="gp-counter-empty">No tallies yet — add the first one below.</p>
          )}
          {state.counters.map((counter) => (
            <WidgetPanel
              key={counter.id}
              removing={removingIds.has(counter.id)}
              onExitComplete={() => {
                setRemovingIds((previous) => {
                  if (!previous.has(counter.id)) return previous
                  const next = new Set(previous)
                  next.delete(counter.id)
                  return next
                })
                put(withoutPanelItem(state.counters, counter.id))
              }}
              floor="controls"
              grip={false}
              className="gp-counter-multi-row"
            >
              <input
                value={counter.label}
                placeholder="Name this tally"
                aria-label="Tally name"
                onChange={(event) => put(state.counters.map((entry) =>
                  entry.id === counter.id ? { ...entry, label: event.target.value } : entry,
                ))}
                className="gp-input--bare"
              />
              <span className="gp-counter-multi-controls">
                <button
                  type="button"
                  aria-label={`Decrease ${counter.label || 'tally'} by ${step}`}
                  onClick={() => put(state.counters.map((entry) =>
                    entry.id === counter.id
                      ? { ...entry, count: safeCount(entry.count - step) }
                      : entry,
                  ))}
                >
                  <Minus size={11} aria-hidden />
                </button>
                <b className="gp-counter-tabular">{counter.count}</b>
                <button
                  type="button"
                  aria-label={`Increase ${counter.label || 'tally'} by ${step}`}
                  onClick={() => put(state.counters.map((entry) =>
                    entry.id === counter.id
                      ? { ...entry, count: safeCount(entry.count + step) }
                      : entry,
                  ))}
                  data-primary
                >
                  <Plus size={11} aria-hidden />
                </button>
              </span>
              <button
                type="button"
                className="gp-counter-multi-remove"
                aria-label={`Remove ${counter.label || 'tally'}`}
                onClick={() => setRemovingIds((previous) => new Set(previous).add(counter.id))}
              >
                <X size={10} aria-hidden />
              </button>
            </WidgetPanel>
          ))}
        </div>
        <button
          type="button"
          className="gp-counter-add"
          onClick={() => put([
            ...state.counters,
            { id: crypto.randomUUID(), label: '', count: 0 },
          ])}
        >
          <Plus size={11} aria-hidden />
          Add tally
        </button>
      </div>
    )
  } else if (skin === 'timed_rate') {
    const state = timedRateState(skinStateFor(data, 'timed_rate'))
    const reading = rateReading(count, state, tick)
    body = (
      <div className="gp-counter-rate" data-running={reading.running || undefined}>
        {labelField}
        <div className="gp-counter-rate-main">
          <strong className="gp-counter-tabular">
            {reading.rate >= 100 ? Math.round(reading.rate) : reading.rate.toFixed(1)}
          </strong>
          <small>{reading.windowLabel}</small>
        </div>
        <dl className="gp-counter-rate-stats">
          <div><dt>Events</dt><dd className="gp-counter-tabular">{reading.events}</dd></div>
          <div><dt>Elapsed</dt><dd className="gp-counter-tabular">{formatElapsed(reading.elapsedMs)}</dd></div>
        </dl>
        <div className="gp-counter-rate-controls">
          <button
            type="button"
            className="gp-counter-count"
            aria-label={`Count one more — currently ${count}`}
            onClick={() => nudge(step)}
          >
            <Plus size={13} aria-hidden />
            Count
          </button>
          <button
            type="button"
            aria-label={reading.running ? 'Stop measuring' : 'Start measuring'}
            onClick={() => writeState('timed_rate', reading.running
              ? { ...state, startedAt: null }
              : { ...state, startedAt: Date.now(), baseline: count })}
          >
            {reading.running ? <Square size={11} aria-hidden /> : <Play size={11} aria-hidden />}
            {reading.running ? 'Stop' : 'Start'}
          </button>
          <button
            type="button"
            aria-label={`Measure ${state.window === 'minute' ? 'per hour' : 'per minute'}`}
            onClick={() => writeState('timed_rate', {
              ...state,
              window: state.window === 'minute' ? 'hour' : 'minute',
            })}
          >
            <Gauge size={11} aria-hidden />
            {state.window === 'minute' ? '/min' : '/hr'}
          </button>
        </div>
      </div>
    )
  } else if (skin === 'resetting_period') {
    const best = period.history.reduce((top, entry) => Math.max(top, entry.total), 0)
    body = (
      <div className="gp-counter-period">
        <header>
          {labelField}
          <div className="gp-counter-period-picker" role="group" aria-label="Period">
            {PERIODS.map((value) => (
              <button
                key={value}
                type="button"
                data-active={period.period === value || undefined}
                aria-pressed={period.period === value}
                onClick={() => writeState('resetting_period', {
                  ...period,
                  period: value,
                  // Re-anchor: the stored key belongs to the old period shape.
                  currentKey: undefined,
                })}
              >
                {value === 'daily' ? 'Day' : value === 'weekly' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </header>
        <div className="gp-counter-period-main">
          <span>
            <small>{periodLabel(period.period)}</small>
            <strong className="gp-counter-tabular" key={count}>{count}</strong>
          </span>
          <div className="gp-counter-pair">
            <button type="button" aria-label={`Decrease by ${step}`} onClick={() => nudge(-step)}>
              <Minus size={13} aria-hidden />
            </button>
            <button type="button" aria-label={`Increase by ${step}`} onClick={() => nudge(step)} data-primary>
              <Plus size={13} aria-hidden />
            </button>
          </div>
        </div>
        <div className="gp-counter-period-history" data-floor-overflow="scroll">
          {period.history.length === 0 ? (
            <p className="gp-counter-empty">
              Finished {period.period === 'daily' ? 'days' : period.period === 'weekly' ? 'weeks' : 'months'} are banked here.
            </p>
          ) : period.history.map((entry) => (
            <span key={entry.key} className="gp-counter-period-bar">
              <em>{periodEntryLabel(entry, period.period)}</em>
              <i
                aria-hidden
                style={{ '--gp-counter-bar': best > 0 ? entry.total / best : 0 } as CSSProperties}
              />
              <b className="gp-counter-tabular">{entry.total}</b>
            </span>
          ))}
          {period.history.length > 0 && (
            <button
              type="button"
              className="gp-counter-clear"
              aria-label="Clear banked history"
              onClick={() => writeState('resetting_period', { ...period, history: [] })}
            >
              <Trash2 size={10} aria-hidden />
              Clear history
            </button>
          )}
        </div>
      </div>
    )
  } else {
    const { groups, remainder } = tallyGroups(count)
    body = (
      <div className="gp-counter-tally">
        {labelField}
        <div className="gp-counter-tally-main">
          <strong className="gp-counter-tabular" key={count}>{count}</strong>
          <div className="gp-counter-marks" aria-hidden>
            {Array.from({ length: groups }, (_, index) => (
              <span key={`g${index}`} className="gp-counter-gate" data-full />
            ))}
            {remainder > 0 && (
              <span className="gp-counter-gate" data-marks={remainder} />
            )}
            {count > 200 && <em>+{count - 200}</em>}
          </div>
        </div>
        <footer>
          <div className="gp-counter-pair">
            <button type="button" aria-label={`Decrease by ${step}`} onClick={() => nudge(-step)}>
              <Minus size={13} aria-hidden />
            </button>
            <button type="button" aria-label={`Increase by ${step}`} onClick={() => nudge(step)} data-primary>
              <Plus size={13} aria-hidden />
            </button>
          </div>
          {stepField}
          {resetButton}
        </footer>
      </div>
    )
  }

  return (
    <div className="gp-counter-skin" data-counter-skin={skin}>
      {body}
    </div>
  )
}
