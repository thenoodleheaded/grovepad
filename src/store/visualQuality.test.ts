/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_PREFERENCES,
  sanitizeVisualQuality,
  VISUAL_QUALITY_ORDER,
  type VisualQuality,
} from './useSettingsStore'
import {
  AURA_QUALITY_BUDGET,
  auraBufferSize,
  auraTuningForQuality,
  DEFAULT_AURA_TUNING,
} from '../components/canvas/auraTuning'

const settingsStore = readFileSync(new URL('./useSettingsStore.ts', import.meta.url), 'utf8')
const auraLayer = readFileSync(new URL('../components/canvas/CanvasAuraLayer.tsx', import.meta.url), 'utf8')
const settingsPanel = readFileSync(new URL('../components/ui/SettingsPanel.tsx', import.meta.url), 'utf8')
const manifest = readFileSync(new URL('../styles/product.css', import.meta.url), 'utf8')
const qualityCss = readFileSync(new URL('../styles/product/35-visual-quality.css', import.meta.url), 'utf8')
const chromeCss = readFileSync(new URL('../styles/product/03-glass-chrome.css', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('visual quality tiers', () => {
  it('offers exactly three tiers, richest first, defaulting to the stock look', () => {
    expect(VISUAL_QUALITY_ORDER).toEqual<VisualQuality[]>(['high', 'balanced', 'low'])
    expect(DEFAULT_APP_PREFERENCES.visualQuality).toBe('high')
  })

  it('falls back to the richest tier for unknown stored values', () => {
    expect(sanitizeVisualQuality('balanced')).toBe('balanced')
    expect(sanitizeVisualQuality('low')).toBe('low')
    for (const bad of ['ultra', '', null, undefined, 3, {}]) {
      expect(sanitizeVisualQuality(bad)).toBe('high')
    }
  })

  it('persists the tier and publishes it on the document', () => {
    expect(settingsStore).toContain("visualQuality: 'high'")
    expect(settingsStore).toContain('visualQuality: sanitizeVisualQuality(raw.visualQuality)')
    expect(settingsStore).toContain('root.dataset.quality = settings.visualQuality')
    // The lightweight tier has no animation to speak of, so it reduces motion
    // without overwriting the owner's separate motion preference.
    expect(settingsStore).toContain("settings.reduceMotion || settings.visualQuality === 'low' ? 'reduced' : 'system'")
  })

  it('leaves the richest tier identical to the stock look', () => {
    // No stylesheet may define a [data-quality='high'] block: the default look
    // is the stylesheet as authored, so it cannot drift as tiers are tuned.
    expect(qualityCss).not.toMatch(/^html\[data-quality='high'\]/m)
    expect(AURA_QUALITY_BUDGET.high).toEqual({ render: true, emitters: 1, blur: 1, alpha: 1, buffer: 1 })
    // Identity, not a re-derived copy — the tuning document passes through.
    expect(auraTuningForQuality(DEFAULT_AURA_TUNING.dark, 'high')).toBe(DEFAULT_AURA_TUNING.dark)
    expect(auraBufferSize(1600, 900)).toEqual(auraBufferSize(1600, 900, 1))
  })

  it('spends less aura on the reduced tier and none on the lightweight one', () => {
    const balanced = auraTuningForQuality(DEFAULT_AURA_TUNING.dark, 'balanced')
    expect(balanced.maxEmitters).toBeLessThan(DEFAULT_AURA_TUNING.dark.maxEmitters)
    expect(balanced.maxEmitters).toBeGreaterThanOrEqual(1)
    expect(balanced.blur).toBeLessThan(DEFAULT_AURA_TUNING.dark.blur)
    expect(balanced.alpha).toBeLessThan(DEFAULT_AURA_TUNING.dark.alpha)
    // Geometry is untouched: a dimmer aura must still sit where the cards are.
    expect(balanced.minRadius).toBe(DEFAULT_AURA_TUNING.dark.minRadius)
    expect(balanced.maxRadius).toBe(DEFAULT_AURA_TUNING.dark.maxRadius)
    expect(balanced.reach).toBe(DEFAULT_AURA_TUNING.dark.reach)

    expect(AURA_QUALITY_BUDGET.low.render).toBe(false)
    // A dimmed aura would still composite the full viewport on every camera
    // frame, so the lightweight tier unmounts the layer instead.
    expect(auraLayer).toContain('AURA_QUALITY_BUDGET[quality].render')
    expect(auraLayer).toContain('if (!auraEnabled) return null')
  })

  it('shrinks the aura buffer without ever collapsing it', () => {
    const full = auraBufferSize(1600, 900, 1)
    const reduced = auraBufferSize(1600, 900, AURA_QUALITY_BUDGET.balanced.buffer)
    expect(reduced.width).toBeLessThan(full.width)
    expect(reduced.height).toBeLessThan(full.height)
    expect(reduced.width).toBeGreaterThan(0)
    // Out-of-range and degenerate inputs still produce a usable buffer.
    expect(auraBufferSize(1600, 900, 0).width).toBeGreaterThan(0)
    expect(auraBufferSize(1600, 900, 99)).toEqual(full)
    expect(auraBufferSize(0, 900, 1)).toEqual({ width: 0, height: 0 })
  })

  it('routes every backdrop blur through one tier-scaled token', () => {
    // A hard-coded blur radius would ignore the tier, so the scale token is the
    // only way a stylesheet may ask for frosted glass.
    for (const css of [chromeCss, globalCss, qualityCss]) {
      expect(css).not.toMatch(/backdrop-filter:\s*blur\((?!calc)/)
    }
    expect(chromeCss).toContain('backdrop-filter: blur(calc(26px * var(--gp-blur-scale, 1)))')
    expect(globalCss).toContain('blur(calc(var(--gp-tune-halo-blur, 13px) * var(--gp-blur-scale, 1)))')
    expect(qualityCss).toContain('--gp-blur-scale: 0.45')
    expect(qualityCss).toContain('--gp-blur-scale: 0')
  })

  it('loads the tier stylesheet last so its reductions win the cascade', () => {
    const imports = manifest.match(/@import '\.\/product\/[^']+'/g) ?? []
    expect(imports.at(-1)).toBe("@import './product/35-visual-quality.css'")
  })

  it('removes work on the lightweight tier instead of restyling it', () => {
    const low = qualityCss.slice(qualityCss.indexOf('--- Low'))
    expect(low).toContain('backdrop-filter: none !important')
    expect(low).toContain('animation-iteration-count: 1 !important')
    // Not 0s: several surfaces close themselves on transitionend/animationend.
    expect(low).toContain('animation-duration: 1ms !important')
    expect(low).toContain('transition-duration: 1ms !important')
    expect(low).toContain('.gp-rest-halo')
    expect(low).toContain('background: var(--gp-flat-card) !important')
    // Selection and link-source stay visible: they are state, not decoration.
    expect(low).toContain(".gp-widget-card[data-selected='true']")
    expect(low).toContain(".gp-widget-card[data-link-source='true']")
  })

  it('exposes the tiers in settings with plain-language names', () => {
    expect(settingsPanel).toContain('VisualQualityIsland')
    expect(settingsPanel).toContain('role="radiogroup" aria-label="Visual quality"')
    expect(settingsPanel).toContain('settings.visualQuality')
    expect(settingsPanel).toContain('update({ visualQuality })')
    for (const label of ["label: 'Full'", "label: 'Balanced'", "label: 'Light'"]) {
      expect(settingsPanel).toContain(label)
    }
    expect(chromeCss).toContain('.gp-settings-quality-segment[data-active]')
  })
})
