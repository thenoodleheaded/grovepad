import { describe, expect, it } from 'vitest'
import type { UnitConverterData, UnitConverterSkin } from '../../../types/widgetDataExpansion'
import {
  currencySettings,
  customFormulaSettings,
  dataWithUnitSkinState,
  formatUnitNumber,
  unitCategoriesForSkin,
  unitConverterReading,
  unitConverterSkin,
} from './unitConverterSkinModel'

const card = (data: Partial<UnitConverterData> = {}): UnitConverterData => ({
  category: 'length',
  value: 1,
  from: 'm',
  to: 'ft',
  precision: 2,
  ...data,
})

describe('Unit Converter skin model', () => {
  it('opens an old unskinned card as General without changing its original answer', () => {
    const reading = unitConverterReading(card())
    expect(unitConverterSkin(undefined)).toBe('general')
    expect(reading.skin).toBe('general')
    expect(reading.category.value).toBe('length')
    expect(reading.output).toBeCloseTo(3.280839895, 8)
  })

  it.each([
    ['general', ['length', 'mass', 'temperature', 'time']],
    ['cooking', ['cooking_volume', 'mass', 'temperature']],
    ['engineering', ['length', 'area', 'volume', 'pressure', 'energy', 'power']],
    ['data', ['data_storage', 'data_rate']],
    ['temperature', ['temperature']],
    ['currency', ['currency']],
    ['custom_formula', ['custom']],
  ] as const)('gives %s only the categories useful to that job', (skin, categories) => {
    expect(unitCategoriesForSkin(skin).map((category) => category.value)).toEqual(categories)
  })

  it('falls back to the worn skin’s first safe pair when old units do not belong', () => {
    const cooking = unitConverterReading(card({ skin: 'cooking' }))
    expect(cooking.category.value).toBe('cooking_volume')
    expect(cooking.from.value).toBe('cup')
    expect(cooking.to.value).toBe('ml')

    const data = unitConverterReading(card({ skin: 'data' }))
    expect(data.category.value).toBe('data_storage')
    expect(data.from.value).toBe('GB')
    expect(data.to.value).toBe('GiB')
  })

  it('converts cooking, engineering, data, and temperature units accurately', () => {
    expect(unitConverterReading(card({
      skin: 'cooking',
      category: 'cooking_volume',
      value: 1,
      from: 'cup',
      to: 'ml',
    })).output).toBeCloseTo(236.5882365, 7)

    expect(unitConverterReading(card({
      skin: 'engineering',
      category: 'pressure',
      value: 1,
      from: 'bar',
      to: 'psi',
    })).output).toBeCloseTo(14.50377377, 7)

    expect(unitConverterReading(card({
      skin: 'data',
      category: 'data_storage',
      value: 1,
      from: 'GiB',
      to: 'GB',
    })).output).toBeCloseTo(1.073741824, 8)

    expect(unitConverterReading(card({
      skin: 'temperature',
      category: 'temperature',
      value: 32,
      from: 'F',
      to: 'C',
    })).output).toBeCloseTo(0, 8)
  })

  it('keeps currency and formula settings isolated from one another', () => {
    const withCurrency = dataWithUnitSkinState(card({ skin: 'currency' }), 'currency', {
      rate: 0.8,
      fromCode: 'USD',
      toCode: 'EUR',
      asOf: '2026-07-26',
    })
    const withFormula = dataWithUnitSkinState(withCurrency, 'custom_formula', {
      factor: 1.8,
      offset: 32,
      fromLabel: '°C',
      toLabel: '°F',
    })

    expect(currencySettings(withFormula)).toEqual({
      rate: 0.8,
      fromCode: 'USD',
      toCode: 'EUR',
      asOf: '2026-07-26',
    })
    expect(customFormulaSettings(withFormula)).toEqual({
      factor: 1.8,
      offset: 32,
      fromLabel: '°C',
      toLabel: '°F',
    })
    expect(unitConverterReading({ ...withFormula, skin: 'currency', value: 10 }).output).toBe(8)
    expect(unitConverterReading({ ...withFormula, skin: 'custom_formula', value: 10 }).output).toBe(50)
  })

  it('bounds untrusted formula values and keeps formatting compact', () => {
    const unsafe = card({
      skin: 'custom_formula',
      skinStates: {
        custom_formula: {
          factor: Number.POSITIVE_INFINITY,
          offset: 9e20,
          fromLabel: 'a label that is much too long',
        },
      },
    })
    expect(customFormulaSettings(unsafe)).toMatchObject({
      factor: 1,
      offset: 1_000_000_000_000,
      fromLabel: 'a label that',
    })
    expect(formatUnitNumber(1_234.56789, 2)).toBe('1,234.57')
  })

  it.each([
    'general',
    'cooking',
    'engineering',
    'data',
    'temperature',
    'currency',
    'custom_formula',
  ] satisfies UnitConverterSkin[])('always returns a finite output for the %s skin', (skin) => {
    expect(Number.isFinite(unitConverterReading(card({
      skin,
      value: Number.NaN,
    })).output)).toBe(true)
  })
})
