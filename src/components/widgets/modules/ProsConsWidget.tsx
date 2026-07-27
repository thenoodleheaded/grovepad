import {
  Check,
  CornerDownRight,
  Gavel,
  Minus,
  Plus,
  Scale,
  ShieldAlert,
  Swords,
  Undo2,
  X,
} from 'lucide-react'
import { type ReactNode } from 'react'
import type {
  ProsConsData,
  ProsConsItem,
  ProsConsSkinMode,
} from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'
import {
  dataWithAddedItem,
  dataWithDebateCounter,
  dataWithItemText,
  dataWithProsConsWeight,
  dataWithRedTeamDetail,
  dataWithReversibility,
  dataWithoutItem,
  debatePairs,
  irreversibleCount,
  MAX_WEIGHT,
  MIN_WEIGHT,
  prosConsItems,
  prosConsSkinMode,
  prosConsVerdict,
  prosConsWeights,
  redTeamDetail,
  redTeamDetails,
  redTeamExposure,
  reversibilityFor,
  reversibilityMap,
  statedItems,
  unpairedCons,
  weightFor,
  weightedVerdict,
  type ProsConsSide,
  type RedTeamSeverity,
} from './prosConsSkinModel'

interface ProsConsWidgetProps {
  data: ProsConsData
  onChange: (data: ProsConsData) => void
}

const SEVERITIES: readonly RedTeamSeverity[] = ['low', 'medium', 'high']

const SKIN_COPY: Record<ProsConsSkinMode, {
  eyebrow: string
  topic: string
  proLabel: string
  conLabel: string
  proPlaceholder: string
  conPlaceholder: string
}> = {
  balance: {
    eyebrow: 'Weighing up',
    topic: "What's the decision?",
    proLabel: 'Pros',
    conLabel: 'Cons',
    proPlaceholder: 'A reason to go ahead…',
    conPlaceholder: 'A reason to hold back…',
  },
  debate: {
    eyebrow: 'Both sides',
    topic: "What's the motion?",
    proLabel: 'For',
    conLabel: 'Against',
    proPlaceholder: 'State the case for…',
    conPlaceholder: 'State the case against…',
  },
  red_team: {
    eyebrow: 'Attack the plan',
    topic: 'What are we stress-testing?',
    proLabel: 'Claims',
    conLabel: 'Failure modes',
    proPlaceholder: 'What we believe is true…',
    conPlaceholder: 'How could this break?',
  },
  weighted_trade_off: {
    eyebrow: 'Weighted call',
    topic: "What's the trade-off?",
    proLabel: 'Upside',
    conLabel: 'Downside',
    proPlaceholder: 'What we gain…',
    conPlaceholder: 'What it costs…',
  },
  reversible_irreversible: {
    eyebrow: 'How undoable?',
    topic: 'What are we committing to?',
    proLabel: 'Benefits',
    conLabel: 'Consequences',
    proPlaceholder: 'A benefit of deciding…',
    conPlaceholder: 'A consequence of deciding…',
  },
}

function skinIcon(skin: ProsConsSkinMode): ReactNode {
  if (skin === 'debate') return <Swords size={12} aria-hidden />
  if (skin === 'red_team') return <ShieldAlert size={12} aria-hidden />
  if (skin === 'weighted_trade_off') return <Gavel size={12} aria-hidden />
  if (skin === 'reversible_irreversible') return <Undo2 size={12} aria-hidden />
  return <Scale size={12} aria-hidden />
}

/**
 * One shared balance bar. Every skin scores the same two lists — plain counts,
 * or weighted sums — so the meter is written once and told what to show.
 */
function BalanceMeter({
  proShare,
  proLabel,
  conLabel,
  proValue,
  conValue,
  unit,
}: {
  proShare: number
  proLabel: string
  conLabel: string
  proValue: number
  conValue: number
  unit: string
}) {
  const stated = proValue + conValue > 0
  return (
    <div className="gp-pc-meter" data-stated={stated || undefined}>
      <div
        className="gp-pc-meter-track"
        role="img"
        aria-label={
          stated
            ? `${proLabel} ${proValue} ${unit} against ${conLabel} ${conValue} ${unit}`
            : 'Nothing weighed yet'
        }
      >
        <span className="gp-pc-meter-pro" style={{ inlineSize: `${proShare}%` }} />
        <span className="gp-pc-meter-con" style={{ inlineSize: `${100 - proShare}%` }} />
        <span className="gp-pc-meter-pivot" aria-hidden />
      </div>
      <div className="gp-pc-meter-legend">
        <span data-side="pro"><b>{proValue}</b>{proLabel}</span>
        <span data-side="con">{conLabel}<b>{conValue}</b></span>
      </div>
    </div>
  )
}

/** Two-column argument sheet — weigh a decision at a glance. */
export function ProsConsWidget({ data, onChange }: ProsConsWidgetProps) {
  const skin = prosConsSkinMode(data.skin)
  const copy = SKIN_COPY[skin]
  const pros = prosConsItems(data.pros)
  const cons = prosConsItems(data.cons)

  const base = (): ProsConsData => ({ ...data, skin, pros, cons })
  const setText = (side: ProsConsSide, id: string, text: string) =>
    onChange(dataWithItemText(base(), side, id, text))
  const addItem = (side: ProsConsSide) => onChange(dataWithAddedItem(base(), side))
  const removeItem = (side: ProsConsSide, id: string) =>
    onChange(dataWithoutItem(base(), side, id))

  /**
   * A point is a sentence, not a token, and the paired columns are narrow. The
   * wrapper mirrors the text in a hidden pseudo-element so the row grows to fit
   * instead of clipping mid-word — no measurement pass, no resize timer.
   */
  const pointInput = (
    side: ProsConsSide,
    item: ProsConsItem,
    placeholder: string,
    label: string,
  ) => (
    <div
      className="gp-bare-field gp-pc-point-field"
      data-value={item.text || placeholder}
    >
      <textarea
        rows={1}
        value={item.text}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => setText(side, item.id, event.target.value)}
      />
    </div>
  )

  const removeButton = (side: ProsConsSide, item: ProsConsItem) => (
    <button
      type="button"
      aria-label={`Remove ${item.text || 'empty point'}`}
      onClick={() => removeItem(side, item.id)}
      className="gp-pc-remove"
    >
      <X size={10} aria-hidden />
    </button>
  )

  const addButton = (side: ProsConsSide, label: string) => (
    <button
      type="button"
      onClick={() => addItem(side)}
      aria-label={`Add ${label.toLowerCase()} point`}
      className="gp-pc-add"
      data-side={side}
    >
      <Plus size={10} aria-hidden />
      Add
    </button>
  )

  let content: ReactNode

  if (skin === 'balance') {
    const verdict = prosConsVerdict({ pros, cons })
    const column = (side: ProsConsSide, items: ProsConsItem[]) => {
      const label = side === 'pro' ? copy.proLabel : copy.conLabel
      const placeholder = side === 'pro' ? copy.proPlaceholder : copy.conPlaceholder
      return (
        // Paired alternatives never scale asymmetrically (glass constitution symmetry rule).
        <WidgetPanel grip={false} floor="rigid" className={`gp-pc-column gp-pc-column-${side}`}>
          <header>
            <span>{label}</span>
            <b>{statedItems(items).length}</b>
          </header>
          <div className="gp-pc-column-body">
            {items.map((item) => (
              <div key={item.id} className="gp-pc-row" data-side={side}>
                <span aria-hidden className="gp-pc-dot" />
                {pointInput(side, item, placeholder, `${label} point`)}
                {removeButton(side, item)}
              </div>
            ))}
            {addButton(side, label)}
          </div>
        </WidgetPanel>
      )
    }
    content = (
      <>
        <BalanceMeter
          proShare={verdict.proShare}
          proLabel={copy.proLabel}
          conLabel={copy.conLabel}
          proValue={verdict.pros}
          conValue={verdict.cons}
          unit="points"
        />
        <div className="gp-pc-columns">
          {column('pro', pros)}
          {column('con', cons)}
        </div>
      </>
    )
  } else if (skin === 'debate') {
    const pairs = debatePairs({ pros, cons, skinStates: data.skinStates })
    const orphans = unpairedCons({ pros, cons })
    content = (
      <div className="gp-pc-stage">
        {pairs.map((pair, index) => (
          <WidgetPanel
            key={pair.pro.id}
            grip={false}
            floor="controls"
            className="gp-pc-exchange"
          >
            <span className="gp-pc-exchange-index" aria-hidden>{index + 1}</span>
            <div className="gp-pc-speech" data-side="pro">
              <span className="gp-pc-speech-label">{copy.proLabel}</span>
              {pointInput('pro', pair.pro, copy.proPlaceholder, `${copy.proLabel} argument`)}
            </div>
            <div className="gp-pc-rebuttal">
              <CornerDownRight size={10} aria-hidden />
              <div
                className="gp-bare-field gp-pc-point-field"
                data-value={pair.counter || 'Rebut it directly…'}
              >
                <textarea
                  rows={1}
                  value={pair.counter}
                  placeholder="Rebut it directly…"
                  aria-label={`Rebuttal to ${pair.pro.text || `argument ${index + 1}`}`}
                  onChange={(event) => onChange(
                    dataWithDebateCounter(base(), pair.pro.id, event.target.value),
                  )}
                />
              </div>
            </div>
            {pair.con && (
              <div className="gp-pc-speech" data-side="con">
                <span className="gp-pc-speech-label">{copy.conLabel}</span>
                {pointInput('con', pair.con, copy.conPlaceholder, `${copy.conLabel} argument`)}
              </div>
            )}
            {removeButton('pro', pair.pro)}
          </WidgetPanel>
        ))}
        {orphans.map((con) => (
          <WidgetPanel
            key={con.id}
            grip={false}
            floor="controls"
            className="gp-pc-exchange gp-pc-exchange-unpaired"
          >
            <div className="gp-pc-speech" data-side="con">
              <span className="gp-pc-speech-label">{copy.conLabel}</span>
              {pointInput('con', con, copy.conPlaceholder, `${copy.conLabel} argument`)}
            </div>
            {removeButton('con', con)}
          </WidgetPanel>
        ))}
        <div className="gp-pc-stage-actions">
          {addButton('pro', copy.proLabel)}
          {addButton('con', copy.conLabel)}
        </div>
      </div>
    )
  } else if (skin === 'red_team') {
    const details = redTeamDetails(data)
    const exposure = redTeamExposure({ cons, skinStates: data.skinStates })
    content = (
      <div className="gp-pc-redteam">
        <section className="gp-pc-claims">
          <header>
            <span>{copy.proLabel}</span>
            <b>{statedItems(pros).length}</b>
          </header>
          {pros.map((item) => (
            <div key={item.id} className="gp-pc-claim">
              <Check size={10} aria-hidden />
              {pointInput('pro', item, copy.proPlaceholder, 'Claim under test')}
              {removeButton('pro', item)}
            </div>
          ))}
          {addButton('pro', copy.proLabel)}
        </section>

        <section className="gp-pc-attacks">
          <header>
            <span>{copy.conLabel}</span>
            <b data-alert={exposure.unanswered > 0 || undefined}>
              {exposure.unanswered > 0
                ? `${exposure.unanswered} unanswered`
                : `${statedItems(cons).length} logged`}
            </b>
          </header>
          {cons.map((item) => {
            const detail = redTeamDetail(details, item.id)
            return (
              <WidgetPanel
                key={item.id}
                grip={false}
                floor="controls"
                className={`gp-pc-attack gp-pc-attack-${detail.severity}`}
              >
                <div className="gp-pc-attack-head">
                  <ShieldAlert size={11} aria-hidden />
                  {pointInput('con', item, copy.conPlaceholder, 'Failure mode')}
                  <div className="gp-pc-severity" role="group" aria-label="Severity">
                    {SEVERITIES.map((severity) => (
                      <button
                        key={severity}
                        type="button"
                        data-severity={severity}
                        aria-pressed={detail.severity === severity}
                        aria-label={`${severity} severity`}
                        title={`${severity} severity`}
                        onClick={() => onChange(
                          dataWithRedTeamDetail(base(), item.id, { severity }),
                        )}
                      />
                    ))}
                  </div>
                  {removeButton('con', item)}
                </div>
                <label className="gp-pc-evidence gp-bare-field">
                  <span>Evidence that answers it</span>
                  <input
                    value={detail.evidence}
                    placeholder="What would prove this wrong?"
                    aria-label="Evidence that answers this failure mode"
                    onChange={(event) => onChange(
                      dataWithRedTeamDetail(base(), item.id, { evidence: event.target.value }),
                    )}
                  />
                </label>
              </WidgetPanel>
            )
          })}
          {addButton('con', copy.conLabel)}
        </section>
      </div>
    )
  } else if (skin === 'weighted_trade_off') {
    const weights = prosConsWeights(data)
    const verdict = weightedVerdict({ pros, cons, skinStates: data.skinStates })
    const weighted = (side: ProsConsSide, items: ProsConsItem[]) => {
      const label = side === 'pro' ? copy.proLabel : copy.conLabel
      const placeholder = side === 'pro' ? copy.proPlaceholder : copy.conPlaceholder
      return (
        <WidgetPanel grip={false} floor="rigid" className={`gp-pc-column gp-pc-column-${side}`}>
          <header>
            <span>{label}</span>
            <b>{side === 'pro' ? verdict.pros : verdict.cons}</b>
          </header>
          <div className="gp-pc-column-body">
            {items.map((item) => {
              const weight = weightFor(weights, item.id)
              return (
                <div key={item.id} className="gp-pc-weighted" data-side={side}>
                  {pointInput(side, item, placeholder, `${label} point`)}
                  <div className="gp-pc-dial">
                    <button
                      type="button"
                      aria-label={`Lower importance of ${item.text || 'this point'}`}
                      disabled={weight <= MIN_WEIGHT}
                      onClick={() => onChange(
                        dataWithProsConsWeight(base(), item.id, weight - 1),
                      )}
                    >
                      <Minus size={9} aria-hidden />
                    </button>
                    <span
                      className="gp-pc-pips"
                      role="img"
                      aria-label={`Importance ${weight} of ${MAX_WEIGHT}`}
                    >
                      {Array.from({ length: MAX_WEIGHT }, (_unused, index) => (
                        <i key={index} data-on={index < weight || undefined} aria-hidden />
                      ))}
                    </span>
                    <button
                      type="button"
                      aria-label={`Raise importance of ${item.text || 'this point'}`}
                      disabled={weight >= MAX_WEIGHT}
                      onClick={() => onChange(
                        dataWithProsConsWeight(base(), item.id, weight + 1),
                      )}
                    >
                      <Plus size={9} aria-hidden />
                    </button>
                  </div>
                  {removeButton(side, item)}
                </div>
              )
            })}
            {addButton(side, label)}
          </div>
        </WidgetPanel>
      )
    }
    content = (
      <>
        <BalanceMeter
          proShare={verdict.proShare}
          proLabel={copy.proLabel}
          conLabel={copy.conLabel}
          proValue={verdict.pros}
          conValue={verdict.cons}
          unit="weight"
        />
        <div className="gp-pc-columns">
          {weighted('pro', pros)}
          {weighted('con', cons)}
        </div>
      </>
    )
  } else {
    const map = reversibilityMap(data)
    const all: Array<{ side: ProsConsSide; item: ProsConsItem }> = [
      ...pros.map((item) => ({ side: 'pro' as const, item })),
      ...cons.map((item) => ({ side: 'con' as const, item })),
    ]
    const lane = (value: 'reversible' | 'irreversible') => {
      const entries = all.filter(({ item }) => reversibilityFor(map, item.id) === value)
      return (
        <WidgetPanel grip={false} floor="rigid" className={`gp-pc-lane gp-pc-lane-${value}`}>
          <header>
            {value === 'reversible'
              ? <Undo2 size={11} aria-hidden />
              : <ShieldAlert size={11} aria-hidden />}
            <span>{value === 'reversible' ? 'Reversible' : 'Irreversible'}</span>
            <b>{entries.filter(({ item }) => item.text.trim()).length}</b>
          </header>
          <p className="gp-pc-lane-note">
            {value === 'reversible'
              ? 'Undo costs time, not much else.'
              : "Once done, it can't be taken back."}
          </p>
          <div className="gp-pc-lane-body">
            {entries.map(({ side, item }) => (
              <div key={item.id} className="gp-pc-consequence" data-side={side}>
                <span aria-hidden className="gp-pc-dot" />
                {pointInput(
                  side,
                  item,
                  side === 'pro' ? copy.proPlaceholder : copy.conPlaceholder,
                  side === 'pro' ? `${copy.proLabel} point` : `${copy.conLabel} point`,
                )}
                <button
                  type="button"
                  className="gp-pc-flip"
                  aria-label={`Mark ${item.text || 'this point'} ${
                    value === 'reversible' ? 'irreversible' : 'reversible'
                  }`}
                  title={value === 'reversible' ? 'Move to irreversible' : 'Move to reversible'}
                  onClick={() => onChange(dataWithReversibility(
                    base(),
                    item.id,
                    value === 'reversible' ? 'irreversible' : 'reversible',
                  ))}
                >
                  <Undo2 size={10} aria-hidden />
                </button>
                {removeButton(side, item)}
              </div>
            ))}
            {entries.length === 0 && (
              <p className="gp-pc-lane-empty">
                {value === 'reversible'
                  ? 'Nothing here you can walk back.'
                  : 'No one-way doors yet.'}
              </p>
            )}
          </div>
        </WidgetPanel>
      )
    }
    content = (
      <>
        <div className="gp-pc-lanes">
          {lane('reversible')}
          {lane('irreversible')}
        </div>
        <div className="gp-pc-stage-actions">
          {addButton('pro', copy.proLabel)}
          {addButton('con', copy.conLabel)}
        </div>
      </>
    )
  }

  const irreversible = skin === 'reversible_irreversible'
    ? irreversibleCount({ pros, cons, skinStates: data.skinStates })
    : 0

  return (
    <div className="gp-pros-cons" data-pros-cons-skin={skin}>
      <header className="gp-pc-header">
        <span className="gp-pc-eyebrow">
          {skinIcon(skin)}
          {copy.eyebrow}
        </span>
        {irreversible > 0 && (
          <span className="gp-pc-flag">
            <ShieldAlert size={9} aria-hidden />
            {irreversible} one-way
          </span>
        )}
      </header>

      <WidgetPanel grip={false} floor="rigid" className="gp-pc-topic">
        <div className="gp-bare-field">
          <input
            value={data.topic}
            placeholder={copy.topic}
            aria-label="Decision topic"
            onChange={(event) => onChange({ ...base(), topic: event.target.value })}
          />
        </div>
      </WidgetPanel>

      {content}
    </div>
  )
}
