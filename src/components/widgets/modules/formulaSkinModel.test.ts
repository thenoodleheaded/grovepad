import { describe, expect, it } from 'vitest'
import type { FormulaData } from '../../../types/widgetDataWorkflow'
import {
  comparatorOf,
  comparisonHolds,
  conditionalBranches,
  expressionText,
  formulaReading,
  formulaResultWord,
  formulaSkinMode,
  formulaValue,
  growthProjection,
  simplifiedRatio,
  twoInputValue,
  weightedRows,
  weightShares,
} from './formulaSkinModel'

const base: FormulaData = { label: 'Calculation', a: 0, b: 0, operator: 'add' }
const card = (data: Partial<FormulaData>): FormulaData => ({ ...base, ...data })

describe('Formula skin model', () => {
  it('falls back to the two-input card for stale or unknown skins', () => {
    expect(formulaSkinMode('ratio')).toBe('ratio')
    expect(formulaSkinMode('quantum')).toBe('two_input')
    expect(formulaSkinMode(undefined)).toBe('two_input')
  })

  /**
   * The whole point of one shared calculation: a board written before Formula
   * had skins carries no `skin`, and must answer exactly what it always did.
   */
  it('answers a skinless card exactly as the original two-operand card did', () => {
    for (const operator of ['add', 'subtract', 'multiply', 'divide', 'modulo'] as const) {
      const data = card({ a: 7, b: 4, operator })
      expect(formulaValue(data)).toBe(twoInputValue(7, 4, operator))
    }
    expect(formulaValue(card({ a: 7, b: 4, operator: 'add' }))).toBe(11)
    expect(formulaValue(card({ a: 7, b: 4, operator: 'divide' }))).toBe(1.75)
  })

  // Dividing by zero kept its historical answer of 0 — changing the number a
  // live board publishes would be a data change, not a skin.
  it('publishes zero for a zero divisor and says why', () => {
    const reading = formulaReading(card({ a: 7, b: 0, operator: 'divide' }))
    expect(reading.value).toBe(0)
    expect(reading.note).toBe('B is zero, so this cannot be divided')
    expect(formulaReading(card({ a: 7, b: 0, operator: 'modulo' })).value).toBe(0)
  })

  it('measures percent change from A to B, in both directions', () => {
    expect(formulaReading(card({ skin: 'percent_change', a: 200, b: 250 }))).toMatchObject({
      value: 25,
      suffix: '%',
      note: null,
    })
    expect(formulaReading(card({ skin: 'percent_change', a: 200, b: 150 })).value).toBe(-25)
    // A negative starting point still moves "up" when it grows toward zero.
    expect(formulaReading(card({ skin: 'percent_change', a: -200, b: -150 })).value).toBe(25)

    const impossible = formulaReading(card({ skin: 'percent_change', a: 0, b: 40 }))
    expect(impossible.value).toBe(0)
    expect(impossible.note).toBe('A start of zero has no percent change')
  })

  it('reads a ratio as A’s share of the whole, and simplifies the pair', () => {
    expect(formulaReading(card({ skin: 'ratio', a: 3, b: 1 }))).toMatchObject({
      value: 75,
      suffix: '%',
    })
    expect(formulaReading(card({ skin: 'ratio', a: 0, b: 0 })).note).toBe('Two zeroes make no ratio')

    expect(simplifiedRatio(3, 4)).toEqual({ left: 3, right: 4 })
    expect(simplifiedRatio(50, 100)).toEqual({ left: 1, right: 2 })
    expect(simplifiedRatio(1.5, 4.5)).toEqual({ left: 1, right: 3 })
    expect(simplifiedRatio(0, 0)).toBeNull()
    // A negative part is not a share of anything.
    expect(simplifiedRatio(-2, 4)).toBeNull()
  })

  it('grows one period at a time and projects where the rate leads', () => {
    expect(formulaReading(card({ skin: 'growth', a: 1000, b: 10 })).value).toBeCloseTo(1100, 8)
    expect(formulaReading(card({ skin: 'growth', a: 1000, b: -10 })).value).toBeCloseTo(900, 8)

    const projection = growthProjection(1000, 10, 3)
    expect(projection).toHaveLength(3)
    expect(projection[0]).toBeCloseTo(1100, 8)
    expect(projection[2]).toBeCloseTo(1331, 8)
    // The published number is always the first projected period.
    expect(formulaReading(card({ skin: 'growth', a: 1000, b: 10 })).value)
      .toBeCloseTo(projection[0]!, 8)
    expect(growthProjection(1000, 10, 999)).toHaveLength(24)
  })

  it('evaluates a written expression over A and B, and survives a bad one', () => {
    const withExpression = (expression: string, a = 6, b = 4) => formulaReading(card({
      skin: 'expression',
      a,
      b,
      skinStates: { expression: { expression } },
    }))

    expect(withExpression('a * b').value).toBe(24)
    expect(withExpression('(a + b) / 2').value).toBe(5)
    expect(withExpression('sqrt(a * a)').value).toBe(6)

    const empty = withExpression('  ')
    expect(empty.value).toBe(0)
    expect(empty.note).toBe('Write an expression using A and B')

    const broken = withExpression('a * * b')
    expect(broken.value).toBe(0)
    expect(broken.note).not.toBeNull()

    // An unknown name is a message, never a thrown error mid-render.
    expect(withExpression('c + 1').note).toContain('Unknown name')
  })

  it('bounds the stored expression and ignores data that is not text', () => {
    expect(expressionText({ expression: 'a+b' })).toBe('a+b')
    expect(expressionText({ expression: 42 })).toBe('')
    expect(expressionText({}).length).toBe(0)
    expect(expressionText({ expression: 'a'.repeat(500) }).length).toBe(240)
  })

  it('weights A and B alongside the skin’s own rows', () => {
    const state = {
      labelA: 'Cost',
      weightA: 2,
      labelB: 'Speed',
      weightB: 1,
      rows: [{ id: 'r1', label: 'Support', value: 10, weight: 1 }],
    }
    const rows = weightedRows(state, 8, 4)

    expect(rows.map((row) => [row.label, row.value, row.weight, row.canonical])).toEqual([
      ['Cost', 8, 2, true],
      ['Speed', 4, 1, true],
      ['Support', 10, 1, false],
    ])
    // (8×2 + 4×1 + 10×1) ÷ 4
    expect(formulaValue(card({ skin: 'weighted_score', a: 8, b: 4, skinStates: { weighted_score: state } })))
      .toBeCloseTo(7.5, 8)

    expect(weightShares(rows)).toEqual([0.5, 0.25, 0.25])
  })

  it('keeps weighted rows safe against stored rubbish, and caps the extras', () => {
    const rows = weightedRows({
      weightA: 'heavy',
      rows: ['nonsense', null, {}, { weight: -5 }, { id: 'x' }, { id: 'y' }],
    }, 1, 2)

    expect(rows[0]!.weight).toBe(1)
    // Two canonical rows plus the four extras the skin allows; the two beyond
    // the cap are dropped rather than silently scoring.
    expect(rows).toHaveLength(6)
    expect(rows[5]!.weight).toBe(0)
    expect(rows.every((row) => Number.isFinite(row.value))).toBe(true)

    const noWeight = formulaReading(card({
      skin: 'weighted_score',
      skinStates: { weighted_score: { weightA: 0, weightB: 0 } },
    }))
    expect(noWeight.value).toBe(0)
    expect(noWeight.note).toBe('Give at least one row some weight')
  })

  it('returns one of two values from a comparison', () => {
    const conditional = (a: number, b: number, state: Record<string, unknown>) => formulaValue(card({
      skin: 'conditional',
      a,
      b,
      skinStates: { conditional: state },
    }))

    expect(conditional(10, 4, { comparator: 'gt', whenTrue: 100, whenFalse: -1 })).toBe(100)
    expect(conditional(2, 4, { comparator: 'gt', whenTrue: 100, whenFalse: -1 })).toBe(-1)
    expect(conditional(4, 4, { comparator: 'gte', whenTrue: 1, whenFalse: 0 })).toBe(1)
    // Defaults are a plain one and zero, so an untouched card is already usable.
    expect(conditional(5, 1, {})).toBe(1)
    expect(conditional(1, 5, {})).toBe(0)

    expect(comparatorOf({ comparator: 'sideways' })).toBe('gt')
    expect(comparisonHolds(3, 3, 'eq')).toBe(true)
    expect(comparisonHolds(3, 4, 'neq')).toBe(true)
    expect(conditionalBranches({ whenTrue: 'yes' })).toEqual({ whenTrue: 1, whenFalse: 0 })
  })

  it('gives every skin its own word for the number it publishes', () => {
    expect(formulaResultWord('two_input')).toBe('Result')
    expect(formulaResultWord('percent_change')).toBe('Change')
    expect(formulaResultWord('growth')).toBe('Next period')
    expect(formulaResultWord('conditional')).toBe('Output')
  })

  it('never throws on half-typed or hostile data', () => {
    const hostile = {
      label: '',
      a: Number.NaN,
      b: Infinity,
      operator: 'wat',
      skin: 'expression',
      skinStates: { expression: { expression: '(((((' } },
    } as unknown as FormulaData
    expect(() => formulaReading(hostile)).not.toThrow()
    expect(formulaValue(hostile)).toBe(0)
  })
})
