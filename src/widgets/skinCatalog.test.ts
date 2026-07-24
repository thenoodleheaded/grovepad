import { describe, expect, it } from 'vitest'
import type { ModuleData, ModuleType } from '../types/spatial'
import {
  dataWearingSkin,
  dataWithSkinState,
  skinStateFor,
  skinsFor,
} from '../utils/widgetSkins'
import { WIDGET_SKIN_BLUEPRINTS } from './skinBlueprints.generated'
import { cataloguedSkinCount } from './skinCatalog'
import { isWidgetTypePublic, WIDGET_REGISTRY } from './registry'

describe('complete widget skin catalogue', () => {
  it('installs all 610 implementable proposals on their public widgets', () => {
    expect(cataloguedSkinCount()).toBe(610)

    for (const [untypedType, blueprints] of Object.entries(WIDGET_SKIN_BLUEPRINTS)) {
      const type = untypedType as ModuleType
      expect(isWidgetTypePublic(type), `${type} should be public`).toBe(true)
      const definition = WIDGET_REGISTRY[type]
      const installed = new Map(
        skinsFor({ type }, definition).map((skin) => [skin.value, skin]),
      )

      for (const blueprint of blueprints) {
        expect(installed.get(blueprint.value), `${type}.${blueprint.value}`).toMatchObject(
          blueprint,
        )
      }
    }
  })

  it('gives every public widget a real skin choice without duplicate values', () => {
    for (const type of Object.keys(WIDGET_REGISTRY) as ModuleType[]) {
      if (!isWidgetTypePublic(type)) continue
      const skins = skinsFor({ type }, WIDGET_REGISTRY[type])
      expect(skins.length, type).toBeGreaterThan(1)
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
})
