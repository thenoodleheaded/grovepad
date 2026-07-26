import { describe, expect, it } from 'vitest'
import type { BulletsData } from '../types/spatial'
import { commandsFor } from './fields'
import { widgetDefinition } from './registry'

describe('Bullets widget skins', () => {
  it('offers all six Bullets experiences through the skin field', () => {
    const definition = widgetDefinition('bullets')
    expect(definition.skinField).toBe('skin')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'dots',
      'numbered',
      'compact_chips',
      'two_column',
      'nested_outline',
      'rolling_log',
    ])
  })

  it('keeps the specialist controls inside the renderer', () => {
    expect(widgetDefinition('bullets').rendererOwnedSkinDetails).toEqual([
      'nested_outline',
      'rolling_log',
    ])
  })

  it('preserves the chosen skin and its state when a circuit adds a bullet', () => {
    const command = commandsFor('bullets').find(
      (descriptor) => descriptor.key === 'add_item',
    )
    const data: BulletsData = {
      items: [{ id: 'one', text: 'Existing' }],
      skin: 'rolling_log',
      skinStates: { rolling_log: { order: 'oldest' } },
    }
    const next = command?.run(data, 'From circuit') as BulletsData
    expect(next.skin).toBe('rolling_log')
    expect(next.skinStates?.rolling_log?.order).toBe('oldest')
    const timestamp = Object.values(
      next.skinStates?.rolling_log?.timestamps as Record<string, string>,
    )[0]
    expect(Number.isFinite(Date.parse(timestamp!))).toBe(true)
    expect(next.items.map((item) => item.text)).toEqual(['Existing', 'From circuit'])
  })
})
