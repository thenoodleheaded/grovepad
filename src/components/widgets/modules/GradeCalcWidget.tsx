import {
  ArrowRight,
  Check,
  Minus,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { GradeCalcData, ModuleData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import { GpaWidget } from './GpaWidget'
import {
  clampGradeNumber,
  computeWeightedGrade,
  curvedGrade,
  curveState,
  droppedComponentIds,
  droppedScoresState,
  gradeLetter,
  gradeSkinMode,
  gradeTone,
  gradeWithoutDroppedScores,
  passFailState,
  totalGradeWeight,
  whatIfGrade,
  whatIfState,
  type GradeSkinMode,
  type GradeTone,
} from './gradeSkinModel'

interface GradeCalcWidgetProps {
  data: GradeCalcData
  onChange: (data: GradeCalcData) => void
  skin?: GradeSkinMode
}

type GradeComponent = GradeCalcData['components'][number]

function readNumber(raw: string): number {
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : 0
}

function Hero({
  eyebrow,
  value,
  suffix,
  note,
  tone,
  progress,
  aside,
}: {
  eyebrow: string
  value: string
  suffix?: string
  note: string
  tone: GradeTone
  progress: number
  aside?: ReactNode
}) {
  return (
    <section
      className="gp-grades-hero"
      data-tone={tone}
      style={{ '--gp-grade-progress': `${clampGradeNumber(progress, 0, 100) * 3.6}deg` } as CSSProperties}
    >
      <div className="gp-grades-hero-copy">
        <span>{eyebrow}</span>
        <output>
          {value}
          {suffix && <small>{suffix}</small>}
        </output>
        <p>{note}</p>
      </div>
      {aside ?? (
        <div className="gp-grades-ring" aria-hidden>
          <strong>{gradeLetter(progress)}</strong>
        </div>
      )}
    </section>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="gp-grades-empty">
      <Sparkles size={18} aria-hidden />
      <span>{children}</span>
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="gp-grades-add" onClick={onClick}>
      <Plus size={12} aria-hidden />
      {label}
    </button>
  )
}

function GradeRow({
  component,
  onPatch,
  onRemove,
  variant = 'table',
  leading,
}: {
  component: GradeComponent
  onPatch: (patch: Partial<GradeComponent>) => void
  onRemove: () => void
  variant?: 'table' | 'rubric'
  leading?: ReactNode
}) {
  return (
    <div className="gp-grade-row" data-variant={variant}>
      {leading}
      <label className="gp-grade-name gp-bare-field">
        <span className="sr-only">Component name</span>
        <input
          value={component.name}
          placeholder={variant === 'rubric' ? 'Criterion…' : 'Component…'}
          aria-label="Component name"
          maxLength={80}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </label>
      <label className="gp-grade-number gp-bare-field" data-kind="score">
        <span>{variant === 'rubric' ? 'Score' : 'Score'}</span>
        <span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={component.score}
            aria-label={`${component.name || 'Component'} score`}
            onChange={(event) => onPatch({ score: clampGradeNumber(readNumber(event.target.value), 0, 100) })}
          />
          <i>%</i>
        </span>
      </label>
      <label className="gp-grade-number gp-bare-field" data-kind="weight">
        <span>Weight</span>
        <span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={component.weight}
            aria-label={`${component.name || 'Component'} weight`}
            onChange={(event) => onPatch({ weight: clampGradeNumber(readNumber(event.target.value), 0, 100) })}
          />
          <i>%</i>
        </span>
      </label>
      {variant === 'rubric' && (
        <div className="gp-grade-row-meter" aria-hidden>
          <span style={{ width: `${clampGradeNumber(component.score, 0, 100)}%` }} />
        </div>
      )}
      <button
        type="button"
        className="gp-grade-remove"
        aria-label={`Remove ${component.name || 'component'}`}
        onClick={onRemove}
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  )
}

function WeightedSkin({
  components,
  grade,
  totalWeight,
  onPatch,
  onRemove,
  onAdd,
}: GradeListProps & { grade: number; totalWeight: number }) {
  return (
    <div className="gp-grades gp-grades--weighted">
      <Hero
        eyebrow="Weighted grade"
        value={grade.toFixed(1)}
        suffix="%"
        note={`${totalWeight.toFixed(0)}% of your course is mapped`}
        tone={gradeTone(grade)}
        progress={grade}
      />
      <div className="gp-grade-table-head" aria-hidden>
        <span>Coursework</span><span>Score</span><span>Weight</span><span />
      </div>
      <div className="gp-grade-list">
        {components.length === 0
          ? <EmptyState>Add your first piece of coursework.</EmptyState>
          : components.map((component) => (
            <GradeRow
              key={component.id}
              component={component}
              onPatch={(patch) => onPatch(component.id, patch)}
              onRemove={() => onRemove(component.id)}
            />
          ))}
      </div>
      <footer className="gp-grades-footer">
        <AddButton label="Add component" onClick={onAdd} />
        <span data-complete={Math.round(totalWeight) === 100 || undefined}>
          {Math.round(totalWeight) === 100 ? <Check size={11} aria-hidden /> : null}
          {Math.round(totalWeight)} / 100%
        </span>
      </footer>
    </div>
  )
}

interface GradeListProps {
  components: GradeCalcData['components']
  onPatch: (id: string, patch: Partial<GradeComponent>) => void
  onRemove: (id: string) => void
  onAdd: () => void
}

function PassFailSkin({
  components,
  grade,
  state,
  setState,
}: Pick<GradeListProps, 'components'> & {
  grade: number
  state: ReturnType<typeof passFailState>
  setState: (state: WidgetSkinState) => void
}) {
  const margin = grade - state.threshold
  const passing = margin >= 0
  return (
    <div className="gp-grades gp-grades--pass-fail">
      <Hero
        eyebrow={passing ? 'On track' : 'Needs attention'}
        value={passing ? 'Passing' : 'Below'}
        note={`${Math.abs(margin).toFixed(1)} points ${passing ? 'above' : 'below'} your target`}
        tone={passing ? gradeTone(grade, state.threshold) : 'risk'}
        progress={grade}
        aside={(
          <div className="gp-grade-verdict" data-passing={passing || undefined}>
            {passing ? <Check size={20} aria-hidden /> : <Minus size={20} aria-hidden />}
          </div>
        )}
      />
      <label className="gp-grade-threshold gp-bare-field">
        <span>
          <b>Pass mark</b>
          <output>{state.threshold.toFixed(0)}%</output>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={state.threshold}
          aria-label="Pass mark"
          onChange={(event) => setState({ threshold: readNumber(event.target.value) })}
        />
      </label>
      <div className="gp-grade-breakdown">
        {components.map((component) => (
          <div key={component.id}>
            <span>{component.name || 'Untitled'}</span>
            <i><span style={{ width: `${component.score}%` }} /></i>
            <strong>{component.score.toFixed(0)}%</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function WhatIfSkin({
  components,
  grade,
  state,
  setState,
}: Pick<GradeListProps, 'components'> & {
  grade: number
  state: ReturnType<typeof whatIfState>
  setState: (state: WidgetSkinState) => void
}) {
  const projected = whatIfGrade(components, state)
  const delta = projected - grade
  const selected = components.find((component) => component.id === state.componentId)
  return (
    <div className="gp-grades gp-grades--what-if">
      <Hero
        eyebrow="Projected grade"
        value={projected.toFixed(1)}
        suffix="%"
        note={`${delta >= 0 ? '+' : ''}${delta.toFixed(1)} points from your current ${grade.toFixed(1)}%`}
        tone={gradeTone(projected)}
        progress={projected}
        aside={(
          <div className="gp-grade-delta" data-positive={delta >= 0 || undefined}>
            {delta >= 0 ? <TrendingUp size={15} aria-hidden /> : <TrendingDown size={15} aria-hidden />}
            <strong>{Math.abs(delta).toFixed(1)}</strong>
            <span>pts</span>
          </div>
        )}
      />
      {components.length === 0 ? (
        <EmptyState>Add coursework in Weighted Grade first.</EmptyState>
      ) : (
        <>
          <div className="gp-grade-choice" role="listbox" aria-label="Component to simulate">
            {components.map((component) => (
              <button
                key={component.id}
                type="button"
                role="option"
                aria-selected={component.id === state.componentId}
                onClick={() => setState({ componentId: component.id, score: component.score })}
              >
                <span>{component.name || 'Untitled'}</span>
                <small>{component.score.toFixed(0)}%</small>
              </button>
            ))}
          </div>
          <label className="gp-grade-simulation gp-bare-field">
            <span>
              <b>{selected?.name || 'Hypothetical score'}</b>
              <output>{state.score.toFixed(0)}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={state.score}
              aria-label={`Hypothetical score for ${selected?.name || 'component'}`}
              onChange={(event) => setState({ ...state, score: readNumber(event.target.value) })}
            />
            <div aria-hidden><span style={{ width: `${state.score}%` }} /></div>
          </label>
        </>
      )}
    </div>
  )
}

function RubricSkin(props: GradeListProps & { grade: number }) {
  return (
    <div className="gp-grades gp-grades--rubric">
      <header className="gp-grade-rubric-head">
        <div>
          <span>Rubric score</span>
          <strong>{props.grade.toFixed(1)}%</strong>
        </div>
        <span className="gp-grade-letter" data-tone={gradeTone(props.grade)}>
          {gradeLetter(props.grade)}
        </span>
      </header>
      <div className="gp-grade-list">
        {props.components.length === 0
          ? <EmptyState>Add the first criterion to your rubric.</EmptyState>
          : props.components.map((component, index) => (
            <GradeRow
              key={component.id}
              component={component}
              variant="rubric"
              leading={<span className="gp-grade-index">{String(index + 1).padStart(2, '0')}</span>}
              onPatch={(patch) => props.onPatch(component.id, patch)}
              onRemove={() => props.onRemove(component.id)}
            />
          ))}
      </div>
      <footer className="gp-grades-footer">
        <AddButton label="Add criterion" onClick={props.onAdd} />
        <span>{props.components.length} criteria</span>
      </footer>
    </div>
  )
}

function DroppedScoresSkin({
  components,
  grade,
  state,
  setState,
}: Pick<GradeListProps, 'components'> & {
  grade: number
  state: ReturnType<typeof droppedScoresState>
  setState: (state: WidgetSkinState) => void
}) {
  const dropped = droppedComponentIds(components, state.count)
  const adjusted = gradeWithoutDroppedScores(components, state.count)
  return (
    <div className="gp-grades gp-grades--dropped">
      <Hero
        eyebrow="Adjusted grade"
        value={adjusted.toFixed(1)}
        suffix="%"
        note={`${adjusted - grade >= 0 ? '+' : ''}${(adjusted - grade).toFixed(1)} points after the drop policy`}
        tone={gradeTone(adjusted)}
        progress={adjusted}
      />
      <div className="gp-grade-stepper">
        <div>
          <span>Drop lowest</span>
          <small>Preview only · saved scores stay intact</small>
        </div>
        <div role="group" aria-label="Number of scores to drop">
          <button
            type="button"
            aria-label="Drop fewer scores"
            disabled={state.count === 0}
            onClick={() => setState({ count: state.count - 1 })}
          ><Minus size={12} aria-hidden /></button>
          <output>{state.count}</output>
          <button
            type="button"
            aria-label="Drop more scores"
            disabled={state.count >= Math.max(0, components.length - 1)}
            onClick={() => setState({ count: state.count + 1 })}
          ><Plus size={12} aria-hidden /></button>
        </div>
      </div>
      <div className="gp-grade-policy-list">
        {[...components]
          .sort((a, b) => a.score - b.score)
          .map((component) => (
            <div key={component.id} data-dropped={dropped.has(component.id) || undefined}>
              <span>{component.name || 'Untitled'}</span>
              <strong>{component.score.toFixed(0)}%</strong>
              <small>{dropped.has(component.id) ? 'Dropped' : 'Counted'}</small>
            </div>
          ))}
      </div>
    </div>
  )
}

function CurveSkin({
  grade,
  state,
  setState,
}: {
  grade: number
  state: ReturnType<typeof curveState>
  setState: (state: WidgetSkinState) => void
}) {
  const curved = curvedGrade(grade, state.points)
  return (
    <div className="gp-grades gp-grades--curve">
      <div className="gp-grade-compare">
        <div>
          <span>Raw</span>
          <strong>{grade.toFixed(1)}%</strong>
          <small>{gradeLetter(grade)}</small>
        </div>
        <ArrowRight size={15} aria-hidden />
        <div data-curved>
          <span>Curved</span>
          <strong>{curved.toFixed(1)}%</strong>
          <small>{gradeLetter(curved)}</small>
        </div>
      </div>
      <label className="gp-grade-curve-control gp-bare-field">
        <span>
          <b>Curve adjustment</b>
          <output>{state.points >= 0 ? '+' : ''}{state.points.toFixed(0)} pts</output>
        </span>
        <input
          type="range"
          min={-30}
          max={30}
          step={1}
          value={state.points}
          aria-label="Curve adjustment"
          onChange={(event) => setState({ points: readNumber(event.target.value) })}
        />
        <div className="gp-grade-curve-scale" aria-hidden>
          <span>−30</span><i /><span>0</span><i /><span>+30</span>
        </div>
      </label>
      <div className="gp-grade-curve-note">
        <Sparkles size={14} aria-hidden />
        <p><strong>Scenario preview</strong><span>Original coursework and scores are unchanged.</span></p>
      </div>
    </div>
  )
}

export function GradeCalcWidget({ data, onChange, skin }: GradeCalcWidgetProps) {
  const mode = gradeSkinMode(skin ?? data.mode)
  const grade = computeWeightedGrade(data.components)
  const totalWeight = totalGradeWeight(data.components)

  const setComponent = (id: string, patch: Partial<GradeComponent>) => {
    onChange({
      ...data,
      components: data.components.map((component) => (
        component.id === id ? { ...component, ...patch } : component
      )),
    })
  }
  const removeComponent = (id: string) => {
    onChange({ ...data, components: data.components.filter((component) => component.id !== id) })
  }
  const addComponent = () => {
    onChange({
      ...data,
      components: [
        ...data.components,
        { id: crypto.randomUUID(), name: '', score: 0, weight: 0 },
      ],
    })
  }
  const setState = (value: GradeSkinMode, state: WidgetSkinState) => {
    onChange(dataWithSkinState(data as ModuleData, value, state) as GradeCalcData)
  }
  const listProps: GradeListProps = {
    components: data.components,
    onPatch: setComponent,
    onRemove: removeComponent,
    onAdd: addComponent,
  }

  switch (mode) {
    case 'gpa': {
      const gpa = data.gpa ?? {
        courses: [{ id: 'first-course', name: '', credits: 3, points: 4 }],
      }
      return (
        <GpaWidget
          data={gpa}
          onChange={(next) => onChange({ ...data, gpa: next })}
        />
      )
    }
    case 'pass_fail': {
      const state = passFailState(skinStateFor(data, mode))
      return (
        <PassFailSkin
          components={data.components}
          grade={grade}
          state={state}
          setState={(next) => setState(mode, next)}
        />
      )
    }
    case 'what_if': {
      const state = whatIfState(skinStateFor(data, mode), data.components)
      return (
        <WhatIfSkin
          components={data.components}
          grade={grade}
          state={state}
          setState={(next) => setState(mode, next)}
        />
      )
    }
    case 'rubric':
      return <RubricSkin {...listProps} grade={grade} />
    case 'dropped_scores': {
      const state = droppedScoresState(skinStateFor(data, mode), data.components.length)
      return (
        <DroppedScoresSkin
          components={data.components}
          grade={grade}
          state={state}
          setState={(next) => setState(mode, next)}
        />
      )
    }
    case 'curve_simulator': {
      const state = curveState(skinStateFor(data, mode))
      return <CurveSkin grade={grade} state={state} setState={(next) => setState(mode, next)} />
    }
    default:
      return <WeightedSkin {...listProps} grade={grade} totalWeight={totalWeight} />
  }
}
