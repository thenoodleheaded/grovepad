import { describe, expect, it } from 'vitest'
import type { TextData } from '../types/spatial'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { fieldsFor } from './fields'
import { WIDGET_REGISTRY } from './registry'
import { STRUCTURE_NOTES_WIDGET_DEFINITIONS } from './registry/structureNotesWidgets'

describe('Text skin registry contract', () => {
  const expected = ['plain', 'sticky', 'typewriter']

  it('offers every designed Text experience in stable order', () => {
    expect(
      skinsFor({ type: 'text' }, WIDGET_REGISTRY.text).map((skin) => skin.value),
    ).toEqual(expected)
  })

  // The catalogue merge gives a generated skin one icon per presentation
  // family, which put a checklist on Typewriter. Declaring all three by hand
  // is what keeps each Text skin wearing an icon that says what it is.
  it('names every Text skin in the hand-authored registry, each with its own icon', () => {
    const declared = STRUCTURE_NOTES_WIDGET_DEFINITIONS.text.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)

    const icons = new Set(declared.map((skin) => skin.icon))
    expect(icons.size).toBe(expected.length)
  })

  it('keeps shared writing and specialist state when switching skins', () => {
    const original = dataWithSkinState(
      {
        text: 'Keep this writing',
        mode: 'typewriter',
        color: 'yellow',
      } as TextData,
      'typewriter',
      { focusMode: true },
    ) as TextData
    const next = dataWearingSkin(
      { type: 'text', data: original },
      'plain',
      WIDGET_REGISTRY.text,
    ) as TextData

    expect(next.text).toBe('Keep this writing')
    expect(next.mode).toBe('plain')
    expect(next.skinStates?.typewriter).toEqual({ focusMode: true })
  })

  it('exposes the writing itself as the one port a Text card carries', () => {
    const fields = fieldsFor('text')
    expect(fields.map((field) => field.key)).toEqual(['text'])

    const data = { text: 'Main notes', mode: 'plain' } as TextData
    expect(fields[0]?.get(data)).toBe('Main notes')
    expect(fields[0]?.set?.(data, 'Rewritten')).toMatchObject({ text: 'Rewritten' })
  })
})
