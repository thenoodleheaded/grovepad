import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AURA_DOCUMENT,
  DEFAULT_AURA_TUNING,
  advanceAnchor,
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
      aura: { dark: { alpha: 99, reach: -5, maxEmitters: 1000, midStop: 0 } },
    })
    const [alphaMin, alphaMax] = auraNumericBounds('alpha')
    expect(doc.aura.dark.alpha).toBeLessThanOrEqual(alphaMax)
    expect(doc.aura.dark.alpha).toBeGreaterThanOrEqual(alphaMin)
    expect(doc.aura.dark.reach).toBeGreaterThan(0)
    expect(doc.aura.dark.maxEmitters).toBeLessThanOrEqual(auraNumericBounds('maxEmitters')[1])
    // A zero midStop would collapse the gradient onto the core stop.
    expect(doc.aura.dark.midStop).toBeGreaterThan(0)
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

describe('advanceAnchor', () => {
  const blobAt = (anchor: number, target: number, changedAt: number) => ({
    anchorX: anchor,
    anchorY: 0,
    targetX: target,
    targetY: 0,
    targetChangedAt: changedAt,
  })

  it('holds the light still while the widget is being dragged', () => {
    const blob = blobAt(100, 100, 0)
    // Each drag frame moves the widget and restamps the change time.
    for (let frame = 1; frame <= 10; frame += 1) {
      blob.targetX = 100 + frame * 20
      blob.targetChangedAt = frame * 16
      expect(advanceAnchor(blob, frame * 16, 220, 0.06, false)).toBe(false)
    }
    expect(blob.anchorX).toBe(100)
  })

  it('glides toward the target once the widget has rested', () => {
    const blob = blobAt(100, 300, 0)
    expect(advanceAnchor(blob, 100, 220, 0.06, false)).toBe(false)
    expect(blob.anchorX).toBe(100)
    expect(advanceAnchor(blob, 300, 220, 0.06, false)).toBe(true)
    expect(blob.anchorX).toBeGreaterThan(100)
    expect(blob.anchorX).toBeLessThan(300)
  })

  it('converges exactly instead of easing forever', () => {
    const blob = blobAt(100, 300, 0)
    for (let i = 0; i < 500 && (blob.anchorX !== blob.targetX); i += 1) {
      advanceAnchor(blob, 10_000, 220, 0.06, false)
    }
    expect(blob.anchorX).toBe(300)
    expect(advanceAnchor(blob, 10_000, 220, 0.06, false)).toBe(false)
  })

  it('jumps straight there under reduced motion, even mid-drag', () => {
    const blob = blobAt(100, 300, 9_999)
    expect(advanceAnchor(blob, 10_000, 220, 0.06, true)).toBe(true)
    expect(blob.anchorX).toBe(300)
  })

  it('treats a zero settle delay as follow-immediately', () => {
    const blob = blobAt(100, 300, 10_000)
    expect(advanceAnchor(blob, 10_000, 0, 0.06, false)).toBe(true)
    expect(blob.anchorX).toBeGreaterThan(100)
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
