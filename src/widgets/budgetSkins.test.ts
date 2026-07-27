import { describe, expect, it } from 'vitest'
import type { BudgetData } from '../types/spatial'
import { dataWearingSkin } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { widgetDefinition } from './registry'
import { WIDGET_SKIN_BLUEPRINTS } from './skinBlueprints.generated'

describe('Budget skin registry', () => {
  it('keeps all eight purpose-built views in their intended order', () => {
    expect(widgetDefinition('budget').skins?.map((skin) => skin.value)).toEqual([
      'category_plan',
      'envelope',
      'zero_based',
      '50_30_20',
      'cashflow',
      'sinking_funds',
      'shared_budget',
      'project_budget',
    ])
  })

  it('routes advanced settings to the purpose-built renderer', () => {
    expect(widgetDefinition('budget').rendererOwnedSkinDetails).toEqual([
      'cashflow',
      'sinking_funds',
      'shared_budget',
      'project_budget',
    ])
  })

  it('keeps the reviewed catalogue wording and presentation contracts', () => {
    const installed = new Map(
      widgetDefinition('budget').skins?.map((skin) => [skin.value, skin]),
    )
    for (const blueprint of WIDGET_SKIN_BLUEPRINTS.budget) {
      expect(installed.get(blueprint.value)).toMatchObject(blueprint)
    }
  })

  it('creates a roomy, legacy-safe budget and preserves all values while switching skins', () => {
    const definition = widgetDefinition('budget')
    const data = definition.defaultData() as BudgetData
    expect(definition.skinField).toBe('skin')
    expect(definition.defaultSize).toEqual({ width: 400, height: 320 })
    expect(fieldDescriptor('budget', 'total')?.get(data)).toBe(27)

    const withState: BudgetData = {
      ...data,
      skinStates: { shared_budget: { household: 'Home' } },
    }
    expect(dataWearingSkin(
      { type: 'budget', data: withState },
      'shared_budget',
      definition,
    )).toEqual({
      ...withState,
      skin: 'shared_budget',
    })
  })
})
