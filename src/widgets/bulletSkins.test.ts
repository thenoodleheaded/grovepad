import { describe, expect, it } from 'vitest'
import type { BulletsData } from '../types/spatial'
import { commandsFor } from './fields'
import { widgetDefinition } from './registry'

describe('Bullets widget skins', () => {
  it('offers the three Bullets experiences through the skin field', () => {
    const definition = widgetDefinition('bullets')
    expect(definition.skinField).toBe('skin')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'dots',
      'numbered',
      'nested_outline',
    ])
  })

  it('keeps the specialist controls inside the renderer', () => {
    expect(widgetDefinition('bullets').rendererOwnedSkinDetails).toEqual(['nested_outline'])
  })

  it('lets the reader set the measure down to a six-cell floor', () => {
    const { sizing } = widgetDefinition('bullets')
    // A point wraps as a paragraph, so the width is the reader's to choose —
    // but the height still follows the text.
    expect(sizing?.fixed).toBeUndefined()
    expect(sizing?.autoHeight).toBe(true)
    expect(sizing?.minWidth).toBe(6 * 40)
  })

  it('preserves the chosen skin and its state when a circuit adds a bullet', () => {
    const command = commandsFor('bullets').find(
      (descriptor) => descriptor.key === 'add_item',
    )
    const data: BulletsData = {
      items: [{ id: 'one', text: 'Existing' }],
      skin: 'nested_outline',
      skinStates: { nested_outline: { levels: { one: 0 }, collapsedIds: [] } },
    }
    const next = command?.run(data, 'From circuit') as BulletsData
    expect(next.skin).toBe('nested_outline')
    expect(next.skinStates?.nested_outline?.collapsedIds).toEqual([])
    expect(next.items.map((item) => item.text)).toEqual(['Existing', 'From circuit'])
  })
})
