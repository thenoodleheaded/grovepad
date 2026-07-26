import { describe, expect, it } from 'vitest'
import type { NotesData } from '../types/spatial'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { WIDGET_REGISTRY } from './registry'
import { STRUCTURE_NOTES_WIDGET_DEFINITIONS } from './registry/structureNotesWidgets'

describe('Note skin registry contract', () => {
  const expected = [
    'plain',
    'sticky',
    'quote',
    'daily_log',
    'markdown_page',
    'typewriter',
    'callout',
    'versioned_note',
  ]

  it('offers every designed Note experience in stable order', () => {
    expect(
      skinsFor({ type: 'notes' }, WIDGET_REGISTRY.notes).map((skin) => skin.value),
    ).toEqual(expected)
    expect(WIDGET_REGISTRY.notes.rendererOwnedSkinDetails).toEqual(['versioned_note'])
  })

  // The catalogue merge gives a generated skin one icon per presentation
  // family, which put a bar chart on Markdown Page, a checklist on Typewriter,
  // and a grid on Versioned Note. Declaring all eight by hand is what keeps
  // each Note skin wearing an icon that says what it is.
  it('names every Note skin in the hand-authored registry, each with its own icon', () => {
    const declared = STRUCTURE_NOTES_WIDGET_DEFINITIONS.notes.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)

    const icons = new Set(declared.map((skin) => skin.icon))
    expect(icons.size).toBe(expected.length)
  })

  it('keeps shared writing and specialist state when switching skins', () => {
    const original = dataWithSkinState(
      {
        text: 'Keep this writing',
        mode: 'callout',
        color: 'yellow',
        attribution: '',
      } as NotesData,
      'callout',
      { tone: 'warning' },
    ) as NotesData
    const next = dataWearingSkin(
      { type: 'notes', data: original },
      'markdown_page',
      WIDGET_REGISTRY.notes,
    ) as NotesData

    expect(next.text).toBe('Keep this writing')
    expect(next.mode).toBe('markdown_page')
    expect(next.skinStates?.callout).toEqual({ tone: 'warning' })
  })
})
