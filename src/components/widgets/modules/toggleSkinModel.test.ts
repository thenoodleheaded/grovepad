import { describe, expect, it } from 'vitest'
import {
  nextTriState,
  toggleSegmentLabels,
  toggleSkinMode,
  toggleStateLabel,
  toggleTriState,
  triStateForKey,
} from './toggleSkinModel'

describe('Toggle skin state', () => {
  it('falls back to the sliding switch for an unknown skin', () => {
    expect(toggleSkinMode('power')).toBe('power')
    expect(toggleSkinMode('not_a_skin')).toBe('switch')
    expect(toggleSkinMode(undefined)).toBe('switch')
  })

  /**
   * `value` is what a wire carries and what the `reset` command clears, so a
   * stored third position that disagrees with it has been overwritten by
   * something that only knew about the boolean. The boolean wins.
   */
  it('lets the canonical boolean overrule a stale third position', () => {
    expect(toggleTriState('unset', false)).toBe('unset')
    expect(toggleTriState('unset', true)).toBe('on')
    expect(toggleTriState('off', false)).toBe('off')
    expect(toggleTriState('nonsense', false)).toBe('off')
    expect(toggleTriState(undefined, true)).toBe('on')
  })

  it('cycles the three positions in one direction', () => {
    expect(nextTriState('off')).toBe('unset')
    expect(nextTriState('unset')).toBe('on')
    expect(nextTriState('on')).toBe('off')
  })

  it('moves the tri-state like one native radio group from the keyboard', () => {
    expect(triStateForKey('off', 'ArrowRight')).toBe('unset')
    expect(triStateForKey('unset', 'ArrowDown')).toBe('on')
    expect(triStateForKey('on', 'ArrowRight')).toBe('off')
    expect(triStateForKey('off', 'ArrowLeft')).toBe('on')
    expect(triStateForKey('on', 'ArrowUp')).toBe('unset')
    expect(triStateForKey('unset', 'Home')).toBe('off')
    expect(triStateForKey('unset', 'End')).toBe('on')
    expect(triStateForKey('unset', 'Enter')).toBeNull()
  })

  it('names the two segment choices, with sane defaults', () => {
    expect(toggleSegmentLabels({})).toEqual({ on: 'On', off: 'Off' })
    expect(toggleSegmentLabels({ onLabel: '   ' })).toEqual({ on: 'On', off: 'Off' })
    expect(toggleSegmentLabels({ onLabel: 'Production', offLabel: 'Staging' }))
      .toEqual({ on: 'Production', off: 'Staging' })
    // A corrupt record cannot stretch the control with an essay.
    expect(toggleSegmentLabels({ onLabel: 'x'.repeat(500) }).on).toHaveLength(24)
  })

  it('gives each skin its own word for the same boolean', () => {
    expect(toggleStateLabel('switch', true)).toBe('On')
    expect(toggleStateLabel('checkbox', true)).toBe('Done')
    expect(toggleStateLabel('checkbox', false)).toBe('To do')
    expect(toggleStateLabel('power', true)).toBe('Armed')
    expect(toggleStateLabel('power', false)).toBe('Disarmed')
    expect(toggleStateLabel('availability', true)).toBe('Available')
    expect(toggleStateLabel('availability', false)).toBe('Busy')
    expect(toggleStateLabel('segment', true, { onLabel: 'Production' })).toBe('Production')
    expect(toggleStateLabel('tri_state', false, { state: 'unset' })).toBe('Unset')
    expect(toggleStateLabel('tri_state', false, { state: 'off' })).toBe('Off')
  })
})
