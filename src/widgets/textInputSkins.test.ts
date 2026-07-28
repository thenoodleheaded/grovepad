import { describe, expect, it } from 'vitest'
import type { TextInputData } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { commandsFor, fieldDescriptor } from './fields'
import { MEDIA_INPUT_WIDGET_DEFINITIONS } from './registry/mediaInputWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'single_line',
  'multiline',
  'search',
  'url',
  'email',
  'tags',
  'command',
]

describe('Text Input skin registry contract', () => {
  it('offers every designed Text Input experience in catalogue order', () => {
    expect(
      skinsFor({ type: 'text_input' }, WIDGET_REGISTRY.text_input).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('names every Text Input skin by hand, each with its own icon', () => {
    const declared = MEDIA_INPUT_WIDGET_DEFINITIONS.text_input.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  /**
   * `value` is the string a wire reads and `has_value` answers about.
   * Persisting the chosen skin anywhere near it — or letting the catalogue
   * merge move the field to `mode`, which `TextInputData` does not have —
   * would silently reset every skinned card.
   */
  it('persists the chosen skin in `skin` and never disturbs `value`', () => {
    expect(WIDGET_REGISTRY.text_input.skinField).toBe('skin')

    const original = {
      label: 'Release',
      value: 'grovepad.app',
      placeholder: '',
      multiline: false,
    } as TextInputData
    const next = dataWearingSkin(
      { type: 'text_input', data: original },
      'url',
      WIDGET_REGISTRY.text_input,
    ) as TextInputData

    expect(next.skin).toBe('url')
    expect(next.value).toBe('grovepad.app')
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps the command history when another skin is worn', () => {
    const withHistory = dataWithSkinState(
      {
        label: 'Deploy',
        value: 'build',
        placeholder: '',
        multiline: false,
        skin: 'command',
      } as TextInputData,
      'command',
      { history: ['build'], draft: 'test' },
    ) as TextInputData
    const worn = dataWearingSkin(
      { type: 'text_input', data: withHistory },
      'tags',
      WIDGET_REGISTRY.text_input,
    ) as TextInputData

    expect(worn.skin).toBe('tags')
    expect(worn.skinStates?.command).toEqual({ history: ['build'], draft: 'test' })
  })

  /**
   * A wire writing this card, or the `clear` command emptying it, must change
   * the string and nothing else. Losing `skin` here would snap a skinned card
   * back to a plain line the moment a circuit ran.
   */
  it('survives a wire write with its skin and history intact', () => {
    const worn = {
      label: 'Deploy',
      value: 'build',
      placeholder: '',
      multiline: false,
      skin: 'command',
      skinStates: { command: { history: ['build'] } },
    } as TextInputData

    const write = fieldDescriptor('text_input', 'value')?.set
    expect(write, 'the value field must stay writable for wires').toBeDefined()
    const written = write!(worn, 'test') as TextInputData
    expect(written.value).toBe('test')
    expect(written.skin).toBe('command')
    expect(written.skinStates?.command).toEqual({ history: ['build'] })

    for (const command of commandsFor('text_input')) {
      const after = command.run(written) as TextInputData
      expect(after.skin, `${command.key} must not drop the skin`).toBe('command')
    }
  })

  /**
   * A resting face is the card's information drawn as itself. `value` is not
   * one of the generic content keys, so every Text Input used to rest as a
   * blank icon no matter what it held.
   */
  it('rests as the string it emits, and as a bare icon only when empty', () => {
    const face = (value: string, skin = 'single_line') => restingFace({
      type: 'text_input',
      title: 'Board',
      size: { width: 300, height: 200 },
      data: { label: 'Board', value, placeholder: '', multiline: false, skin } as TextInputData,
    }).model

    expect(face('grovepad.app/boards')).toMatchObject({
      kind: 'text',
      text: 'grovepad.app/boards',
    })
    // Tags are a reading of that same string, so they fold to the chips the
    // open card draws rather than back to the raw comma-separated text.
    expect(face('design, release, canvas', 'tags')).toMatchObject({
      kind: 'chips',
      chips: [{ text: 'design' }, { text: 'release' }, { text: 'canvas' }],
    })
    // A command card folds to its prompt, which is what it is for.
    expect(face('npm run check', 'command')).toMatchObject({
      kind: 'lines',
      eyebrow: { label: 'Command' },
    })
    expect(face('   ')).toEqual({ kind: 'icon' })
  })

  it('lets the renderer own the skins that keep state of their own', () => {
    expect(WIDGET_REGISTRY.text_input.rendererOwnedSkinDetails).toEqual(['tags', 'command'])
    for (const skin of skinsFor({ type: 'text_input' }, WIDGET_REGISTRY.text_input)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(
        WIDGET_REGISTRY.text_input.rendererOwnedSkinDetails,
        `${skin.value} needs a renderer-owned detail editor`,
      ).toContain(skin.value)
    }
  })
})
