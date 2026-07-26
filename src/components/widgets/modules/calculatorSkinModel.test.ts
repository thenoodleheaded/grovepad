import { describe, expect, it } from 'vitest'
import {
  calculatorSkinMode,
  daysBetween,
  evaluateExpression,
  evaluateIntegerExpression,
  financeMode,
  financeRecipe,
  formatInBase,
  formatResult,
  isUsableVariableName,
  namedVariables,
  numberBase,
  offsetDay,
  safeResult,
  tapeEntries,
  tapeTotal,
  variableBindings,
  workingDaysBetween,
  EXPRESSION_LIMIT,
  TAPE_LIMIT,
  VARIABLE_LIMIT,
} from './calculatorSkinModel'

describe('the shared expression evaluator', () => {
  it('does the arithmetic a pocket calculator does', () => {
    expect(evaluateExpression('1+2*3')).toBe(7)
    expect(evaluateExpression('(1+2)*3')).toBe(9)
    expect(evaluateExpression('10/4')).toBe(2.5)
    expect(evaluateExpression('-3 + 5')).toBe(2)
    expect(evaluateExpression('')).toBe(0)
  })

  it('reads powers right-to-left, the way a scientific calculator does', () => {
    expect(evaluateExpression('2^3')).toBe(8)
    expect(evaluateExpression('2^3^2')).toBe(512)
    expect(evaluateExpression('-2^2')).toBe(4)
  })

  it('knows its functions, its constants, and its angle unit', () => {
    expect(evaluateExpression('sqrt(16)')).toBe(4)
    expect(evaluateExpression('log(1000)')).toBeCloseTo(3)
    expect(evaluateExpression('ln(e)')).toBeCloseTo(1)
    expect(evaluateExpression('sin(pi/2)')).toBeCloseTo(1)
    expect(evaluateExpression('sin(90)', { angle: 'deg' })).toBeCloseTo(1)
    expect(evaluateExpression('asin(1)', { angle: 'deg' })).toBeCloseTo(90)
    expect(evaluateExpression('17mod5')).toBe(2)
  })

  it('resolves named variables and refuses names it has no value for', () => {
    expect(evaluateExpression('rate*hours', { variables: { rate: 12, hours: 3 } })).toBe(36)
    expect(() => evaluateExpression('rate*2')).toThrow()
  })

  /** Board data is untrusted: no eval, no unbounded input, no silent NaN. */
  it('refuses input that is not arithmetic', () => {
    for (const hostile of [
      'alert(1)',
      '1;2',
      'globalThis',
      '1+',
      '(1',
      '1..2',
      '5/0',
      '1 & 2',
    ]) {
      expect(() => evaluateExpression(hostile), hostile).toThrow()
    }
    expect(() => evaluateExpression('1+'.repeat(EXPRESSION_LIMIT) + '1')).toThrow()
    expect(() => evaluateExpression('('.repeat(64) + '1' + ')'.repeat(64))).toThrow()
  })

  it('formats a result a person can read, and says Error once', () => {
    expect(formatResult(2.5)).toBe('2.5')
    expect(formatResult(1 / 3)).toBe('0.3333333333')
    expect(formatResult(-0)).toBe('0')
    expect(formatResult(1e15)).toContain('e+')
    expect(formatResult(Number.NaN)).toBe('Error')
    expect(safeResult(() => evaluateExpression('1/0'))).toBe('Error')
    expect(safeResult(() => evaluateExpression('2+2'))).toBe('4')
  })
})

describe('the programmer evaluator', () => {
  it('treats ^ as XOR and knows the rest of the bitwise family', () => {
    expect(evaluateIntegerExpression('6^3', 'dec')).toBe(5)
    expect(evaluateIntegerExpression('12&10', 'dec')).toBe(8)
    expect(evaluateIntegerExpression('12|3', 'dec')).toBe(15)
    expect(evaluateIntegerExpression('1<<4', 'dec')).toBe(16)
    expect(evaluateIntegerExpression('~0', 'dec')).toBe(-1)
    expect(evaluateIntegerExpression('7/2', 'dec')).toBe(3)
  })

  it('reads bare digits in the active base, and prefixes in their own', () => {
    expect(evaluateIntegerExpression('11', 'bin')).toBe(3)
    expect(evaluateIntegerExpression('ff', 'hex')).toBe(255)
    expect(evaluateIntegerExpression('0x10+1', 'bin')).toBe(17)
    expect(() => evaluateIntegerExpression('2', 'bin')).toThrow()
  })

  it('shows one number in every base at once', () => {
    expect(formatInBase(255, 'hex')).toBe('FF')
    expect(formatInBase(255, 'bin')).toBe('11111111')
    expect(formatInBase(-8, 'oct')).toBe('-10')
    expect(numberBase('hex')).toBe('hex')
    expect(numberBase('nonsense')).toBe('dec')
  })
})

describe('the tape', () => {
  it('drops malformed rows and bounds the roll', () => {
    expect(tapeEntries('nope')).toEqual([])
    expect(tapeEntries([{ expression: '1+1' }])).toEqual([])
    const flood = Array.from({ length: 200 }, (_, n) => ({ id: `r${n}`, expression: '1', result: '1' }))
    expect(tapeEntries(flood)).toHaveLength(TAPE_LIMIT)
  })

  it('totals only the rows that produced a number', () => {
    expect(tapeTotal([
      { id: 'a', expression: '2+2', result: '4' },
      { id: 'b', expression: '1/0', result: 'Error' },
      { id: 'c', expression: '10', result: '10' },
    ])).toBe(14)
  })
})

describe('the finance shortcuts', () => {
  it('computes each one the way its name promises', () => {
    const at = (mode: Parameters<typeof financeRecipe>[0], a: number, b: number, c = 0) =>
      financeRecipe(mode).compute(a, b, c)

    expect(at('percent_change', 120, 150)).toBeCloseTo(25)
    expect(at('percent_change', 150, 120)).toBeCloseTo(-20)
    expect(at('margin', 60, 100)).toBeCloseTo(40)
    expect(at('markup', 60, 100)).toBeCloseTo(66.6667, 3)
    expect(at('tax', 200, 20)).toBeCloseTo(240)
    expect(at('compound', 1000, 5, 10)).toBeCloseTo(1628.894, 2)
  })

  it('refuses the divisions that have no meaning', () => {
    expect(() => financeRecipe('percent_change').compute(0, 10, 0)).toThrow()
    expect(() => financeRecipe('margin').compute(10, 0, 0)).toThrow()
    expect(() => financeRecipe('markup').compute(0, 10, 0)).toThrow()
    expect(financeMode('margin')).toBe('margin')
    expect(financeMode('nonsense')).toBe('percent_change')
  })
})

describe('the date maths', () => {
  it('counts days without being moved by daylight saving', () => {
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30)
    // Spring forward in most of Europe and North America falls inside this span.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-03-31', '2026-03-01')).toBe(-30)
    expect(offsetDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(offsetDay('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts weekdays, and says so rather than guessing holidays', () => {
    // 2026-07-27 is a Monday; through Friday 2026-07-31 is five working days.
    expect(workingDaysBetween('2026-07-27', '2026-07-31')).toBe(5)
    expect(workingDaysBetween('2026-07-25', '2026-07-26')).toBe(0)
    expect(workingDaysBetween('2026-07-31', '2026-07-27')).toBe(-5)
  })

  it('refuses input that is not a date, and a range it should not walk', () => {
    expect(() => daysBetween('not-a-date', '2026-01-01')).toThrow()
    expect(() => daysBetween('2026-13-01', '2026-01-01')).toThrow()
    expect(() => workingDaysBetween('1900-01-01', '2100-01-01')).toThrow()
  })
})

describe('named variables', () => {
  it('keeps only names the parser can resolve', () => {
    expect(isUsableVariableName('rate')).toBe(true)
    expect(isUsableVariableName('hours_2')).toBe(true)
    expect(isUsableVariableName('2rate')).toBe(false)
    expect(isUsableVariableName('')).toBe(false)
    // A variable may not shadow a function or a constant.
    expect(isUsableVariableName('sin')).toBe(false)
    expect(isUsableVariableName('pi')).toBe(false)
  })

  it('bounds the slots and drops broken records', () => {
    const flood = Array.from({ length: 20 }, (_, n) => ({ id: `v${n}`, name: `a${n}`, value: n }))
    expect(namedVariables(flood)).toHaveLength(VARIABLE_LIMIT)
    expect(namedVariables([{ name: 'rate', value: 1 }])).toEqual([])
    expect(namedVariables([{ id: 'v', name: 'rate', value: Number.NaN }])[0]!.value).toBe(0)
  })

  it('binds usable names only, then feeds the evaluator', () => {
    const bindings = variableBindings([
      { id: 'a', name: 'Rate', value: 12 },
      { id: 'b', name: '', value: 5 },
      { id: 'c', name: 'pi', value: 3 },
    ])
    expect(bindings).toEqual({ rate: 12 })
    expect(evaluateExpression('rate*2', { variables: bindings })).toBe(24)
    // The shadowing attempt did not take: pi is still pi.
    expect(evaluateExpression('pi', { variables: bindings })).toBeCloseTo(Math.PI)
  })
})

describe('skin selection', () => {
  it('falls back to the basic keypad for an unknown skin', () => {
    expect(calculatorSkinMode('finance')).toBe('finance')
    expect(calculatorSkinMode('not_a_skin')).toBe('basic')
    expect(calculatorSkinMode(undefined)).toBe('basic')
  })
})
