import { describe, expect, it } from 'vitest'
import {
  auraBufferSize,
  auraScreenPool,
  DEFAULT_AURA_DOCUMENT,
  DEFAULT_AURA_TUNING,
  auraNumericBounds,
  resolveAccent,
  sanitizeAuraDocument,
} from './auraTuning'
import { skinsFor, widgetAccent } from '../../utils/widgetSkins'
import { widgetDefinition } from '../../widgets/registry'
import { defaultAtlasData, switchAtlasMode } from '../../widgets/atlasCatalog'

describe('sanitizeAuraDocument', () => {
  it('falls back to defaults for junk input', () => {
    expect(sanitizeAuraDocument(null)).toEqual(DEFAULT_AURA_DOCUMENT)
    expect(sanitizeAuraDocument('nope')).toEqual(DEFAULT_AURA_DOCUMENT)
    expect(sanitizeAuraDocument({ aura: { dark: 42 } }).aura.dark).toEqual(DEFAULT_AURA_TUNING.dark)
  })

  it('clamps every numeric knob into range', () => {
    const doc = sanitizeAuraDocument({
      aura: { dark: { alpha: 99, reach: -5, maxEmitters: 1000 } },
    })
    const [alphaMin, alphaMax] = auraNumericBounds('alpha')
    expect(doc.aura.dark.alpha).toBeLessThanOrEqual(alphaMax)
    expect(doc.aura.dark.alpha).toBeGreaterThanOrEqual(alphaMin)
    expect(doc.aura.dark.reach).toBeGreaterThanOrEqual(0)
    expect(doc.aura.dark.maxEmitters).toBeLessThanOrEqual(auraNumericBounds('maxEmitters')[1])
  })

  it('rejects non-finite numbers that would throw out of createRadialGradient', () => {
    const doc = sanitizeAuraDocument({
      aura: { dark: { reach: Number.NaN, scatter: Number.POSITIVE_INFINITY } },
    })
    expect(Number.isFinite(doc.aura.dark.reach)).toBe(true)
    expect(Number.isFinite(doc.aura.dark.scatter)).toBe(true)
  })

  it('keeps the radius floor at or below the ceiling', () => {
    const doc = sanitizeAuraDocument({ aura: { dark: { minRadius: 0.9, maxRadius: 0.2 } } })
    expect(doc.aura.dark.minRadius).toBeLessThanOrEqual(doc.aura.dark.maxRadius)
  })

  it('only accepts known blend modes', () => {
    expect(sanitizeAuraDocument({ aura: { dark: { blend: 'screen' } } }).aura.dark.blend).toBe(
      DEFAULT_AURA_TUNING.dark.blend,
    )
    expect(sanitizeAuraDocument({ aura: { light: { blend: 'lighter' } } }).aura.light.blend).toBe(
      'lighter',
    )
  })

  it('drops empty accent entries but keeps real overrides', () => {
    const doc = sanitizeAuraDocument({
      accents: { notes: { dark: '#ff0000' }, table: {}, budget: { light: '   ' } },
    })
    expect(doc.accents.notes).toEqual({ dark: '#ff0000' })
    expect(doc.accents.table).toBeUndefined()
    expect(doc.accents.budget).toBeUndefined()
  })

  it('round-trips an exported document unchanged', () => {
    const tuned = sanitizeAuraDocument({
      aura: { dark: { ...DEFAULT_AURA_TUNING.dark, alpha: 0.31, scatter: 1.2 } },
      accents: { notes: { dark: '#abcdef', light: '#123456' } },
    })
    expect(sanitizeAuraDocument(JSON.parse(JSON.stringify(tuned)))).toEqual(tuned)
  })
})

describe('resolveAccent', () => {
  it('prefers the per-theme override and falls back to the registry value', () => {
    const doc = sanitizeAuraDocument({ accents: { notes: { dark: '#ff0000' } } })
    expect(resolveAccent(doc, 'dark', 'notes', '#111111')).toBe('#ff0000')
    expect(resolveAccent(doc, 'light', 'notes', '#111111')).toBe('#111111')
    expect(resolveAccent(doc, 'dark', 'table', '#222222')).toBe('#222222')
  })
})

describe('aura accent source', () => {
  it('lights two skins of one widget type in their own colours', () => {
    // The regression this pins: `tracker` carries a single green registry accent,
    // so reading the type directly lit every skin identically while the cards on
    // screen showed distinct colours.
    const definition = widgetDefinition('tracker')
    const skins = skinsFor({ type: 'tracker' }, definition)
    const distinct = new Set(skins.map((skin) => skin.accent))
    expect(skins.length).toBeGreaterThan(1)
    expect(distinct.size).toBeGreaterThan(1)
    expect(distinct.has(definition.accent) && distinct.size === 1).toBe(false)

    const wearing = (mode: string) =>
      widgetAccent(
        { type: 'tracker', metadata: {}, data: switchAtlasMode(defaultAtlasData('price_book'), mode as never) },
        definition,
      )
    const first = skins[0]!.value
    const other = skins.find((skin) => skin.accent !== skins[0]!.accent)!.value
    expect(wearing(first)).not.toBe(wearing(other))
  })

  it('lets a hand-picked per-widget accent win over the skin', () => {
    const definition = widgetDefinition('tracker')
    expect(
      widgetAccent(
        { type: 'tracker', metadata: { accent: '#ff00ff' }, data: defaultAtlasData('price_book') },
        definition,
      ),
    ).toBe('#ff00ff')
  })
})

describe('screen-space aura geometry', () => {
  const dark = DEFAULT_AURA_TUNING.dark
  const VIEWPORT_WIDTH = 1280
  const VIEWPORT_HEIGHT = 720

  it('keeps the halo soft and local around a compact visible tile', () => {
    const icon = auraScreenPool(80, 80, 1, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, dark)
    expect(icon.halo).toBeGreaterThan(VIEWPORT_HEIGHT * dark.minRadius)
    expect(icon.halo).toBeLessThan(VIEWPORT_HEIGHT * dark.maxRadius)
    expect(icon.radiusX).toBe(icon.radiusY)
  })

  it('follows a rectangular visible footprint without pretending it is square', () => {
    const card = auraScreenPool(360, 120, 1, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, dark)
    expect(card.radiusX).toBeGreaterThan(card.radiusY)
    expect(card.radiusX - card.radiusY).toBeCloseTo(120)
  })

  it('scales halo depth proportionally across zoom so colors zoom with the board', () => {
    const far = auraScreenPool(240, 160, 0.4, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, dark)
    const near = auraScreenPool(240, 160, 2, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, dark)
    expect(near.halo).toBeGreaterThan(far.halo)
    expect(near.halo / far.halo).toBeCloseTo(2 / 0.4)
  })

  it('uses an aspect-correct adaptive buffer instead of stretching a square', () => {
    expect(auraBufferSize(1280, 720)).toEqual({ width: 560, height: 315 })
    expect(auraBufferSize(390, 844)).toEqual({ width: 254, height: 549 })
  })

  it('survives degenerate geometry without non-finite canvas values', () => {
    expect(auraScreenPool(80, 80, 1, 0, VIEWPORT_HEIGHT, dark)).toEqual({
      halo: 0,
      radiusX: 0,
      radiusY: 0,
    })
    const icon = auraScreenPool(80, 80, 1, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, dark)
    expect(Number.isFinite(icon.halo)).toBe(true)
    expect(auraBufferSize(0, 0)).toEqual({ width: 0, height: 0 })
  })
})
