import { describe, expect, it } from 'vitest'
import type { BudgetData } from '../../../types/spatial'
import {
  budgetSkinMode,
  cashflowBalance,
  cashflowState,
  categoryPlanState,
  envelopeState,
  fundProgress,
  projectBudgetState,
  projectStatusTotals,
  ruleState,
  ruleSummary,
  sharedBudgetState,
  sinkingFundsState,
  zeroBasedState,
} from './budgetSkinModel'

const data: BudgetData = {
  currency: '$',
  items: [
    { id: 'rent', label: 'Rent', amount: 500 },
    { id: 'fun', label: 'Fun', amount: 300 },
    { id: 'future', label: 'Future', amount: 200 },
  ],
}

describe('Budget skin model', () => {
  it('falls back safely and sanitizes planned, envelope, and zero-based state', () => {
    expect(budgetSkinMode('unknown')).toBe('category_plan')
    expect(budgetSkinMode('cashflow')).toBe('cashflow')
    expect(categoryPlanState({ actual: { rent: 480, orphan: 99 } }, data).actual).toEqual({
      rent: 480,
      fun: 0,
      future: 0,
    })
    expect(envelopeState({ spent: { rent: 120 } }, data).spent.rent).toBe(120)
    expect(zeroBasedState({ income: '1250' }, data)).toEqual({ income: 1250 })
  })

  it('groups the shared amounts into a deterministic 50 / 30 / 20 reading', () => {
    const state = ruleState({
      buckets: { rent: 'needs', fun: 'wants', future: 'savings', orphan: 'needs' },
    }, data)
    expect(ruleSummary(data, state)).toEqual({
      needs: { amount: 500, share: 0.5, target: 0.5 },
      wants: { amount: 300, share: 0.3, target: 0.3 },
      savings: { amount: 200, share: 0.2, target: 0.2 },
    })
  })

  it('calculates cashflow, sinking-fund progress, shared owners, and project stages', () => {
    const cashflow = cashflowState({
      kinds: { rent: 'expense', fun: 'income', future: 'expense' },
      dates: { rent: '2026-07-02' },
    }, data)
    expect(cashflowBalance(data, cashflow)).toBe(-400)

    expect(sinkingFundsState({
      saved: { future: 50, orphan: 999 },
      due: { future: '2026-12-01' },
    }, data)).toMatchObject({
      saved: { rent: 0, fun: 0, future: 50 },
      due: { future: '2026-12-01' },
    })
    expect(fundProgress(200, 50)).toBe(0.25)

    expect(sharedBudgetState({
      household: 'Home',
      payers: { rent: 'Amir', orphan: 'Nobody' },
    }, data)).toMatchObject({
      household: 'Home',
      payers: { rent: 'Amir', fun: 'Shared', future: 'Shared' },
    })

    const project = projectBudgetState({
      project: 'Launch',
      statuses: { rent: 'paid', fun: 'invoiced', future: 'committed' },
    }, data)
    expect(projectStatusTotals(data, project)).toEqual({
      forecast: 0,
      committed: 200,
      invoiced: 300,
      paid: 500,
    })
  })
})
