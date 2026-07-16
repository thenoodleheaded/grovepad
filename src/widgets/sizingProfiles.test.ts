import { describe, expect, it } from 'vitest'
import type { WidgetSizing } from './contracts/registry'
import { REVIEWED_WIDGET_SIZING, SIZING_REVIEW_TYPES, widgetLayoutTier } from './sizingProfiles'
import { widgetDefinition } from './registry'

describe('reviewed widget sizing profiles', () => {
  it('covers the 35-widget calibration set exactly once', () => {
    expect(SIZING_REVIEW_TYPES).toHaveLength(35)
    expect(new Set(SIZING_REVIEW_TYPES).size).toBe(35)
    expect(Object.keys(REVIEWED_WIDGET_SIZING).sort()).toEqual([...SIZING_REVIEW_TYPES].sort())
  })

  it('declares a coherent fallback window for every reviewed widget', () => {
    for (const type of SIZING_REVIEW_TYPES) {
      const sizing: WidgetSizing = REVIEWED_WIDGET_SIZING[type]
      expect(sizing.minWidth!).toBeGreaterThanOrEqual(160)
      expect(sizing.minHeight!).toBeGreaterThanOrEqual(120)
      expect(sizing.maxWidth!).toBeGreaterThanOrEqual(sizing.minWidth!)
      if (sizing.maxHeight !== undefined) expect(sizing.maxHeight).toBeGreaterThanOrEqual(sizing.minHeight!)
      expect(sizing.layoutTiers).toBeDefined()
      expect(sizing.layoutTiers!.expandedMinWidth).toBeGreaterThan(sizing.minWidth!)
      expect(sizing.layoutTiers!.expandedMinWidth).toBeLessThanOrEqual(sizing.maxWidth!)
      if (sizing.layoutTiers!.compactMaxWidth !== undefined) {
        expect(sizing.layoutTiers!.compactMaxWidth).toBeGreaterThanOrEqual(sizing.minWidth!)
        expect(sizing.layoutTiers!.compactMaxWidth).toBeLessThan(sizing.layoutTiers!.expandedMinWidth)
      }
    }
  })

  it('switches reviewed widgets between explicit full-card layout tiers', () => {
    for (const type of SIZING_REVIEW_TYPES) {
      const sizing = REVIEWED_WIDGET_SIZING[type]
      const tiers = sizing.layoutTiers!
      expect(widgetLayoutTier(type, tiers.expandedMinWidth)).toBe('expanded')
      expect(widgetLayoutTier(type, tiers.expandedMinWidth - 4)).not.toBe('expanded')
      if (tiers.compactMaxWidth !== undefined) {
        expect(widgetLayoutTier(type, tiers.compactMaxWidth)).toBe('compact')
        expect(widgetLayoutTier(type, tiers.compactMaxWidth + 4)).toBe('standard')
      }
    }
  })

  it('spawns every reviewed widget inside its own safe window', () => {
    for (const type of SIZING_REVIEW_TYPES) {
      const definition = widgetDefinition(type)
      const sizing = REVIEWED_WIDGET_SIZING[type] as WidgetSizing
      expect(definition.defaultSize.width).toBeGreaterThanOrEqual(sizing.minWidth!)
      expect(definition.defaultSize.height).toBeGreaterThanOrEqual(sizing.minHeight!)
      expect(definition.defaultSize.width).toBeLessThanOrEqual(sizing.maxWidth!)
      if (sizing.maxHeight !== undefined) {
        expect(definition.defaultSize.height).toBeLessThanOrEqual(sizing.maxHeight)
      }
    }
  })
})
