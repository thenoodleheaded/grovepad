import { describe, expect, it } from 'vitest'
import type { AtlasWidgetData } from '../types/spatial'
import { resolveWidgetMention } from '../utils/thoughtInterpreter'
import { ATLAS_CATALOG, ATLAS_TYPES, atlasTypeForPhrase } from './atlasCatalog'
import { commandsFor, fieldsFor } from './fields'
import { WIDGET_REGISTRY } from './registry'

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true
  if (Array.isArray(value)) return value.some(hasUndefined)
  if (value && typeof value === 'object') return Object.values(value).some(hasUndefined)
  return false
}

describe('50-widget atlas contracts', () => {
  it('ships the complete, unique batch', () => {
    expect(ATLAS_TYPES).toHaveLength(50)
    expect(new Set(ATLAS_TYPES).size).toBe(50)
  })

  it.each(ATLAS_TYPES)('%s is persistent and interactive', (type) => {
    const definition = WIDGET_REGISTRY[type]
    const data = definition.defaultData() as AtlasWidgetData
    const fields = fieldsFor(type)
    const commands = commandsFor(type)

    expect(definition.type).toBe(type)
    expect(definition.label).toBe(ATLAS_CATALOG[type].label)
    expect(definition.defaultSize.width % 40).toBe(0)
    expect(definition.defaultSize.height % 40).toBe(0)
    expect(hasUndefined(data)).toBe(false)
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    expect(fields.length).toBeGreaterThanOrEqual(3)
    expect(fields.some((field) => field.set)).toBe(true)
    expect(fields.some((field) => !field.set)).toBe(true)
    expect(commands.length).toBeGreaterThanOrEqual(1)

    fields.forEach((field) => {
      expect(() => field.get(data)).not.toThrow()
      if (field.set) expect(() => field.set!(data, field.get(data))).not.toThrow()
    })
    commands.forEach((command) => {
      const next = command.run(data) as AtlasWidgetData
      expect(hasUndefined(next)).toBe(false)
      expect(next.history.length).toBeLessThanOrEqual(120)
    })
  })

  it.each([
    ['stokvel', 'savings_circle'],
    ['send money home', 'remittance_planner'],
    ['load shedding', 'outage_schedule'],
    ['hifz', 'memorization_ladder'],
    ['hongbao', 'gift_ledger'],
    ['braai', 'potluck_matrix'],
    ['90 in 180', 'visa_runway'],
    ['artist queue', 'commission_queue'],
  ] as const)('discovers %s as the %s Tracker mode without cloud inference', (phrase, type) => {
    expect(resolveWidgetMention(phrase)).toBe('tracker')
    expect(atlasTypeForPhrase(phrase)).toBe(type)
  })
})
