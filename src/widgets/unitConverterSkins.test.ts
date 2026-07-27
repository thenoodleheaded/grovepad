import { describe, expect, it } from 'vitest'
import type { UnitConverterData } from '../types/widgetDataExpansion'
import { dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { fieldDescriptor } from './fields'
import { PROFESSIONAL_WIDGET_DEFINITIONS } from './registry/professionalWidgets'
import { WIDGET_REGISTRY } from './registry'
import { unitConverterReading } from '../components/widgets/modules/unitConverterSkinModel'

const expected = [
  'general',
  'cooking',
  'engineering',
  'data',
  'temperature',
  'currency',
  'custom_formula',
]

const card = (patch: Partial<UnitConverterData> = {}): UnitConverterData => ({
  category: 'length',
  value: 1,
  from: 'm',
  to: 'ft',
  precision: 2,
  ...patch,
})

describe('Unit Converter skin registry contract', () => {
  it('offers all seven skins in reviewed order with distinct icons', () => {
    const declared = PROFESSIONAL_WIDGET_DEFINITIONS.unit_converter.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
    expect(skinsFor({ type: 'unit_converter' }, WIDGET_REGISTRY.unit_converter).map((skin) => skin.value))
      .toEqual(expected)
  })

  it('stores appearance in skin without disturbing the conversion', () => {
    expect(WIDGET_REGISTRY.unit_converter.skinField).toBe('skin')
    const worn = dataWearingSkin(
      { type: 'unit_converter', data: card() },
      'engineering',
      WIDGET_REGISTRY.unit_converter,
    ) as UnitConverterData

    expect(worn).toMatchObject({
      skin: 'engineering',
      category: 'length',
      value: 1,
      from: 'm',
      to: 'ft',
      precision: 2,
    })
    expect(worn).not.toHaveProperty('mode')
  })

  it('lets the renderer own both advanced skin editors', () => {
    expect(WIDGET_REGISTRY.unit_converter.rendererOwnedSkinDetails).toEqual([
      'currency',
      'custom_formula',
    ])
    for (const skin of WIDGET_REGISTRY.unit_converter.skins ?? []) {
      if (skin.implementation !== 'schema-extension') continue
      expect(WIDGET_REGISTRY.unit_converter.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })

  it('publishes exactly the number the worn skin shows', () => {
    const output = fieldDescriptor('unit_converter', 'output')
    expect(output).toBeDefined()

    const cases: UnitConverterData[] = [
      card(),
      card({ skin: 'cooking', category: 'cooking_volume', from: 'cup', to: 'ml' }),
      card({ skin: 'engineering', category: 'power', from: 'kw', to: 'hp' }),
      card({ skin: 'data', category: 'data_storage', from: 'GB', to: 'GiB' }),
      card({ skin: 'temperature', category: 'temperature', value: 32, from: 'F', to: 'C' }),
      card({ skin: 'currency', skinStates: { currency: { rate: 0.9 } } }),
      card({ skin: 'custom_formula', skinStates: { custom_formula: { factor: 2, offset: 3 } } }),
    ]

    for (const data of cases) {
      expect(output!.get(data), data.skin ?? 'general').toBe(unitConverterReading(data).output)
    }
  })

  it('survives a wire write with its skin and specialist state intact', () => {
    const worn = card({
      skin: 'custom_formula',
      skinStates: { custom_formula: { factor: 2, offset: 3 } },
    })
    const write = fieldDescriptor('unit_converter', 'input')?.set
    expect(write).toBeDefined()
    const written = write!(worn, 10) as UnitConverterData

    expect(written.value).toBe(10)
    expect(written.skin).toBe('custom_formula')
    expect(written.skinStates?.custom_formula).toEqual({ factor: 2, offset: 3 })
    expect(fieldDescriptor('unit_converter', 'output')!.get(written)).toBe(23)
  })
})
