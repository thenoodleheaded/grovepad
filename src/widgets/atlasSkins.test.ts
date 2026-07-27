import { describe, expect, it } from 'vitest'
import type { AtlasWidgetData } from '../types/spatial'
import { currentSkin, dataWearingSkin, skinsFor, widgetAccent } from '../utils/widgetSkins'
import { ATLAS_CATALOG, ATLAS_TYPES, defaultAtlasData } from './atlasCatalog'
import { atlasItemsToggled, atlasSkinFor, atlasSkinsFor } from './atlasSkins'
import { WIDGET_REGISTRY } from './registry'

const definitionFor = (type: (typeof ATLAS_TYPES)[number]) => WIDGET_REGISTRY[type]

describe('Atlas skin ownership', () => {
  it('gives every Atlas widget at least the object shape and a compact one', () => {
    for (const type of ATLAS_TYPES) {
      const values = atlasSkinsFor(type).map((skin) => skin.value)
      expect(values[0], type).toBe('object')
      expect(values, type).toContain('compact')
      expect(new Set(values).size, type).toBe(values.length)
    }
  })

  /**
   * The point of deriving skins from each type's spec: a card only offers a
   * shape its stored record can honestly fill. A Gratitude Jar keeps no series,
   * so it must never present an empty chart as a choice.
   */
  it('offers Trend only to types that keep a series', () => {
    for (const type of ATLAS_TYPES) {
      const keepsSeries = ATLAS_CATALOG[type].fields.some((field) => field.valueType === 'series')
      const offersTrend = atlasSkinsFor(type).some((skin) => skin.value === 'trend')
      expect(offersTrend, type).toBe(keepsSeries)
    }
    expect(atlasSkinsFor('fuel_log').map((skin) => skin.value)).toContain('trend')
    expect(atlasSkinsFor('gratitude_jar').map((skin) => skin.value)).not.toContain('trend')
  })

  it('offers Schedule only to types that store named or bounding times', () => {
    const scheduled = ATLAS_TYPES.filter((type) =>
      atlasSkinsFor(type).some((skin) => skin.value === 'schedule'))
    expect(scheduled).toEqual([
      'fasting_window', 'prayer_times', 'outage_schedule', 'sun_window', 'office_hours',
    ])
  })

  it('offers Ledger only where the hero already draws the card’s items', () => {
    expect(atlasSkinsFor('price_book').map((skin) => skin.value)).toContain('ledger')
    expect(atlasSkinsFor('hydration').map((skin) => skin.value)).not.toContain('ledger')
  })

  it('offers Dial only where the card keeps a headline amount to steer', () => {
    expect(atlasSkinsFor('hydration').map((skin) => skin.value)).toContain('dial')
    expect(atlasSkinsFor('on_call').map((skin) => skin.value)).not.toContain('dial')
  })

  it('marks every Atlas skin renderer-ready, so no generic editor overlay opens', () => {
    for (const type of ATLAS_TYPES) {
      for (const skin of atlasSkinsFor(type)) {
        expect(skin.implementation, `${type}/${skin.value}`).toBe('renderer-ready')
        expect(skin.description, `${type}/${skin.value}`).toBeTruthy()
      }
      expect(definitionFor(type).rendererOwnedSkinDetails).toBeUndefined()
    }
  })
})

describe('Atlas skin resolution', () => {
  it('reads an unset, unknown, or inapplicable skin as the object hero', () => {
    const data = defaultAtlasData('hydration')
    expect(data.skin).toBeUndefined()
    expect(atlasSkinFor('hydration', data)).toBe('object')
    expect(atlasSkinFor('hydration', { skin: 'nonsense' })).toBe('object')
    // Hydration keeps no series, so a Trend value saved elsewhere never applies.
    expect(atlasSkinFor('hydration', { skin: 'trend' })).toBe('object')
    expect(atlasSkinFor('fuel_log', { skin: 'trend' })).toBe('trend')
  })

  it('reaches the card through the shared skin surface every widget uses', () => {
    const widget = { type: 'price_book', data: defaultAtlasData('price_book') }
    const definition = definitionFor('price_book')
    expect(skinsFor(widget, definition).map((skin) => skin.value)).toEqual(
      atlasSkinsFor('price_book').map((skin) => skin.value),
    )
    expect(currentSkin(widget, definition)?.value).toBe('object')
  })

  /**
   * `mode` already carries domain meaning on some Atlas types — a Fasting
   * window's is 'ramadan' — and the fields layer computes readings from the
   * stored record. Wearing a skin must therefore touch nothing but `skin`.
   */
  it('persists the choice in `skin` and leaves the whole record intact', () => {
    for (const type of ATLAS_TYPES) {
      const definition = definitionFor(type)
      expect(definition.skinField, type).toBe('skin')
      const original = defaultAtlasData(type)
      const target = atlasSkinsFor(type).at(-1)!.value
      const next = dataWearingSkin({ type, data: original }, target, definition) as AtlasWidgetData

      expect(next.skin, type).toBe(target)
      expect({ ...next, skin: undefined }, type).toEqual({ ...original, skin: undefined })
      expect(atlasSkinFor(type, next), type).toBe(target)
    }
  })

  it('ticks exactly one Ledger row and hands the rest of the record back whole', () => {
    const original = defaultAtlasData('price_book')
    const [first, second] = original.items
    const next = atlasItemsToggled(original, second!.id)

    expect(next.items[0]).toBe(first)
    expect(next.items[1]).toEqual({ ...second, done: !second!.done })
    expect(next.items).toHaveLength(original.items.length)
    expect({ ...next, items: [] }).toEqual({ ...original, items: [] })
    // Ticking is reversible — nothing about the row is lost on the way back.
    expect(atlasItemsToggled(next, second!.id).items[1]).toEqual(second)
  })

  it('keeps the card’s identity hue whichever shape it wears', () => {
    const definition = definitionFor('fuel_log')
    for (const skin of atlasSkinsFor('fuel_log')) {
      const widget = {
        type: 'fuel_log',
        data: { ...defaultAtlasData('fuel_log'), skin: skin.value },
        metadata: {},
      }
      expect(widgetAccent(widget, definition)).toBe(ATLAS_CATALOG.fuel_log.accent)
    }
  })
})
