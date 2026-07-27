import { describe, expect, it } from 'vitest'
import type { CounterData } from '../types/spatial'
import { counterSkin } from '../components/widgets/modules/counterSkinModel'
import { currentSkin, dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { WIDGET_REGISTRY, widgetDefinition } from './registry'

describe('Counter widget skins', () => {
  it('offers all seven faces through the skin field', () => {
    const definition = widgetDefinition('counter')
    expect(definition.skinField).toBe('skin')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'tally',
      'clicker',
      'goal_counter',
      'up_down',
      'multi_counter',
      'timed_rate',
      'resetting_period',
    ])
  })

  it('keeps every offered skin one the renderer can paint', () => {
    for (const skin of skinsFor({ type: 'counter' }, WIDGET_REGISTRY.counter)) {
      expect(counterSkin(skin.value)).toBe(skin.value)
    }
  })

  it('gives every schema-extension skin a purpose-built editor', () => {
    const definition = widgetDefinition('counter')
    expect(definition.rendererOwnedSkinDetails).toEqual([
      'multi_counter',
      'timed_rate',
      'resetting_period',
    ])
    for (const skin of skinsFor({ type: 'counter' }, WIDGET_REGISTRY.counter)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(definition.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })

  it('hands every skin its own icon rather than the shared presentation glyph', () => {
    const skins = widgetDefinition('counter').skins ?? []
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(skins.length)
  })

  it('starts new cards on the tally', () => {
    const data = widgetDefinition('counter').defaultData() as CounterData
    expect(data.skin).toBe('tally')
    expect(data.count).toBe(0)
  })

  it('keeps the count and every skin\'s settings when the roller moves', () => {
    const data: CounterData = {
      label: 'Cups of tea',
      count: 12,
      step: 1,
      skin: 'tally',
      skinStates: {
        goal_counter: { target: 20 },
        multi_counter: { counters: [{ id: 'a', label: 'Green', count: 3 }] },
      },
    }
    const next = dataWearingSkin(
      { type: 'counter', data },
      'timed_rate',
      WIDGET_REGISTRY.counter,
    ) as CounterData
    expect(next.skin).toBe('timed_rate')
    // The number a circuit reads is the same whichever face is showing.
    expect(next.count).toBe(12)
    expect(next.label).toBe('Cups of tea')
    expect(next.skinStates?.goal_counter).toEqual({ target: 20 })
    expect(next.skinStates?.multi_counter).toEqual({
      counters: [{ id: 'a', label: 'Green', count: 3 }],
    })
  })

  it('reads a stale skin as the tally instead of showing nothing', () => {
    const data = { label: '', count: 0, step: 1, skin: 'retired' } as unknown as CounterData
    expect(currentSkin({ type: 'counter', data }, WIDGET_REGISTRY.counter)?.value).toBe('tally')
  })
})
