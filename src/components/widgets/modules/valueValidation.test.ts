import { describe, expect, it } from 'vitest'
import { BUDGET_AMOUNT_LIMIT, COUNTER_STEP_LIMIT, parseBudgetAmount, safeCounterStep, summarizeNumericColumn } from '../../../utils/widgetValueValidation'

describe('widget value validation regressions', () => {
  it('keeps counter steps positive, bounded, and safely integral', () => {
    expect(safeCounterStep(4)).toBe(4)
    expect(safeCounterStep(Number.MAX_SAFE_INTEGER)).toBe(COUNTER_STEP_LIMIT)
    expect(safeCounterStep(1.5)).toBe(1)
    expect(safeCounterStep(Infinity)).toBe(1)
  })

  it('rejects blank, non-finite, and out-of-range budget drafts instead of rewriting them', () => {
    expect(parseBudgetAmount('')).toHaveProperty('error')
    expect(parseBudgetAmount('Infinity')).toHaveProperty('error')
    expect(parseBudgetAmount(String(BUDGET_AMOUNT_LIMIT + 1))).toHaveProperty('error')
    expect(parseBudgetAmount('-12.5')).toEqual({ value: -12.5 })
  })

  it('does not treat blank table cells as numeric zeroes', () => {
    expect(summarizeNumericColumn([['Amount'], [''], ['  ']], 0)).toBeNull()
    expect(summarizeNumericColumn([['Amount'], ['10'], [''], ['20']], 0)).toBe('Σ 30 · avg 15.0')
  })
})
