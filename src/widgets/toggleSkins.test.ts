import { describe, expect, it } from 'vitest'
import type { ToggleData } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { commandsFor, fieldDescriptor } from './fields'
import { MEDIA_INPUT_WIDGET_DEFINITIONS } from './registry/mediaInputWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = ['switch', 'checkbox', 'power', 'segment', 'availability', 'tri_state']

describe('Toggle skin registry contract', () => {
  it('offers every designed Toggle experience in catalogue order', () => {
    expect(
      skinsFor({ type: 'toggle' }, WIDGET_REGISTRY.toggle).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('names every Toggle skin by hand, each with its own icon', () => {
    const declared = MEDIA_INPUT_WIDGET_DEFINITIONS.toggle.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  /**
   * `value` is the circuit's canonical boolean: a wire writes it, the `reset`
   * command clears it, and a gate reads it. Persisting the chosen skin
   * anywhere near it — or letting the catalogue merge move the field to `mode`,
   * which `ToggleData` does not have — would silently reset every skinned card.
   */
  it('persists the chosen skin in `skin` and never disturbs `value`', () => {
    expect(WIDGET_REGISTRY.toggle.skinField).toBe('skin')

    const original = { label: 'Venue confirmed', value: true } as ToggleData
    const next = dataWearingSkin(
      { type: 'toggle', data: original },
      'availability',
      WIDGET_REGISTRY.toggle,
    ) as ToggleData

    expect(next.skin).toBe('availability')
    expect(next.value).toBe(true)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps one skin’s specialist state when another is worn', () => {
    const withSegment = dataWithSkinState(
      { label: 'Deploy target', value: false, skin: 'segment' } as ToggleData,
      'segment',
      { onLabel: 'Production', offLabel: 'Staging' },
    ) as ToggleData
    const worn = dataWearingSkin(
      { type: 'toggle', data: withSegment },
      'tri_state',
      WIDGET_REGISTRY.toggle,
    ) as ToggleData

    expect(worn.skin).toBe('tri_state')
    expect(worn.skinStates?.segment).toEqual({ onLabel: 'Production', offLabel: 'Staging' })
  })

  /**
   * A wire writing this card, or the `reset` command clearing it, must change
   * the boolean and nothing else. Losing `skin` here would silently snap a
   * skinned card back to the plain switch the moment a circuit ran.
   */
  it('survives a wire write and a reset with its skin intact', () => {
    const worn = {
      label: 'Deploy target',
      value: false,
      skin: 'segment',
      skinStates: { segment: { onLabel: 'Production' } },
    } as ToggleData

    const write = fieldDescriptor('toggle', 'value')?.set
    expect(write, 'the value field must stay writable for wires').toBeDefined()
    const written = write!(worn, true) as ToggleData
    expect(written.value).toBe(true)
    expect(written.skin).toBe('segment')
    expect(written.skinStates?.segment).toEqual({ onLabel: 'Production' })

    const reset = commandsFor('toggle').find((command) => command.key === 'reset')
    expect(reset).toBeDefined()
    const cleared = reset!.run(written) as ToggleData
    expect(cleared.value).toBe(false)
    expect(cleared.skin).toBe('segment')
    expect(cleared.skinStates?.segment).toEqual({ onLabel: 'Production' })
  })

  it('lets the renderer own the skin that keeps a third position', () => {
    expect(WIDGET_REGISTRY.toggle.rendererOwnedSkinDetails).toEqual(['tri_state'])
    for (const skin of skinsFor({ type: 'toggle' }, WIDGET_REGISTRY.toggle)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(
        WIDGET_REGISTRY.toggle.rendererOwnedSkinDetails,
        `${skin.value} needs a renderer-owned detail editor`,
      ).toContain(skin.value)
    }
  })

  // The resting tile is the card's content drawn as itself, so a folded
  // Availability card must say "Busy", not the generic "Off".
  it('rests as the skin’s own word for the state', () => {
    const face = (data: Partial<ToggleData>) => restingFace({
      type: 'toggle',
      title: 'Desk',
      size: { width: 240, height: 160 },
      data: { label: 'Desk', value: false, ...data } as ToggleData,
    }).model

    expect(face({ skin: 'availability' })).toMatchObject({ kind: 'boolean', label: 'Busy' })
    expect(face({ skin: 'availability', value: true })).toMatchObject({ label: 'Available' })
    expect(face({ skin: 'power' })).toMatchObject({ label: 'Disarmed' })
    expect(face({ skin: 'checkbox', value: true })).toMatchObject({ label: 'Done' })
    expect(face({})).toMatchObject({ label: 'Off' })
    // A segmented control that folded to its winner alone would read as a
    // label, so both choices stay on screen with the taken one filled.
    expect(face({
      skin: 'segment',
      value: true,
      skinStates: { segment: { onLabel: 'Production' } },
    })).toMatchObject({
      kind: 'chips',
      chips: [
        { text: 'Off', filled: false },
        { text: 'Production', filled: true },
      ],
    })
    expect(face({ skin: 'tri_state', skinStates: { tri_state: { state: 'unset' } } }))
      .toMatchObject({
        kind: 'chips',
        chips: [
          { text: 'Off', filled: false },
          { text: 'Unset', filled: true },
          { text: 'On', filled: false },
        ],
      })
  })
})
