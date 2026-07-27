import { describe, expect, it } from 'vitest'
import type { WorldClockData } from '../types/spatial'
import { worldClockSkin } from '../components/widgets/modules/worldClockSkinModel'
import { currentSkin, dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { WIDGET_REGISTRY, widgetDefinition } from './registry'

describe('World Clock widget skins', () => {
  it('offers all six views through the skin field', () => {
    const definition = widgetDefinition('world_clock')
    expect(definition.skinField).toBe('skin')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'city_grid',
      'analog_wall',
      'overlap_band',
      'meeting_planner',
      'travel_clock',
      'sunlight',
    ])
  })

  it('keeps every skin the renderer can actually paint', () => {
    for (const skin of skinsFor({ type: 'world_clock' }, WIDGET_REGISTRY.world_clock)) {
      expect(worldClockSkin(skin.value)).toBe(skin.value)
    }
  })

  it('gives the schema-extension skins a purpose-built editor', () => {
    expect(widgetDefinition('world_clock').rendererOwnedSkinDetails).toEqual([
      'travel_clock',
      'sunlight',
    ])
    for (const skin of skinsFor({ type: 'world_clock' }, WIDGET_REGISTRY.world_clock)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(widgetDefinition('world_clock').rendererOwnedSkinDetails).toContain(skin.value)
    }
  })

  it('hands every skin its own icon rather than the shared presentation glyph', () => {
    const skins = widgetDefinition('world_clock').skins ?? []
    // Accents and copy mirror the generated catalogue; the icon is the one
    // piece a purpose-built family gets to choose, so it must be distinct.
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(skins.length)
    for (const skin of skins) {
      expect(skin.description).toBeTruthy()
    }
  })

  it('starts new cards on the city grid', () => {
    const data = widgetDefinition('world_clock').defaultData() as WorldClockData
    expect(data.skin).toBe('city_grid')
    expect(data.zones.length).toBeGreaterThan(0)
  })

  it('keeps the stored cities when the roller changes skin', () => {
    const data: WorldClockData = {
      zones: ['UTC', 'Asia/Tokyo'],
      skin: 'city_grid',
      skinStates: { overlap_band: { window: { start: 8, end: 16 } } },
    }
    const next = dataWearingSkin(
      { type: 'world_clock', data },
      'meeting_planner',
      WIDGET_REGISTRY.world_clock,
    ) as WorldClockData
    expect(next.skin).toBe('meeting_planner')
    expect(next.zones).toEqual(['UTC', 'Asia/Tokyo'])
    // Leaving a skin must not discard the settings it was holding.
    expect(next.skinStates?.overlap_band).toEqual({ window: { start: 8, end: 16 } })
  })

  it('reads a stale skin as the city grid instead of showing nothing', () => {
    const data = { zones: ['UTC'], skin: 'retired_view' } as unknown as WorldClockData
    expect(currentSkin({ type: 'world_clock', data }, WIDGET_REGISTRY.world_clock)?.value)
      .toBe('city_grid')
  })
})
