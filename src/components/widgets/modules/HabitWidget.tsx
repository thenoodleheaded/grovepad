import {
  Check,
  Flame,
  Link2,
  Minus,
  Plus,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { HabitData, HabitSkinMode, ModuleData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  habitBestRun,
  habitCompletionPercent,
  habitDays,
  habitDoneCount,
  habitFrequencyTarget,
  habitRoutineState,
  habitSkinMode,
  habitTargetState,
  nextHabitData,
} from './habitSkinModel'

interface HabitWidgetProps {
  data: HabitData
  onChange: (data: HabitData) => void
  skin?: HabitSkinMode
}

interface SkinProps {
  data: HabitData
  days: boolean[]
  skin: HabitSkinMode
  state: WidgetSkinState
  toggleDay: (index: number) => void
  patch: (next: Partial<HabitData>) => void
  setState: (next: WidgetSkinState, days?: boolean[]) => void
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function firstOpenDay(days: readonly boolean[]): number {
  const index = days.findIndex((done) => !done)
  return index < 0 ? 6 : index
}

function HabitHeader({
  data,
  detail,
  icon: Icon = Flame,
  patch,
}: {
  data: HabitData
  detail: string
  icon?: typeof Flame
  patch: (next: Partial<HabitData>) => void
}) {
  return (
    <header className="gp-habit-head">
      <span className="gp-habit-glyph" aria-hidden><Icon size={14} /></span>
      <div className="gp-habit-name gp-bare-field">
        <input
          value={data.label}
          placeholder="Name your habit"
          aria-label="Habit name"
          data-floor-overflow="scroll"
          onChange={(event) => patch({ label: event.target.value })}
        />
      </div>
      <span className="gp-habit-detail">{detail}</span>
    </header>
  )
}

function DayButton({
  index,
  done,
  onClick,
  shape = 'disc',
}: {
  index: number
  done: boolean
  onClick: () => void
  shape?: 'disc' | 'tile' | 'link' | 'micro'
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${DAY_NAMES[index]} ${done ? 'complete' : 'not complete'}`}
      className="gp-habit-day gp-check-free"
      data-shape={shape}
      data-done={done || undefined}
      onClick={onClick}
    >
      <span className="gp-habit-day-mark" aria-hidden>
        {done && <Check size={shape === 'micro' ? 9 : 12} strokeWidth={3} />}
      </span>
      <span className="gp-habit-day-label">{DAY_LABELS[index]}</span>
    </button>
  )
}

function WeekGridSkin(props: SkinProps) {
  const done = habitDoneCount(props.days)
  return (
    <div className="gp-habit gp-habit--week">
      <HabitHeader data={props.data} detail={`${done} / 7`} patch={props.patch} />
      <div className="gp-habit-week-grid" aria-label="This week">
        {props.days.map((value, index) => (
          <DayButton key={index} index={index} done={value} onClick={() => props.toggleDay(index)} />
        ))}
      </div>
      <div className="gp-habit-progress-line" aria-label={`${done} of 7 days complete`}>
        <span style={{ width: `${done / 7 * 100}%` }} />
      </div>
      <p className="gp-habit-caption">
        {done === 7 ? <><Sparkles size={11} aria-hidden /> A beautifully complete week</> : `${7 - done} ${7 - done === 1 ? 'day' : 'days'} left this week`}
      </p>
    </div>
  )
}

function MonthHeatmapSkin(props: SkinProps) {
  const done = habitDoneCount(props.days)
  return (
    <div className="gp-habit gp-habit--month">
      <HabitHeader data={props.data} detail="This month" patch={props.patch} />
      <div className="gp-habit-heatmap" aria-label="Current week in a four-week heatmap">
        <div className="gp-habit-heat-labels" aria-hidden>
          {DAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}
        </div>
        <div className="gp-habit-heat-cells">
          {Array.from({ length: 21 }, (_, index) => (
            <span key={`past-${index}`} className="gp-habit-heat-cell" data-past aria-hidden />
          ))}
          {props.days.map((value, index) => (
            <button
              key={index}
              type="button"
              role="checkbox"
              aria-checked={value}
              aria-label={`${DAY_NAMES[index]} ${value ? 'complete' : 'not complete'}`}
              className="gp-habit-heat-cell gp-check-free"
              data-current
              data-done={value || undefined}
              onClick={() => props.toggleDay(index)}
            >
              <span className="sr-only">{DAY_NAMES[index]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="gp-habit-month-foot">
        <span><i data-level="quiet" /><i data-level="soft" /><i data-level="bright" /> Less to more</span>
        <strong>{done}<small>/7</small></strong>
      </div>
    </div>
  )
}

function ChainSkin(props: SkinProps) {
  const run = habitBestRun(props.days)
  return (
    <div className="gp-habit gp-habit--chain">
      <HabitHeader data={props.data} detail={`${run} day run`} icon={Link2} patch={props.patch} />
      <ol className="gp-habit-chain" aria-label="Weekly habit chain">
        {props.days.map((value, index) => (
          <li key={index} data-done={value || undefined}>
            <DayButton index={index} done={value} shape="link" onClick={() => props.toggleDay(index)} />
          </li>
        ))}
      </ol>
      <p className="gp-habit-chain-message" data-live={run > 1 || undefined}>
        <Flame size={13} aria-hidden />
        {run === 0 ? 'Start with one honest link' : run === 7 ? 'The chain held all week' : `Longest unbroken chain: ${run}`}
      </p>
    </div>
  )
}

function ScorecardSkin(props: SkinProps) {
  const done = habitDoneCount(props.days)
  const percent = habitCompletionPercent(props.days)
  const best = habitBestRun(props.days)
  return (
    <div className="gp-habit gp-habit--score">
      <HabitHeader data={props.data} detail="Weekly score" icon={Trophy} patch={props.patch} />
      <div className="gp-habit-score-main">
        <div
          className="gp-habit-score-ring gp-flat-visual-own"
          style={{ '--gp-habit-score': `${percent * 3.6}deg` } as CSSProperties}
          aria-label={`${percent}% complete`}
        >
          <strong>{percent}<small>%</small></strong>
          <span>compliance</span>
        </div>
        <dl className="gp-habit-stats">
          <div><dt>Completed</dt><dd>{done}<small> days</small></dd></div>
          <div><dt>Best run</dt><dd>{best}<small> days</small></dd></div>
          <div><dt>Open</dt><dd>{7 - done}<small> days</small></dd></div>
        </dl>
      </div>
      <div className="gp-habit-micro-days" aria-label="Edit this week's score">
        {props.days.map((value, index) => (
          <DayButton key={index} index={index} done={value} shape="micro" onClick={() => props.toggleDay(index)} />
        ))}
      </div>
    </div>
  )
}

function DayPicker({
  days,
  selected,
  onSelect,
}: {
  days: readonly boolean[]
  selected: number
  onSelect: (index: number) => void
}) {
  return (
    <div className="gp-habit-day-picker" role="tablist" aria-label="Choose a day">
      {days.map((done, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={selected === index}
          aria-label={DAY_NAMES[index]}
          data-done={done || undefined}
          onClick={() => onSelect(index)}
        >
          {DAY_LABELS[index]}
          {done && <span aria-hidden />}
        </button>
      ))}
    </div>
  )
}

function RoutineStackSkin(props: SkinProps) {
  const [selected, setSelected] = useState(() => firstOpenDay(props.days))
  const routine = habitRoutineState(props.state, props.days, props.data.label)
  const row = routine.completions[selected]!

  const updateStep = (stepIndex: number) => {
    const completions = routine.completions.map((values, dayIndex) => (
      dayIndex === selected
        ? values.map((value, index) => index === stepIndex ? !value : value)
        : [...values]
    ))
    const days = props.days.map((done, dayIndex) => (
      dayIndex === selected ? completions[selected]!.every(Boolean) : done
    ))
    props.setState({ steps: routine.steps, completions }, days)
  }

  const renameStep = (stepIndex: number, value: string) => {
    const steps = routine.steps.map((step, index) => index === stepIndex ? value.slice(0, 44) : step)
    props.setState({ steps, completions: routine.completions })
  }

  return (
    <div className="gp-habit gp-habit--routine">
      <HabitHeader data={props.data} detail="Routine stack" icon={Sparkles} patch={props.patch} />
      <DayPicker days={props.days} selected={selected} onSelect={setSelected} />
      <div className="gp-habit-routine-list" aria-label={`${DAY_NAMES[selected]} routine`}>
        {routine.steps.map((step, index) => (
          <div key={index} className="gp-habit-routine-row" data-done={row[index] || undefined}>
            <button
              type="button"
              role="checkbox"
              aria-checked={row[index]}
              aria-label={`Mark step ${index + 1} ${row[index] ? 'not done' : 'done'}`}
              className="gp-habit-routine-check gp-check-free"
              onClick={() => updateStep(index)}
            >
              {row[index] ? <Check size={12} strokeWidth={3} aria-hidden /> : <span>{index + 1}</span>}
            </button>
            <div className="gp-habit-routine-name gp-bare-field">
              <input
                value={step}
                aria-label={`Routine step ${index + 1}`}
                onChange={(event) => renameStep(index, event.target.value)}
              />
            </div>
            {index + 1 < routine.steps.length && <span className="gp-habit-routine-thread" aria-hidden />}
          </div>
        ))}
      </div>
      <p className="gp-habit-caption">{row.filter(Boolean).length} of {row.length} steps complete</p>
    </div>
  )
}

function MinimumTargetSkin(props: SkinProps) {
  const [selected, setSelected] = useState(() => firstOpenDay(props.days))
  const target = habitTargetState(props.state, props.days)
  const amount = target.amounts[selected]!
  const progress = Math.min(100, Math.round(amount / target.target * 100))

  const update = (next: typeof target) => {
    const days = props.days.map((done, index) => (
      index === selected ? next.amounts[index]! >= next.minimum : done
    ))
    props.setState({ ...next }, days)
  }
  const setAmount = (value: number) => {
    const amounts = target.amounts.map((amountValue, index) => (
      index === selected ? Math.max(0, Math.min(999, value)) : amountValue
    ))
    update({ ...target, amounts })
  }

  return (
    <div className="gp-habit gp-habit--target">
      <HabitHeader data={props.data} detail="Minimum / target" icon={Target} patch={props.patch} />
      <DayPicker days={props.days} selected={selected} onSelect={setSelected} />
      <div className="gp-habit-target-main">
        <button type="button" aria-label="Decrease amount" onClick={() => setAmount(amount - 1)}><Minus size={15} aria-hidden /></button>
        <div className="gp-habit-target-readout gp-well">
          <span>{DAY_NAMES[selected]}</span>
          <strong>{amount}</strong>
          <em>{amount >= target.target ? 'Target met' : amount >= target.minimum ? 'Minimum met' : 'Keep going'}</em>
        </div>
        <button type="button" aria-label="Increase amount" onClick={() => setAmount(amount + 1)}><Plus size={15} aria-hidden /></button>
      </div>
      <div className="gp-habit-target-track" aria-label={`${progress}% of target`}>
        <span style={{ width: `${progress}%` }} />
        <i style={{ left: `${Math.min(100, target.minimum / target.target * 100)}%` }} aria-hidden />
      </div>
      <div className="gp-habit-target-settings">
        <label className="gp-bare-field">
          <span>Minimum</span>
          <input
            type="number"
            min="1"
            max="99"
            value={target.minimum}
            onChange={(event) => {
              const minimum = Math.max(1, Math.min(99, Number(event.target.value) || 1))
              update({ ...target, minimum, target: Math.max(minimum, target.target) })
            }}
          />
        </label>
        <label className="gp-bare-field">
          <span>Ideal target</span>
          <input
            type="number"
            min={target.minimum}
            max="999"
            value={target.target}
            onChange={(event) => update({ ...target, target: Math.max(target.minimum, Math.min(999, Number(event.target.value) || target.minimum)) })}
          />
        </label>
      </div>
    </div>
  )
}

function FlexibleFrequencySkin(props: SkinProps) {
  const target = habitFrequencyTarget(props.state)
  const done = habitDoneCount(props.days)
  const reached = done >= target
  const updateTarget = (next: number) => props.setState({ ...props.state, target: Math.max(1, Math.min(7, next)) })
  return (
    <div className="gp-habit gp-habit--frequency" data-reached={reached || undefined}>
      <HabitHeader data={props.data} detail="Flexible week" icon={Target} patch={props.patch} />
      <div className="gp-habit-frequency-hero gp-well">
        <div>
          <span>Completed</span>
          <strong>{done}<small> / {target}</small></strong>
          <em>{reached ? 'Weekly goal reached' : `${target - done} more, on any day`}</em>
        </div>
        <div className="gp-habit-frequency-target">
          <button type="button" aria-label="Decrease weekly target" onClick={() => updateTarget(target - 1)} disabled={target <= 1}><Minus size={12} aria-hidden /></button>
          <span><b>{target}</b>× week</span>
          <button type="button" aria-label="Increase weekly target" onClick={() => updateTarget(target + 1)} disabled={target >= 7}><Plus size={12} aria-hidden /></button>
        </div>
      </div>
      <div className="gp-habit-frequency-days" aria-label="Choose any completed days">
        {props.days.map((value, index) => (
          <DayButton key={index} index={index} done={value} shape="tile" onClick={() => props.toggleDay(index)} />
        ))}
      </div>
      <p className="gp-habit-caption">
        {reached ? <><Trophy size={11} aria-hidden /> You made the week count</> : 'No fixed weekdays — choose what fits'}
      </p>
    </div>
  )
}

/** One canonical week, rendered as seven purpose-built habit experiences. */
export function HabitWidget({ data, onChange, skin: rawSkin }: HabitWidgetProps) {
  const skin = habitSkinMode(rawSkin ?? data.skin)
  const days = habitDays(data.days)
  const state = skinStateFor(data, skin)
  const patch = (next: Partial<HabitData>) => onChange({ ...data, ...next, skin })
  const toggleDay = (index: number) => {
    const next = days.map((done, dayIndex) => dayIndex === index ? !done : done)
    onChange({ ...nextHabitData(data, next), skin })
  }
  const setState = (next: WidgetSkinState, nextDays = days) => {
    const shared = { ...nextHabitData(data, nextDays), skin } as HabitData
    onChange(dataWithSkinState(shared as ModuleData, skin, next) as HabitData)
  }
  const props: SkinProps = { data, days, skin, state, toggleDay, patch, setState }

  if (skin === 'month_heatmap') return <MonthHeatmapSkin {...props} />
  if (skin === 'chain') return <ChainSkin {...props} />
  if (skin === 'scorecard') return <ScorecardSkin {...props} />
  if (skin === 'routine_stack') return <RoutineStackSkin {...props} />
  if (skin === 'minimum_target') return <MinimumTargetSkin {...props} />
  if (skin === 'flexible_frequency') return <FlexibleFrequencySkin {...props} />
  return <WeekGridSkin {...props} />
}
