import { describe, expect, it } from 'vitest'
import { WIDGET_REGISTRY } from './registry'
import { WIDGET_SKIN_BLUEPRINTS } from './skinBlueprints.generated'
import { dataWearingSkin } from '../utils/widgetSkins'
import { FORMULA_SHEET_SKINS } from '../components/widgets/modules/formulaSheetSkinModel'

/**
 * The registry contract for the Formula Sheet family. The catalogue is the
 * authority on what these skins are called and how they behave in storage;
 * this file is what stops the renderer drifting away from it.
 */
describe('formula sheet skins', () => {
  const definition = WIDGET_REGISTRY.formula_sheet

  it('offers every catalogued skin, in catalogue order', () => {
    const catalogue = WIDGET_SKIN_BLUEPRINTS.formula_sheet!.map((skin) => skin.value)
    expect(definition.skins?.map((skin) => skin.value)).toEqual(catalogue)
  })

  it('is the same list the renderer switches on', () => {
    expect([...FORMULA_SHEET_SKINS]).toEqual(definition.skins?.map((skin) => skin.value))
  })

  it('stores the worn skin in `skin`', () => {
    expect(definition.skinField).toBe('skin')
  })

  it('lets only the schema-extension skins own stored detail', () => {
    expect(definition.rendererOwnedSkinDetails).toEqual([
      'derivation',
      'unit_aware',
      'worked_example',
    ])
  })

  it('keeps that list in step with the catalogue’s own implementation flags', () => {
    const extensions = WIDGET_SKIN_BLUEPRINTS.formula_sheet!
      .filter((skin) => skin.implementation === 'schema-extension')
      .map((skin) => skin.value)
    expect(definition.rendererOwnedSkinDetails).toEqual(extensions)
  })

  it('survives being worn', () => {
    for (const skin of FORMULA_SHEET_SKINS) {
      const next = dataWearingSkin(
        { type: 'formula_sheet', data: { formulas: [] } },
        skin,
        definition,
      )
      expect((next as { skin?: string }).skin).toBe(skin)
    }
  })
})
