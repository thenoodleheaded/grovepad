import { Plus, Star, Trash2 } from 'lucide-react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { ModuleData, RatingData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  clampRating,
  EMOJI_CHOICES,
  formatRating,
  npsBand,
  npsScore,
  ratingChoiceForKey,
  ratingConfidence,
  ratingCriteria,
  ratingFromNps,
  ratingSkinMode,
  ratingWord,
  rubricAverage,
  TRAFFIC_CHOICES,
  trafficChoice,
  type RatingCriterion,
  type RatingSkinMode,
} from './ratingSkinModel'

interface RatingWidgetProps {
  data: RatingData
  onChange: (data: RatingData) => void
  skin?: RatingSkinMode
}

interface DiscreteChoice {
  value: number
  label: string
}

function RatingLabel({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="gp-rating-label gp-bare-field">
      <input
        value={value}
        placeholder="What are you rating?"
        aria-label="Rating label"
        data-floor-overflow="scroll"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function RatingReading({
  primary,
  secondary,
}: {
  primary: string
  secondary: string
}) {
  return (
    <p className="gp-rating-reading" aria-live="polite">
      <strong>{primary}</strong>
      <span>{secondary}</span>
    </p>
  )
}

function choiceKeyHandler(
  event: KeyboardEvent<HTMLButtonElement>,
  choices: readonly DiscreteChoice[],
  current: number,
  choose: (value: number) => void,
) {
  const next = ratingChoiceForKey(choices.map((choice) => choice.value), current, event.key)
  if (next === null) return
  event.preventDefault()
  choose(next)
  const index = choices.findIndex((choice) => choice.value === next)
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLButtonElement>(':scope > button')
    [index]?.focus()
}

function StarsSkin({
  value,
  choose,
}: {
  value: number
  choose: (value: number) => void
}) {
  const choices = [1, 2, 3, 4, 5].map((star) => ({ value: star, label: `${star} of 5` }))
  const focusValue = Math.max(1, Math.round(value))

  return (
    <>
      <div className="gp-rating-stars" role="group" aria-label="Choose a star rating">
        {choices.map((choice) => {
          const fill = Math.min(1, Math.max(0, value - choice.value + 1))
          return (
            <button
              key={choice.value}
              type="button"
              aria-label={`Rate ${choice.label}`}
              aria-pressed={Math.round(value) === choice.value}
              tabIndex={focusValue === choice.value ? 0 : -1}
              onClick={() => choose(value === choice.value ? 0 : choice.value)}
              onKeyDown={(event) => choiceKeyHandler(event, choices, focusValue, choose)}
            >
              <span className="gp-rating-star-glyph" aria-hidden>
                <Star className="gp-rating-star-base" />
                <span style={{ '--gp-star-fill': `${fill * 100}%` } as CSSProperties}>
                  <Star className="gp-rating-star-fill" />
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <RatingReading primary={`${formatRating(value)} / 5`} secondary={ratingWord(value)} />
    </>
  )
}

function SliderSkin({
  value,
  choose,
}: {
  value: number
  choose: (value: number) => void
}) {
  return (
    <>
      <output className="gp-rating-slider-output">
        {formatRating(value)}
        <span>/ 5</span>
      </output>
      <div className="gp-rating-slider-wrap gp-bare-field">
        <input
          type="range"
          min={0}
          max={5}
          step={0.1}
          value={value}
          aria-label="Rating from 0 to 5"
          style={{ '--gp-rating-progress': `${value * 20}%` } as CSSProperties}
          onChange={(event) => choose(Number(event.target.value))}
        />
        <div className="gp-rating-slider-ticks" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((tick) => <span key={tick}>{tick}</span>)}
        </div>
      </div>
      <p className="gp-rating-caption" aria-live="polite">{ratingWord(value)}</p>
    </>
  )
}

function EmojiSkin({
  value,
  choose,
}: {
  value: number
  choose: (value: number) => void
}) {
  const focusValue = Math.max(1, Math.round(value))
  return (
    <>
      <div className="gp-rating-emojis" role="group" aria-label="Choose a feeling">
        {EMOJI_CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-label={`${choice.label}, ${choice.value} of 5`}
            aria-pressed={Math.round(value) === choice.value}
            tabIndex={focusValue === choice.value ? 0 : -1}
            onClick={() => choose(value === choice.value ? 0 : choice.value)}
            onKeyDown={(event) => choiceKeyHandler(event, EMOJI_CHOICES, focusValue, choose)}
          >
            <span aria-hidden>{choice.emoji}</span>
            <small>{choice.label}</small>
          </button>
        ))}
      </div>
      <RatingReading primary={`${formatRating(value)} / 5`} secondary={ratingWord(value)} />
    </>
  )
}

function TrafficLightSkin({
  value,
  choose,
}: {
  value: number
  choose: (value: number) => void
}) {
  const current = trafficChoice(value)
  const focusValue = current?.value ?? TRAFFIC_CHOICES[0].value
  return (
    <>
      <div className="gp-rating-traffic" role="group" aria-label="Choose a status">
        {TRAFFIC_CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            data-tone={choice.tone}
            aria-label={`${choice.label}, ${choice.value} of 5`}
            aria-pressed={current?.value === choice.value}
            tabIndex={focusValue === choice.value ? 0 : -1}
            onClick={() => choose(current?.value === choice.value ? 0 : choice.value)}
            onKeyDown={(event) => choiceKeyHandler(event, TRAFFIC_CHOICES, focusValue, choose)}
          >
            <span aria-hidden />
            <small>{choice.label}</small>
          </button>
        ))}
      </div>
      <RatingReading
        primary={current?.label ?? 'No status'}
        secondary={value > 0 ? `${formatRating(value)} of 5` : 'Choose a signal'}
      />
    </>
  )
}

function NpsSkin({
  value,
  choose,
}: {
  value: number
  choose: (value: number) => void
}) {
  const score = npsScore(value)
  const choices = Array.from({ length: 11 }, (_, index) => ({
    value: index,
    label: `${index} of 10`,
  }))
  return (
    <>
      <div className="gp-rating-nps" role="radiogroup" aria-label="Recommendation score">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-label={choice.label}
            aria-checked={score === choice.value}
            tabIndex={score === choice.value ? 0 : -1}
            data-band={npsBand(choice.value).toLowerCase()}
            onClick={() => choose(ratingFromNps(choice.value))}
            onKeyDown={(event) => choiceKeyHandler(
              event,
              choices,
              score,
              (next) => choose(ratingFromNps(next)),
            )}
          >
            {choice.value}
          </button>
        ))}
      </div>
      <div className="gp-rating-nps-bands" aria-hidden>
        <span>Detractor</span>
        <span>Passive</span>
        <span>Promoter</span>
      </div>
      <RatingReading primary={`${score} / 10`} secondary={npsBand(score)} />
    </>
  )
}

function RubricSkin({
  value,
  state,
  setState,
}: {
  value: number
  state: WidgetSkinState
  setState: (state: WidgetSkinState, value?: number) => void
}) {
  const criteria = ratingCriteria(state, value)

  const saveCriteria = (next: RatingCriterion[]) => {
    setState({ ...state, criteria: next }, rubricAverage(next))
  }
  const update = (id: string, patch: Partial<RatingCriterion>) => {
    saveCriteria(criteria.map((criterion) =>
      criterion.id === id ? { ...criterion, ...patch } : criterion,
    ))
  }
  const add = () => {
    if (criteria.length >= 5) return
    const suffix = `${criteria.length + 1}-${Date.now().toString(36)}`
    saveCriteria([...criteria, { id: `criterion-${suffix}`, label: 'New criterion', value }])
  }

  return (
    <>
      <div className="gp-rating-rubric" role="group" aria-label="Rating criteria">
        {criteria.map((criterion) => (
          <div className="gp-rating-criterion" key={criterion.id}>
            <div className="gp-rating-criterion-name gp-bare-field">
              <input
                value={criterion.label}
                aria-label="Criterion name"
                onChange={(event) => update(criterion.id, { label: event.target.value })}
              />
            </div>
            <div className="gp-rating-criterion-scale gp-bare-field">
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={criterion.value}
                aria-label={`${criterion.label} rating`}
                style={{ '--gp-rating-progress': `${criterion.value * 20}%` } as CSSProperties}
                onChange={(event) => update(criterion.id, { value: Number(event.target.value) })}
              />
            </div>
            <output>{formatRating(criterion.value)}</output>
            {criteria.length > 1 && (
              <button
                type="button"
                className="gp-rating-criterion-remove"
                aria-label={`Remove ${criterion.label}`}
                onClick={() => saveCriteria(criteria.filter((row) => row.id !== criterion.id))}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="gp-rating-rubric-foot">
        <button type="button" onClick={add} disabled={criteria.length >= 5}>
          <Plus size={12} aria-hidden />
          Add criterion
        </button>
        <RatingReading primary={`${formatRating(value)} / 5`} secondary="Published average" />
      </div>
    </>
  )
}

function ConfidenceSkin({
  value,
  choose,
  state,
  setState,
}: {
  value: number
  choose: (value: number) => void
  state: WidgetSkinState
  setState: (state: WidgetSkinState) => void
}) {
  const confidence = ratingConfidence(state)
  return (
    <>
      <div className="gp-rating-confidence-hero">
        <div
          className="gp-rating-confidence-ring"
          style={{ '--gp-confidence': `${confidence.percent * 3.6}deg` } as CSSProperties}
          aria-hidden
        >
          <span>{confidence.percent}<small>%</small></span>
        </div>
        <RatingReading primary={`${formatRating(value)} / 5`} secondary={ratingWord(value)} />
      </div>
      <div className="gp-rating-confidence-controls">
        <div className="gp-rating-confidence-control gp-bare-field">
          <label>Rating</label>
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={value}
            aria-label="Confidence card rating from 0 to 5"
            style={{ '--gp-rating-progress': `${value * 20}%` } as CSSProperties}
            onChange={(event) => choose(Number(event.target.value))}
          />
        </div>
        <div className="gp-rating-confidence-control gp-bare-field">
          <label>How certain are you?</label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={confidence.percent}
            aria-label="Confidence percent"
            style={{ '--gp-rating-progress': `${confidence.percent}%` } as CSSProperties}
            onChange={(event) => setState({ ...state, percent: Number(event.target.value) })}
          />
        </div>
      </div>
      <div className="gp-rating-evidence gp-bare-field">
        <input
          value={confidence.evidence}
          aria-label="Evidence note"
          placeholder="What makes you confident?"
          onChange={(event) => setState({ ...state, evidence: event.target.value })}
        />
      </div>
    </>
  )
}

/**
 * One rating, seven low-friction ways to express it. Every presentation writes
 * the same 0–5 `value`; Rubric and Confidence keep only their optional detail
 * in isolated skin state.
 */
export function RatingWidget({
  data,
  onChange,
  skin: requestedSkin,
}: RatingWidgetProps) {
  const skin = ratingSkinMode(requestedSkin ?? data.skin)
  const value = clampRating(data.value)
  const patch = (next: Partial<RatingData>) => onChange({ ...data, ...next, skin })
  const choose = (next: number) => patch({ value: clampRating(next) })
  const state = skinStateFor(data, skin)
  const setState = (next: WidgetSkinState, nextValue = value) => {
    onChange(dataWithSkinState(
      { ...data, skin, value: clampRating(nextValue) } as ModuleData,
      skin,
      next,
    ) as RatingData)
  }

  let body
  if (skin === 'slider') body = <SliderSkin value={value} choose={choose} />
  else if (skin === 'emoji') body = <EmojiSkin value={value} choose={choose} />
  else if (skin === 'traffic_light') body = <TrafficLightSkin value={value} choose={choose} />
  else if (skin === 'nps') body = <NpsSkin value={value} choose={choose} />
  else if (skin === 'rubric') {
    body = <RubricSkin value={value} state={state} setState={setState} />
  } else if (skin === 'confidence') {
    body = <ConfidenceSkin value={value} choose={choose} state={state} setState={setState} />
  } else {
    body = <StarsSkin value={value} choose={choose} />
  }

  return (
    <div className="gp-rating" data-rating-skin={skin}>
      <RatingLabel value={data.label} onChange={(label) => patch({ label })} />
      <div className="gp-rating-body">{body}</div>
    </div>
  )
}
