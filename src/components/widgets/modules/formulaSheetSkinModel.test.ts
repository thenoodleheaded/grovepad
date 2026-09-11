import { describe, expect, it } from 'vitest'
import type { FormulaSheetData } from '../../../types/widgetDataEducation'
import {
  dataWithFormulaDerivationSteps,
  dataWithFormulaExampleOpen,
  dataWithFormulaExampleValue,
  dataWithFormulaUnit,
  dataWithoutFormula,
  evaluableExpression,
  formatUnits,
  formulaDerivationSteps,
  formulaExampleOpenId,
  formulaExampleResult,
  formulaExampleValues,
  formulaSheetItems,
  formulaSheetSkin,
  formulaSides,
  formulaSubject,
  formulaSymbols,
  formulaUnitVerdict,
  formulaUnits,
  parseUnit,
  substitute,
} from './formulaSheetSkinModel'

const sheet = (formulas: FormulaSheetData['formulas']): FormulaSheetData => ({ formulas })

describe('formulaSheetSkin', () => {
  it('falls back to the reference sheet for anything unknown', () => {
    expect(formulaSheetSkin(undefined)).toBe('reference_sheet')
    expect(formulaSheetSkin('nonsense')).toBe('reference_sheet')
    expect(formulaSheetSkin(7)).toBe('reference_sheet')
  })

  it('keeps a skin it recognises', () => {
    expect(formulaSheetSkin('worked_example')).toBe('worked_example')
  })
})

describe('formulaSheetItems', () => {
  it('survives a record written by something else', () => {
    expect(formulaSheetItems(null)).toEqual([])
    expect(formulaSheetItems([null, 4, { name: 'A' }])).toEqual([
      { id: 'formula-2', name: 'A', expression: '' },
    ])
  })
})

describe('reading an expression', () => {
  it('reads implicit multiplication as separate quantities', () => {
    expect(formulaSymbols('pV = nRT')).toEqual(['p', 'V', 'n', 'R', 'T'])
  })

  it('keeps a word whole but splits a short lowercase run', () => {
    expect(formulaSymbols('A = P(1 + r/n)^(nt)')).toEqual(['A', 'P', 'r', 'n', 't'])
    expect(formulaSymbols('litres = mass / density')).toEqual(['litres', 'mass', 'density'])
  })

  it('never mistakes a function or constant for a quantity', () => {
    expect(formulaSymbols('y = sin(x) + pi')).toEqual(['y', 'x'])
  })

  it('splits an equation and names what it solves for', () => {
    expect(formulaSides('E = mc^2')).toEqual({ left: 'E', right: 'mc^2', balanced: true })
    expect(formulaSubject('E = mc^2')).toBe('E')
    expect(formulaSubject('a + b')).toBe('')
  })

  it('writes implicit multiplication out for the shared evaluator', () => {
    expect(evaluableExpression('nRT')).toBe('n*R*T')
    expect(evaluableExpression('P(1+r/n)')).toBe('P*(1+r/n)')
    expect(evaluableExpression('2x')).toBe('2*x')
    // A function call is not a multiplication.
    expect(evaluableExpression('sin(x)')).toBe('sin(x)')
  })
})

describe('units', () => {
  it('reads a written unit as a product', () => {
    expect(parseUnit('m/s')).toEqual({ numerator: ['m'], denominator: ['s'] })
    expect(parseUnit('kg·m/s^2')).toEqual({ numerator: ['kg', 'm'], denominator: ['s', 's'] })
    expect(parseUnit('m/s²')).toEqual({ numerator: ['m'], denominator: ['s', 's'] })
  })

  it('cancels and prints a signature the same way every time', () => {
    expect(formatUnits({ numerator: ['m', 's'], denominator: ['s'] })).toBe('m')
    expect(formatUnits({ numerator: ['m', 'm'], denominator: [] })).toBe('m^2')
    expect(formatUnits({ numerator: [], denominator: [] })).toBe('dimensionless')
  })

  it('confirms a formula whose two sides are the same quantity', () => {
    const verdict = formulaUnitVerdict('d = vt', { d: 'm', v: 'm/s', t: 's' })
    expect(verdict.state).toBe('balanced')
    expect(verdict.left).toBe('m')
    expect(verdict.right).toBe('m')
  })

  it('flags two sides that are different quantities', () => {
    const verdict = formulaUnitVerdict('d = vt', { d: 'm', v: 'm/s', t: 'kg' })
    expect(verdict.state).toBe('mismatch')
    expect(verdict.left).toBe('m')
  })

  it('flags a sum of unlike units', () => {
    const verdict = formulaUnitVerdict('x = a + b', { x: 'm', a: 'm', b: 's' })
    expect(verdict.state).toBe('mismatch')
    expect(verdict.note).toContain('Adds')
  })

  it('stays quiet while symbols are still unnamed', () => {
    const verdict = formulaUnitVerdict('d = vt', { d: 'm' })
    expect(verdict.state).toBe('unchecked')
    expect(verdict.note).toContain('still need a unit')
  })

  it('reads an integer power but gives up on a symbolic one', () => {
    expect(formulaUnitVerdict('A = s^2', { A: 'm^2', s: 'm' }).state).toBe('balanced')
    expect(formulaUnitVerdict('A = s^n', { A: 'm', s: 'm', n: '1' }).state).toBe('unchecked')
  })

  it('has nothing to check without an equation', () => {
    expect(formulaUnitVerdict('vt', { v: 'm/s' }).state).toBe('unchecked')
  })
})

describe('worked example', () => {
  it('works the formula out with the Calculator’s own arithmetic', () => {
    const result = formulaExampleResult('A = P(1 + r)^2', { P: '100', r: '0.1' })
    expect(result.state).toBe('solved')
    expect(result.text).toBe('121')
  })

  it('handles implicit multiplication the evaluator cannot read alone', () => {
    const result = formulaExampleResult('E = mc^2', { m: '2', c: '3' })
    expect(result.state).toBe('solved')
    expect(result.text).toBe('18')
  })

  it('waits — rather than guessing — while a value is missing', () => {
    const result = formulaExampleResult('E = mc^2', { m: '2' })
    expect(result.state).toBe('waiting')
    expect(result.note).toContain('c')
  })

  it('refuses a formula whose symbols the evaluator would confuse', () => {
    const result = formulaExampleResult('x = V/v', { V: '10', v: '2' })
    expect(result.state).toBe('unsolvable')
    expect(result.note).toContain('cannot both be read')
  })

  it('refuses a value that is not a number', () => {
    expect(formulaExampleResult('y = 2x', { x: 'lots' }).state).toBe('unsolvable')
  })

  it('shows the working with the numbers written in', () => {
    // The × matters: `2 3 ^ 2` would read as a typo, not as a product.
    expect(substitute('mc^2', { m: '2', c: '3' })).toBe('2 × 3 ^ 2')
    expect(substitute('P(1+r)', { P: '100', r: '0.1' })).toBe('100 × (1 + 0.1)')
  })
})

describe('the skin gallery’s own sample', () => {
  // These are the exact values scripts/skins/skinGallerySamples.ts shows off.
  // If the showcase ever displays a red verdict or an unsolved example, it is
  // because one of these stopped being true.
  it('shows the ideal gas law balancing in joules', () => {
    const verdict = formulaUnitVerdict('pV = nRT', {
      p: 'J/m^3', V: 'm^3', n: 'mol', R: 'J/mol·K', T: 'K',
    })
    expect(verdict.state).toBe('balanced')
    expect(verdict.left).toBe('J')
    expect(verdict.right).toBe('J')
  })

  it('solves the compound interest example', () => {
    const result = formulaExampleResult('A = P(1 + r/n)^(nt)', {
      P: '1000', r: '0.05', n: '12', t: '3',
    })
    expect(result.state).toBe('solved')
    expect(Number(result.text)).toBeCloseTo(1161.47, 1)
  })
})

describe('skin state', () => {
  const base = sheet([
    { id: 'f1', name: 'Ideal gas law', expression: 'pV = nRT' },
    { id: 'f2', name: 'Energy', expression: 'E = mc^2' },
  ])

  it('keeps derivation steps for one formula only', () => {
    const next = dataWithFormulaDerivationSteps(base, 'f1', ['pV = nRT', 'p = nRT/V'])
    expect(formulaDerivationSteps(next, 'f1')).toEqual(['pV = nRT', 'p = nRT/V'])
    expect(formulaDerivationSteps(next, 'f2')).toEqual([])
    expect(next.skin).toBe('derivation')
  })

  it('drops a skin’s state entirely once it is emptied', () => {
    const written = dataWithFormulaDerivationSteps(base, 'f1', ['step'])
    const cleared = dataWithFormulaDerivationSteps(written, 'f1', [])
    expect(cleared.skinStates?.derivation).toBeUndefined()
  })

  it('keeps units and example values in separate skins', () => {
    let next = dataWithFormulaUnit(base, 'f1', 'p', 'Pa')
    next = dataWithFormulaExampleValue(next, 'f1', 'p', '101325')
    expect(formulaUnits(next, 'f1')).toEqual({ p: 'Pa' })
    expect(formulaExampleValues(next, 'f1')).toEqual({ p: '101325' })
    expect(next.skinStates?.unit_aware).toBeDefined()
    expect(next.skinStates?.worked_example).toBeDefined()
  })

  it('remembers which example is open', () => {
    const opened = dataWithFormulaExampleOpen(base, 'f2')
    expect(formulaExampleOpenId(opened)).toBe('f2')
    expect(formulaExampleOpenId(dataWithFormulaExampleOpen(opened, ''))).toBe('')
  })

  it('takes every skin’s material with the formula it belonged to', () => {
    let next = dataWithFormulaDerivationSteps(base, 'f1', ['step'])
    next = dataWithFormulaUnit(next, 'f1', 'p', 'Pa')
    next = dataWithFormulaUnit(next, 'f2', 'm', 'kg')
    next = dataWithFormulaExampleOpen(next, 'f1')

    const removed = dataWithoutFormula(next, 'f1')
    expect(removed.formulas.map((formula) => formula.id)).toEqual(['f2'])
    expect(formulaDerivationSteps(removed, 'f1')).toEqual([])
    expect(formulaUnits(removed, 'f1')).toEqual({})
    expect(formulaUnits(removed, 'f2')).toEqual({ m: 'kg' })
    expect(formulaExampleOpenId(removed)).toBe('')
  })
})
