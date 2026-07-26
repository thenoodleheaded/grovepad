import { describe, expect, it } from 'vitest'
import type { ModuleData, ModuleType } from '../types/spatial'
import {
  dataWearingSkin,
  dataWithSkinState,
  skinStateFor,
  skinsFor,
} from '../utils/widgetSkins'
import { WIDGET_SKIN_BLUEPRINTS } from './skinBlueprints.generated'
import { cataloguedOpportunityCount, cataloguedSkinCount } from './skinCatalog'
import { WIDGET_SKIN_OWNERSHIP } from './skinOwnership.generated'
import { WIDGET_REGISTRY } from './registry'

describe('complete widget skin catalogue', () => {
  it('installs all 610 catalogue choices without letting planning labels hide them', () => {
    expect(cataloguedOpportunityCount()).toBe(610)
    expect(cataloguedSkinCount()).toBe(610)

    for (const [untypedType, blueprints] of Object.entries(WIDGET_SKIN_BLUEPRINTS)) {
      const type = untypedType as ModuleType
      const definition = WIDGET_REGISTRY[type]
      const installed = new Map(
        skinsFor({ type }, definition).map((skin) => [skin.value, skin]),
      )

      for (const blueprint of blueprints) {
        const ownership = WIDGET_SKIN_OWNERSHIP[type as keyof typeof WIDGET_SKIN_OWNERSHIP]?.[
          blueprint.value as never
        ] as { kind: string } | undefined
        expect(ownership, `${type}.${blueprint.value} ownership`).toBeDefined()
        expect(installed.get(blueprint.value), `${type}.${blueprint.value}`).toMatchObject(
          blueprint,
        )
      }
    }
  })

  it('keeps installed skin lists duplicate-free and presentation-complete', () => {
    for (const type of Object.keys(WIDGET_REGISTRY) as ModuleType[]) {
      const skins = skinsFor({ type }, WIDGET_REGISTRY[type])
      expect(new Set(skins.map((skin) => skin.value)).size, type).toBe(skins.length)
      expect(
        skins.every(
          (skin) =>
            skin.label.length > 0 &&
            skin.accent.startsWith('#') &&
            skin.accent.length === 7,
        ),
        type,
      ).toBe(true)
    }
  })

  it('switches generated skins through the same persisted mode contract', () => {
    const definition = WIDGET_REGISTRY.calendar
    const widget = {
      type: 'calendar',
      data: definition.defaultData(),
    } as const
    const week = skinsFor(widget, definition).find((skin) => skin.value === 'week')
    expect(week).toBeDefined()
    const next = dataWearingSkin(widget, week!.value, definition)
    expect(next).toMatchObject({ skin: 'week' })
    expect(next).not.toHaveProperty('mode')
  })

  it('never overwrites a widget mode that drives circuit behavior', () => {
    const definition = WIDGET_REGISTRY.clock_pulse
    const original = definition.defaultData()
    const originalMode = (original as { mode: string }).mode
    const next = dataWearingSkin(
      { type: 'clock_pulse', data: original },
      'once',
      definition,
    ) as ModuleData & { mode: string; skin: string }

    expect(next.mode).toBe(originalMode)
    expect(next.skin).toBe('once')
  })

  it('isolates optional schema-extension state by skin', () => {
    const original = WIDGET_REGISTRY.calendar.defaultData()
    const withShift = dataWithSkinState(original, 'shift_rota', {
      role: 'Support',
      repeat: 'weekly',
    })
    const withBirthday = dataWithSkinState(withShift, 'birthday_and_anniversary', {
      person: 'Ada',
    })

    expect(skinStateFor(withBirthday, 'shift_rota')).toEqual({
      role: 'Support',
      repeat: 'weekly',
    })
    expect(skinStateFor(withBirthday, 'birthday_and_anniversary')).toEqual({
      person: 'Ada',
    })
    expect(skinStateFor(withBirthday, 'month')).toEqual({})
    expect(withBirthday).toMatchObject(original as ModuleData)
  })

  it('removes empty advanced state without leaving persistence debris', () => {
    const original = WIDGET_REGISTRY.table.defaultData()
    const withDetail = dataWithSkinState(original, 'database', {
      details: [{ id: 'one', name: 'Owner', value: 'Ada' }],
    })
    const cleaned = dataWithSkinState(withDetail, 'database', {})

    expect(cleaned).not.toHaveProperty('skinStates')
    expect(cleaned).toEqual(original)
  })
})
