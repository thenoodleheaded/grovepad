/**
 * Toggle skin data and the pure helpers its renderer and resting face share.
 *
 * `ToggleData.value` is the one canonical boolean — it is what the circuit
 * reads, what a wire carries, and what the `reset` command clears. Every skin
 * writes exactly that field. A skin's own extras (two segment labels, the
 * third tri-state position) live in its own pocket of `skinStates`, so
 * switching presentation never changes what the card emits.
 */

export type ToggleSkinMode =
  | 'switch'
  | 'checkbox'
  | 'power'
  | 'segment'
  | 'availability'
  | 'tri_state'

/** Off and On mirror `value`; Unset is "nobody has decided yet". */
export type ToggleTriState = 'off' | 'unset' | 'on'

const SKIN_MODES = new Set<ToggleSkinMode>([
  'switch',
  'checkbox',
  'power',
  'segment',
  'availability',
  'tri_state',
])

export function toggleSkinMode(raw: unknown): ToggleSkinMode {
  return typeof raw === 'string' && SKIN_MODES.has(raw as ToggleSkinMode)
    ? raw as ToggleSkinMode
    : 'switch'
}

/**
 * The stored third position is advisory: `value` is still the truth. A record
 * claiming `unset` while `value` is true has been edited by something that
 * only knew about the boolean (a wire write, the `reset` command, an older
 * build), and the boolean wins.
 */
export function toggleTriState(raw: unknown, value: boolean): ToggleTriState {
  if (value) return 'on'
  return raw === 'unset' ? 'unset' : 'off'
}

/** Cycles Off → Unset → On → Off, and reports the boolean each lands on. */
export function nextTriState(current: ToggleTriState): ToggleTriState {
  if (current === 'off') return 'unset'
  if (current === 'unset') return 'on'
  return 'off'
}

/**
 * Native radio groups move with the arrow keys as one control. Our three
 * positions are buttons so the sliding marker can stay one continuous piece;
 * this gives them the same keyboard contract without coupling it to React.
 */
export function triStateForKey(
  current: ToggleTriState,
  key: string,
): ToggleTriState | null {
  if (key === 'Home') return 'off'
  if (key === 'End') return 'on'
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return current === 'off' ? 'unset' : current === 'unset' ? 'on' : 'off'
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return current === 'off' ? 'on' : current === 'unset' ? 'off' : 'unset'
  }
  return null
}

export interface ToggleSegmentLabels {
  on: string
  off: string
}

function trimmedLabel(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.trim() ? raw.slice(0, 24) : fallback
}

export function toggleSegmentLabels(state: Record<string, unknown>): ToggleSegmentLabels {
  return {
    on: trimmedLabel(state.onLabel, 'On'),
    off: trimmedLabel(state.offLabel, 'Off'),
  }
}

interface StateWords {
  on: string
  off: string
  unset?: string
}

/** Each skin's own language for the same boolean. */
const STATE_WORDS: Record<ToggleSkinMode, StateWords> = {
  switch: { on: 'On', off: 'Off' },
  checkbox: { on: 'Done', off: 'To do' },
  power: { on: 'Armed', off: 'Disarmed' },
  segment: { on: 'On', off: 'Off' },
  availability: { on: 'Available', off: 'Busy' },
  tri_state: { on: 'On', off: 'Off', unset: 'Unset' },
}

/**
 * The word this card shows for its current state — used by the renderer and
 * by the resting tile, so a folded Availability card says "Busy" rather than
 * the generic "Off" it used to.
 */
export function toggleStateLabel(
  skin: ToggleSkinMode,
  value: boolean,
  state: Record<string, unknown> = {},
): string {
  if (skin === 'segment') {
    const labels = toggleSegmentLabels(state)
    return value ? labels.on : labels.off
  }
  const words = STATE_WORDS[skin]
  if (skin === 'tri_state' && toggleTriState(state.state, value) === 'unset') {
    return words.unset ?? 'Unset'
  }
  return value ? words.on : words.off
}

/**
 * Availability speaks in status colour rather than the card's accent: green
 * and amber mean the same thing here as everywhere else in the product, and
 * borrowing the widget's hue for them would make the status unreadable on a
 * card whose accent is already green.
 */
export const AVAILABILITY_COLORS = { on: '#34d399', off: '#f59e0b' } as const
