import { describe, expect, it } from 'vitest'
import type { OutlineData } from '../types/spatial'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { PROFESSIONAL_WIDGET_DEFINITIONS } from './registry/professionalWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'tree',
  'roman',
  'scenes',
  'sitemap',
  'course',
  'work_breakdown',
  'collapsible_brief',
]

describe('Outline skin registry contract', () => {
  it('offers all seven purpose-built skins in catalogue order', () => {
    expect(
      skinsFor({ type: 'outline' }, WIDGET_REGISTRY.outline).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares each skin by hand with a distinct icon', () => {
    const skins = PROFESSIONAL_WIDGET_DEFINITIONS.outline.skins
    expect(skins.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('switches appearance without changing the canonical hierarchy', () => {
    const original = WIDGET_REGISTRY.outline.defaultData() as OutlineData
    const next = dataWearingSkin(
      { type: 'outline', data: original },
      'sitemap',
      WIDGET_REGISTRY.outline,
    ) as OutlineData
    expect(next.skin).toBe('sitemap')
    expect(next.items).toEqual(original.items)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps advanced state when another skin is worn', () => {
    const original = WIDGET_REGISTRY.outline.defaultData()
    const withWork = dataWithSkinState(original, 'work_breakdown', {
      items: { first: { owner: 'Mina', complete: true } },
    }) as OutlineData
    const next = dataWearingSkin(
      { type: 'outline', data: withWork },
      'roman',
      WIDGET_REGISTRY.outline,
    ) as OutlineData
    expect(next.skin).toBe('roman')
    expect(next.skinStates?.work_breakdown).toEqual({
      items: { first: { owner: 'Mina', complete: true } },
    })
  })

  it('lets the renderer own both schema-extension editors', () => {
    expect(WIDGET_REGISTRY.outline.rendererOwnedSkinDetails).toEqual([
      'work_breakdown',
      'collapsible_brief',
    ])
    for (const skin of skinsFor({ type: 'outline' }, WIDGET_REGISTRY.outline)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.outline.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })
})
