import { Check, Power, Type } from 'lucide-react'
import { useState } from 'react'
import type { ModuleData, ToggleData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  AVAILABILITY_COLORS,
  toggleSegmentLabels,
  toggleStateLabel,
  toggleTriState,
  triStateForKey,
  type ToggleSkinMode,
  type ToggleTriState,
} from './toggleSkinModel'

interface ToggleWidgetProps {
  data: ToggleData
  onChange: (data: ToggleData) => void
  skin?: ToggleSkinMode
}

/* ------------------------------------------------------------------ shared */

/** The card's name. Every skin carries it; only the placement changes. */
function ToggleLabel({
  value,
  onChange,
  align = 'center',
}: {
  value: string
  onChange: (value: string) => void
  align?: 'center' | 'start'
}) {
  return (
    <div className="gp-toggle-label gp-bare-field" data-align={align}>
      <input
        value={value}
        aria-label="Toggle label"
        placeholder="Condition"
        data-floor-overflow="scroll"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/**
 * A Toggle is a logic card before it is a control: whatever the skin calls the
 * state, the boolean it actually emits is always on screen.
 */
function ToggleState({
  word,
  value,
  tone,
}: {
  word: string
  value: boolean
  tone?: string
}) {
  return (
    <p className="gp-toggle-state" data-on={value || undefined} aria-live="polite">
      <span style={tone ? { color: tone } : undefined}>{word}</span>
      <code>{String(value)}</code>
    </p>
  )
}

/* ------------------------------------------------------------------- skins */

function SwitchSkin({ data, patch }: { data: ToggleData; patch: (next: Partial<ToggleData>) => void }) {
  return (
    <div className="gp-toggle gp-toggle-switch">
      <ToggleLabel value={data.label} onChange={(label) => patch({ label })} />
      <button
        type="button"
        role="switch"
        aria-label={data.label || 'Toggle value'}
        aria-checked={data.value}
        onClick={() => patch({ value: !data.value })}
        className="gp-toggle-track"
      >
        <span aria-hidden className="gp-toggle-knob" />
      </button>
      <ToggleState word={toggleStateLabel('switch', data.value)} value={data.value} />
    </div>
  )
}

function CheckboxSkin({ data, patch }: { data: ToggleData; patch: (next: Partial<ToggleData>) => void }) {
  return (
    <div className="gp-toggle gp-toggle-checkbox">
      <div className="gp-toggle-check-row">
        <button
          type="button"
          role="checkbox"
          aria-label={data.label || 'Toggle value'}
          aria-checked={data.value}
          onClick={() => patch({ value: !data.value })}
          className="gp-toggle-box gp-check-free"
        >
          <Check size={15} strokeWidth={3} aria-hidden />
        </button>
        <ToggleLabel align="start" value={data.label} onChange={(label) => patch({ label })} />
      </div>
      <ToggleState word={toggleStateLabel('checkbox', data.value)} value={data.value} />
    </div>
  )
}

function PowerSkin({ data, patch }: { data: ToggleData; patch: (next: Partial<ToggleData>) => void }) {
  return (
    <div className="gp-toggle gp-toggle-power">
      <button
        type="button"
        role="switch"
        aria-label={data.label || 'Toggle value'}
        aria-checked={data.value}
        onClick={() => patch({ value: !data.value })}
        className="gp-toggle-power-button"
      >
        <span aria-hidden className="gp-toggle-power-ring" />
        <Power size={20} strokeWidth={2.2} aria-hidden />
      </button>
      <ToggleLabel value={data.label} onChange={(label) => patch({ label })} />
      <ToggleState word={toggleStateLabel('power', data.value)} value={data.value} />
    </div>
  )
}

function SegmentSkin({
  data,
  patch,
  state,
  setState,
}: {
  data: ToggleData
  patch: (next: Partial<ToggleData>) => void
  state: WidgetSkinState
  setState: (next: WidgetSkinState) => void
}) {
  const [naming, setNaming] = useState(false)
  const labels = toggleSegmentLabels(state)

  return (
    <div className="gp-toggle gp-toggle-segment">
      <div className="gp-toggle-segment-head">
        <ToggleLabel align="start" value={data.label} onChange={(label) => patch({ label })} />
        <button
          type="button"
          className="gp-toggle-rename"
          aria-label={naming ? 'Hide choice names' : 'Rename the two choices'}
          aria-expanded={naming}
          title="Rename the choices"
          onClick={() => setNaming((open) => !open)}
        >
          <Type size={11} aria-hidden />
        </button>
      </div>

      <div className="gp-toggle-segments" role="group" aria-label={data.label || 'Choice'} data-on={data.value || undefined}>
        <span aria-hidden className="gp-toggle-segment-marker" />
        <button type="button" aria-pressed={!data.value} onClick={() => patch({ value: false })}>
          {labels.off}
        </button>
        <button type="button" aria-pressed={data.value} onClick={() => patch({ value: true })}>
          {labels.on}
        </button>
      </div>

      {naming ? (
        <div className="gp-toggle-names gp-bare-field">
          <input
            value={typeof state.offLabel === 'string' ? state.offLabel : ''}
            aria-label="Name for the off choice"
            placeholder="Off"
            onChange={(event) => setState({ ...state, offLabel: event.target.value })}
          />
          <input
            value={typeof state.onLabel === 'string' ? state.onLabel : ''}
            aria-label="Name for the on choice"
            placeholder="On"
            onChange={(event) => setState({ ...state, onLabel: event.target.value })}
          />
        </div>
      ) : (
        <ToggleState word={toggleStateLabel('segment', data.value, state)} value={data.value} />
      )}
    </div>
  )
}

function AvailabilitySkin({ data, patch }: { data: ToggleData; patch: (next: Partial<ToggleData>) => void }) {
  const tone = data.value ? AVAILABILITY_COLORS.on : AVAILABILITY_COLORS.off
  const word = toggleStateLabel('availability', data.value)
  return (
    <div className="gp-toggle gp-toggle-availability" style={{ '--gp-toggle-status': tone } as never}>
      <button
        type="button"
        role="switch"
        aria-label={data.label ? `${data.label}: ${word}` : word}
        aria-checked={data.value}
        onClick={() => patch({ value: !data.value })}
        className="gp-toggle-presence"
      >
        <span aria-hidden className="gp-toggle-dot" data-live={data.value || undefined} />
        <strong>{word}</strong>
      </button>
      <ToggleLabel align="start" value={data.label} onChange={(label) => patch({ label })} />
      <ToggleState word={word} value={data.value} tone={tone} />
    </div>
  )
}

const TRI_ORDER: ToggleTriState[] = ['off', 'unset', 'on']
const TRI_WORDS: Record<ToggleTriState, string> = { off: 'Off', unset: 'Unset', on: 'On' }

function TriStateSkin({
  data,
  patch,
  state,
  setState,
}: {
  data: ToggleData
  patch: (next: Partial<ToggleData>) => void
  state: WidgetSkinState
  /** The third position and the canonical boolean are written together. */
  setState: (next: WidgetSkinState, value?: boolean) => void
}) {
  const current = toggleTriState(state.state, data.value)

  const choose = (next: ToggleTriState) => {
    // One write: the boolean and its third position must never disagree.
    setState({ ...state, state: next }, next === 'on')
  }

  const onRadioKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    position: ToggleTriState,
  ) => {
    const next = triStateForKey(position, event.key)
    if (!next) return
    event.preventDefault()
    choose(next)
    const index = TRI_ORDER.indexOf(next)
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('button')
      [index]?.focus()
  }

  return (
    <div className="gp-toggle gp-toggle-tri">
      <ToggleLabel align="start" value={data.label} onChange={(label) => patch({ label })} />

      <div
        className="gp-toggle-segments gp-toggle-segments--three"
        role="radiogroup"
        aria-label={data.label || 'Three-way condition'}
        data-position={current}
      >
        <span aria-hidden className="gp-toggle-segment-marker" />
        {TRI_ORDER.map((position) => (
          <button
            key={position}
            type="button"
            role="radio"
            aria-checked={current === position}
            tabIndex={current === position ? 0 : -1}
            onClick={() => choose(position)}
            onKeyDown={(event) => onRadioKeyDown(event, position)}
          >
            {TRI_WORDS[position]}
          </button>
        ))}
      </div>

      {current === 'unset' ? (
        <p className="gp-toggle-note" aria-live="polite">
          Nobody has decided yet — anything wired to this reads <code>false</code>.
        </p>
      ) : (
        <ToggleState word={TRI_WORDS[current]} value={data.value} />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- root */

/**
 * One on/off card, six ways to ask the question. Whichever skin is worn, the
 * card emits the same single boolean, and every skin keeps that boolean
 * visible — this is a logic widget before it is a control.
 */
export function ToggleWidget({ data, onChange, skin = 'switch' }: ToggleWidgetProps) {
  const patch = (next: Partial<ToggleData>) => onChange({ ...data, ...next, skin })

  const state = skinStateFor(data, skin)
  const setState = (next: WidgetSkinState, value = data.value) => {
    onChange(
      dataWithSkinState({ ...data, skin, value } as ModuleData, skin, next) as ToggleData,
    )
  }

  if (skin === 'checkbox') return <CheckboxSkin data={data} patch={patch} />
  if (skin === 'power') return <PowerSkin data={data} patch={patch} />
  if (skin === 'segment') {
    return <SegmentSkin data={data} patch={patch} state={state} setState={setState} />
  }
  if (skin === 'availability') return <AvailabilitySkin data={data} patch={patch} />
  if (skin === 'tri_state') {
    return <TriStateSkin data={data} patch={patch} state={state} setState={setState} />
  }
  return <SwitchSkin data={data} patch={patch} />
}
