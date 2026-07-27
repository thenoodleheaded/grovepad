import { describe, expect, it } from 'vitest'
import type { DialogData } from '../types/widgetDataCore'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { MEDIA_INPUT_WIDGET_DEFINITIONS } from './registry/mediaInputWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'screenplay',
  'chat',
  'interview',
  'roleplay',
  'comic',
  'localization',
  'audio_transcript',
]

const SCRIPT: DialogData = {
  lines: [{ id: 'one', character: 'ADA', cue: 'Keep the words.' }],
}

describe('Dialog skin registry contract', () => {
  it('offers every designed script view in catalogue order', () => {
    expect(
      skinsFor({ type: 'dialog' }, WIDGET_REGISTRY.dialog).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with its own icon and hue', () => {
    const declared = MEDIA_INPUT_WIDGET_DEFINITIONS.dialog.skins!
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
    expect(new Set(declared.map((skin) => skin.accent)).size).toBe(expected.length)
  })

  it('changes appearance without changing a word of the canonical script', () => {
    expect(WIDGET_REGISTRY.dialog.skinField).toBe('skin')
    const next = dataWearingSkin(
      { type: 'dialog', data: SCRIPT },
      'chat',
      WIDGET_REGISTRY.dialog,
    ) as DialogData

    expect(next.skin).toBe('chat')
    expect(next.lines).toEqual(SCRIPT.lines)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps specialist details when another skin is worn', () => {
    const localized = dataWithSkinState(SCRIPT, 'localization', {
      translations: { one: 'So‘zlarni saqlang.' },
    }) as DialogData
    const timed = dataWithSkinState(localized, 'audio_transcript', {
      timestamps: { one: '00:08' },
    }) as DialogData
    const worn = dataWearingSkin(
      { type: 'dialog', data: timed },
      'screenplay',
      WIDGET_REGISTRY.dialog,
    ) as DialogData

    expect(worn.lines).toEqual(SCRIPT.lines)
    expect(worn.skinStates?.localization).toHaveProperty('translations')
    expect(worn.skinStates?.audio_transcript).toHaveProperty('timestamps')
  })

  it('lets the renderer own every schema-extension editor', () => {
    for (const skin of skinsFor({ type: 'dialog' }, WIDGET_REGISTRY.dialog)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.dialog.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })
})
