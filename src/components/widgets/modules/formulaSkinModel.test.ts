import { describe, expect, it } from 'vitest'
import type { FormulaData } from '../../../types/widgetDataWorkflow'
import {
  branchText,
  comparatorOf,
  comparisonHolds,
  conditionalBranches,
  dataWithInputCount,
  dataWithInputName,
  dataWithInputValue,
  expressionText,
  FORMULA_INPUT_MAX,
  formulaAnswerText,
  formulaBindings,
  formulaInputCount,
  formulaInputs,
  formulaPrecision,
  formulaReading,
  formulaResultWord,
  formulaSkinMode,
  formulaValid,
  formulaValue,
  growthPeriods,
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
    expect(formulaReading(card({ skin: 'ratio', a: 0, b: 0 })).note)
      .toBe('Parts that add to zero make no ratio')

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
    expect(empty.note).toBe('Write an expression using your inputs')

    const broken = withExpression('a * * b')
    expect(broken.value).toBe(0)
    expect(broken.note).not.toBeNull()

    // An unknown name is a message, never a thrown error mid-render.
    expect(withExpression('zebra + 1').note).toContain('Unknown name')
  })

  it('bounds the stored expression and ignores data that is not text', () => {
    expect(expressionText({ expression: 'a+b' })).toBe('a+b')
    expect(expressionText({ expression: 42 })).toBe('')
    expect(expressionText({}).length).toBe(0)
    expect(expressionText({ expression: 'a'.repeat(500) }).length).toBe(240)
  })

  it('weights every wired input alongside the skin’s own rows', () => {
    const state = {
      labelA: 'Cost',
      weightA: 2,
      labelB: 'Speed',
      weightB: 1,
      rows: [{ id: 'r1', label: 'Support', value: 10, weight: 1 }],
    }
    const scored = card({ skin: 'weighted_score', a: 8, b: 4, skinStates: { weighted_score: state } })
    const rows = weightedRows(scored)

    expect(rows.map((row) => [row.label, row.value, row.weight, row.canonical])).toEqual([
      ['Cost', 8, 2, true],
      ['Speed', 4, 1, true],
      ['Support', 10, 1, false],
    ])
    // (8×2 + 4×1 + 10×1) ÷ 4
    expect(formulaValue(scored)).toBeCloseTo(7.5, 8)

    expect(weightShares(rows)).toEqual([0.5, 0.25, 0.25])
  })

  it('keeps weighted rows safe against stored rubbish, and caps the extras', () => {
    const rows = weightedRows(card({
      skin: 'weighted_score',
      a: 1,
      b: 2,
      skinStates: {
        weighted_score: {
          weightA: 'heavy',
          rows: ['nonsense', null, {}, { weight: -5 }, { id: 'x' }, { id: 'y' }],
        },
      },
    }))

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
    // A branch written as words nobody can evaluate keeps the plain default
    // and reports why, rather than publishing a number out of nowhere.
    expect(conditionalBranches({ whenTrue: 'yes' })).toMatchObject({
      whenTrue: 1,
      whenFalse: 0,
      trueNote: 'Unknown name yes',
    })
  })

  it('gives every skin its own word for the number it publishes', () => {
    expect(formulaResultWord('two_input')).toBe('Result')
    expect(formulaResultWord('percent_change')).toBe('Change')
    expect(formulaResultWord('growth')).toBe('Projected')
    expect(formulaResultWord('conditional')).toBe('Output')
  })

  /* ------------------------------------------------------- six named inputs */

  /**
   * The card grew from two numbers to six, and each one is a port. A board
   * written before it grew stores neither `inputCount` nor the extra slots, so
   * it must still hold exactly two.
   */
  it('holds two inputs until a card asks for more, and never more than six', () => {
    expect(formulaInputs(card({})).map((input) => input.key)).toEqual(['a', 'b'])
    expect(formulaInputCount(card({}))).toBe(2)
    expect(formulaInputCount(card({ inputCount: 99 }))).toBe(FORMULA_INPUT_MAX)
    expect(formulaInputCount(card({ inputCount: 0 }))).toBe(2)

    const four = dataWithInputCount(card({}), 4)
    expect(formulaInputs(four).map((input) => input.key)).toEqual(['a', 'b', 'c', 'd'])
    // Every slot prints its own letter until the card names it.
    expect(formulaInputs(four).map((input) => input.title)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('forgets the slots it drops, so a narrowed card is the card it was', () => {
    const grown = dataWithInputName(
      { ...dataWithInputCount(card({}), 4), c: 12, d: 7 },
      'c',
      'stock',
    )
    expect(grown.c).toBe(12)

    const narrowed = dataWithInputCount(grown, 2)
    expect(narrowed).not.toHaveProperty('c')
    expect(narrowed).not.toHaveProperty('d')
    expect(narrowed).not.toHaveProperty('inputCount')
    expect(narrowed.names).toBeUndefined()
  })

  /** A number a reader cannot see is a number the card is hiding. */
  it('opens a slot when a wire writes one the card had not shown yet', () => {
    const written = dataWithInputValue(card({}), 'd', 9)
    expect(written.d).toBe(9)
    expect(formulaInputs(written).map((input) => input.key)).toEqual(['a', 'b', 'c', 'd'])
    // Writing a slot the card already shows leaves the rack alone.
    expect(dataWithInputValue(card({}), 'b', 3).inputCount).toBeUndefined()
  })

  it('lets an expression call an input by its name as well as its letter', () => {
    const named = dataWithInputName(
      dataWithInputName({ ...dataWithInputCount(card({}), 3), a: 4, b: 5, c: 6 }, 'a', 'price'),
      'c',
      'Tax Rate',
    )
    const bindings = formulaBindings(formulaInputs(named))
    expect(bindings).toMatchObject({ a: 4, b: 5, c: 6, price: 4 })
    // A name the parser could never read is simply not offered.
    expect(bindings).not.toHaveProperty('Tax Rate')

    expect(formulaValue({
      ...named,
      skin: 'expression',
      skinStates: { expression: { expression: 'price * b + c' } },
    })).toBe(26)
  })

  /** One letter, one port: a slot must not answer to another slot's name. */
  it('refuses a name that would shadow another input', () => {
    const shadowed = dataWithInputName({ ...dataWithInputCount(card({}), 3), a: 1, c: 3 }, 'c', 'a')
    expect(formulaBindings(formulaInputs(shadowed)).a).toBe(1)
  })

  it('carries the chain down every input the card holds', () => {
    const chain = { ...dataWithInputCount(card({}), 4), a: 2, b: 3, c: 4, d: 5 }
    expect(formulaValue({ ...chain, operator: 'add' })).toBe(14)
    expect(formulaValue({ ...chain, operator: 'multiply' })).toBe(120)
    expect(formulaValue({ ...chain, operator: 'power', b: 2, c: 2, d: 2 })).toBe(256)
    // A zero anywhere in a division chain is said plainly, not published.
    const divided = formulaReading({ ...chain, c: 0, operator: 'divide' })
    expect(divided.value).toBe(0)
    expect(divided.note).toBe('One of the inputs is zero, so this cannot be divided')
  })

  it('lets a skin ask its question of any pair of inputs', () => {
    const four = { ...dataWithInputCount(card({}), 4), a: 1, b: 2, c: 200, d: 250 }
    expect(formulaValue({
      ...four,
      skin: 'percent_change',
      skinStates: { percent_change: { fromKey: 'c', toKey: 'd' } },
    })).toBe(25)

    // A role pointing at a slot the card no longer holds falls back rather
    // than reading a number that is gone.
    expect(formulaValue({
      ...card({ a: 200, b: 250 }),
      skin: 'percent_change',
      skinStates: { percent_change: { fromKey: 'e' } },
    })).toBe(25)
  })

  it('reads one input’s share of every part, not just of two', () => {
    const parts = { ...dataWithInputCount(card({}), 4), a: 1, b: 1, c: 1, d: 1 }
    expect(formulaValue({ ...parts, skin: 'ratio' })).toBe(25)
    expect(formulaValue({
      ...parts,
      d: 7,
      skin: 'ratio',
      skinStates: { ratio: { partKey: 'd' } },
    })).toBe(70)
  })

  it('projects as many periods as the card asks for', () => {
    const compound = card({ skin: 'growth', a: 1000, b: 10 })
    expect(formulaReading(compound).value).toBeCloseTo(1100, 8)
    expect(formulaReading({
      ...compound,
      skinStates: { growth: { periods: 3 } },
    }).value).toBeCloseTo(1331, 8)
    expect(growthPeriods({ periods: 999 })).toBe(24)
    expect(growthPeriods({})).toBe(1)
  })

  it('answers either branch with an expression over the card’s inputs', () => {
    const priced = { ...dataWithInputCount(card({}), 3), a: 10, b: 4, c: 100 }
    expect(formulaValue({
      ...priced,
      skin: 'conditional',
      skinStates: { conditional: { comparator: 'gt', whenTrue: 'c * 0.9', whenFalse: 'c' } },
    })).toBe(90)
    expect(formulaValue({
      ...priced,
      a: 1,
      skin: 'conditional',
      skinStates: { conditional: { comparator: 'gt', whenTrue: 'c * 0.9', whenFalse: 'c' } },
    })).toBe(100)

    // A branch that cannot be read says so instead of throwing mid-render.
    const broken = formulaReading({
      ...priced,
      skin: 'conditional',
      skinStates: { conditional: { whenTrue: 'c *' } },
    })
    expect(broken.note).not.toBeNull()
    expect(branchText({ whenTrue: 'c * 0.9' }, 'whenTrue')).toBe('c * 0.9')
    expect(branchText({}, 'whenFalse')).toBe('0')
  })

  /**
   * Rounding is part of the answer, not a coat of paint: the wire has to carry
   * the number the reader can see.
   */
  it('publishes the answer at the precision the card prints it', () => {
    const rounded = card({ a: 1, b: 3, operator: 'divide', precision: 2 })
    expect(formulaValue(rounded)).toBe(0.33)
    expect(formulaAnswerText(rounded)).toBe('0.33')
    expect(formulaAnswerText(card({ a: 2, b: 3, unit: 'kg' }))).toBe('5 kg')
    // A unit takes the place of the skin's own suffix.
    expect(formulaReading(card({ skin: 'percent_change', unit: 'pts' })).suffix).toBe('pts')
    expect(formulaPrecision(card({ precision: 99 }))).toBe(6)
    expect(formulaPrecision(card({}))).toBeNull()
  })

  it('says whether the question can be answered at all', () => {
    expect(formulaValid(card({ a: 7, b: 2, operator: 'divide' }))).toBe(true)
    expect(formulaValid(card({ a: 7, b: 0, operator: 'divide' }))).toBe(false)
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
