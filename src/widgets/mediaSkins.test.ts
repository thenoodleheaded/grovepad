import { describe, expect, it } from 'vitest'
import type { MediaData } from '../types/spatial'
import { dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { MEDIA_INPUT_WIDGET_DEFINITIONS } from './registry/mediaInputWidgets'
import { WIDGET_REGISTRY } from './registry'

describe('Media skin registry contract', () => {
  const expected = [
    'image',
    'video',
    'audio',
    'document_preview',
    'before_after',
    'gallery',
    'moodboard',
  ]

  it('offers every designed Media experience in catalogue order', () => {
    expect(
      skinsFor({ type: 'media' }, WIDGET_REGISTRY.media).map((skin) => skin.value),
    ).toEqual(expected)
  })

  // The catalogue merge gives a generated skin one icon per presentation
  // family, so Image and Video would have shared the same glyph and Audio
  // would have worn a checklist. Declaring all seven by hand is what stops it.
  it('names every Media skin by hand, each with its own icon', () => {
    const declared = MEDIA_INPUT_WIDGET_DEFINITIONS.media.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  /**
   * `installCataloguedSkins` only assigns `skinField` to a widget that declares
   * no skins of its own. Declaring them by hand would otherwise have silently
   * moved Media back to `mode`, which `MediaData` does not have — every board
   * that had already chosen a skin would have snapped back to Image.
   */
  it('keeps persisting the chosen skin in `skin`, never `mode`', () => {
    expect(WIDGET_REGISTRY.media.skinField).toBe('skin')
    const next = dataWearingSkin(
      { type: 'media', data: WIDGET_REGISTRY.media.defaultData() },
      'gallery',
      WIDGET_REGISTRY.media,
    ) as MediaData
    expect(next.skin).toBe('gallery')
    expect(next).not.toHaveProperty('mode')
  })

  it('lets the renderer own the two skins that keep their own item lists', () => {
    // Otherwise the generic schema-extension overlay paints a second set of
    // controls on top of the gallery rail and the moodboard.
    expect(WIDGET_REGISTRY.media.rendererOwnedSkinDetails).toEqual(['gallery', 'moodboard'])
    for (const skin of skinsFor({ type: 'media' }, WIDGET_REGISTRY.media)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(
        WIDGET_REGISTRY.media.rendererOwnedSkinDetails,
        `${skin.value} needs a renderer-owned detail editor`,
      ).toContain(skin.value)
    }
  })
})
