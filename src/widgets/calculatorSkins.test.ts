import { describe, expect, it } from 'vitest'
import type { CalculatorData } from '../types/spatial'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { DATA_TRACKING_WIDGET_DEFINITIONS } from './registry/dataTrackingWidgets'
import { fieldDescriptor, fieldsFor } from './fields'
import { WIDGET_REGISTRY } from './registry'

const expected = [
  'basic',
  'scientific',
  'tape',
  'finance',
  'programmer',
  'date_math',
  'named_variables',
]

describe('Calculator skin registry contract', () => {
  it('offers every designed Calculator in catalogue order', () => {
    expect(
      skinsFor({ type: 'calculator' }, WIDGET_REGISTRY.calculator).map((skin) => skin.value),
    ).toEqual(expected)
  })

  // Every one of these is the `standard` presentation, so the catalogue merge
  // would have given all seven the same icon.
  it('names every Calculator skin by hand, each with its own icon', () => {
    const declared = DATA_TRACKING_WIDGET_DEFINITIONS.calculator.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  /**
   * `result` is the circuit's canonical output. Letting the catalogue merge
   * move the skin field to `mode` — which `CalculatorData` does not have —
   * would reset every skinned card back to the basic keypad.
   */
  it('persists the chosen skin in `skin` and never disturbs the result', () => {
    expect(WIDGET_REGISTRY.calculator.skinField).toBe('skin')

    const original = { expression: '(12+8)*3', result: '60' } as CalculatorData
    const next = dataWearingSkin(
      { type: 'calculator', data: original },
      'programmer',
      WIDGET_REGISTRY.calculator,
    ) as CalculatorData

    expect(next.skin).toBe('programmer')
    expect(next.result).toBe('60')
    expect(next).not.toHaveProperty('mode')
  })

  it('keeps one skin’s working when another is worn', () => {
    const withTape = dataWithSkinState(
      { expression: '', result: '', skin: 'tape' } as CalculatorData,
      'tape',
      { entries: [{ id: 'a', expression: '2+2', result: '4' }] },
    ) as CalculatorData
    const worn = dataWearingSkin(
      { type: 'calculator', data: withTape },
      'finance',
      WIDGET_REGISTRY.calculator,
    ) as CalculatorData

    expect(worn.skin).toBe('finance')
    expect(worn.skinStates?.tape).toEqual({ entries: [{ id: 'a', expression: '2+2', result: '4' }] })
  })

  it('lets the renderer own the two skins that keep their own working', () => {
    expect(WIDGET_REGISTRY.calculator.rendererOwnedSkinDetails)
      .toEqual(['date_math', 'named_variables'])
    for (const skin of skinsFor({ type: 'calculator' }, WIDGET_REGISTRY.calculator)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(
        WIDGET_REGISTRY.calculator.rendererOwnedSkinDetails,
        `${skin.value} needs a renderer-owned detail editor`,
      ).toContain(skin.value)
    }
  })
})

describe('Named Variables is wired to the circuit', () => {
  it('keeps `result` first, so existing wires still read the same port', () => {
    // Field order IS port-slot order — a reorder would silently repoint every
    // connection already drawn to this card.
    expect(fieldsFor('calculator')[0]?.key).toBe('result')
  })

  it('writes a named value and re-reads the expression in the same step', () => {
    const data = {
      expression: 'rate * hours',
      result: '0',
      skin: 'named_variables',
      skinStates: {
        named_variables: {
          variables: [
            { id: 'v1', name: 'rate', value: 0 },
            { id: 'v2', name: 'hours', value: 3 },
          ],
        },
      },
    } as CalculatorData

    const write = fieldDescriptor('calculator', 'variable_1')?.set
    expect(write, 'named values must be writable by a wire').toBeDefined()
    const next = write!(data, 120) as CalculatorData

    expect(next.result).toBe('360')
    expect(next.skin).toBe('named_variables')
    const variables = next.skinStates?.named_variables?.variables as { value: number }[]
    expect(variables[0]!.value).toBe(120)
    expect(variables[1]!.value).toBe(3)
  })

  it('reads a slot that has no variable as zero, and refuses to invent one', () => {
    const empty = { expression: '', result: '', skin: 'named_variables' } as CalculatorData
    const read = fieldDescriptor('calculator', 'variable_2')
    expect(read?.get(empty)).toBe(0)
    // Writing a slot with nothing in it leaves the card exactly as it was.
    expect(read?.set?.(empty, 9)).toBe(empty)
  })
})
