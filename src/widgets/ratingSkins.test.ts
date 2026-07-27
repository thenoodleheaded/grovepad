import { describe, expect, it } from 'vitest'
import type { RatingData } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { commandsFor, fieldDescriptor } from './fields'
import { DATA_TRACKING_WIDGET_DEFINITIONS } from './registry/dataTrackingWidgets'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'stars',
  'slider',
  'emoji',
  'traffic_light',
  'nps',
  'rubric',
  'confidence',
]

describe('Rating skin registry contract', () => {
  it('offers every designed Rating experience in catalogue order', () => {
    expect(
      skinsFor({ type: 'rating' }, WIDGET_REGISTRY.rating).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with its own recognizable icon', () => {
    const declared = DATA_TRACKING_WIDGET_DEFINITIONS.rating.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('persists appearance in `skin` without disturbing the shared value', () => {
    expect(WIDGET_REGISTRY.rating.skinField).toBe('skin')
    const original = { label: 'Launch', value: 4.5 } as RatingData
    const next = dataWearingSkin(
      { type: 'rating', data: original },
      'emoji',
      WIDGET_REGISTRY.rating,
    ) as RatingData

    expect(next.skin).toBe('emoji')
    expect(next.value).toBe(4.5)
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps specialist detail when another skin is worn', () => {
    const withConfidence = dataWithSkinState(
      { label: 'Launch', value: 4, skin: 'confidence' } as RatingData,
      'confidence',
      { percent: 82, evidence: 'User tests' },
    ) as RatingData
    const worn = dataWearingSkin(
      { type: 'rating', data: withConfidence },
      'stars',
      WIDGET_REGISTRY.rating,
    ) as RatingData

    expect(worn.skin).toBe('stars')
    expect(worn.skinStates?.confidence).toEqual({ percent: 82, evidence: 'User tests' })
  })

  it('survives a wire write and Clear command with its skin intact', () => {
    const worn = {
      label: 'Launch',
      value: 4,
      skin: 'confidence',
      skinStates: { confidence: { percent: 82 } },
    } as RatingData

    const write = fieldDescriptor('rating', 'value')?.set
    const written = write!(worn, 2) as RatingData
    expect(written).toMatchObject({
      value: 2,
      skin: 'confidence',
      skinStates: { confidence: { percent: 82 } },
    })

    const clear = commandsFor('rating').find((command) => command.key === 'reset')
    const cleared = clear!.run(written) as RatingData
    expect(cleared).toMatchObject({
      value: 0,
      skin: 'confidence',
      skinStates: { confidence: { percent: 82 } },
    })
  })

  it('lets the renderer own both specialist experiences', () => {
    expect(WIDGET_REGISTRY.rating.rendererOwnedSkinDetails).toEqual(['rubric', 'confidence'])
  })

  it('rests as the worn skin instead of snapping every rating back to stars', () => {
    const face = (data: Partial<RatingData>) => restingFace({
      type: 'rating',
      title: 'Launch',
      size: { width: 320, height: 160 },
      data: { label: 'Launch', value: 4, ...data } as RatingData,
    }).model

    expect(face({ skin: 'stars' })).toMatchObject({ kind: 'stars', value: 4 })
    expect(face({ skin: 'emoji' })).toMatchObject({ kind: 'text', text: '🙂' })
    expect(face({ skin: 'traffic_light' })).toMatchObject({ kind: 'text', text: '🟡 Watch closely' })
    expect(face({ skin: 'nps' })).toMatchObject({ kind: 'metric', primary: '8/10', secondary: 'Passive' })
    expect(face({
      skin: 'confidence',
      skinStates: { confidence: { percent: 82 } },
    })).toMatchObject({ kind: 'metric', primary: '4/5', secondary: '82% confident' })
  })
})
