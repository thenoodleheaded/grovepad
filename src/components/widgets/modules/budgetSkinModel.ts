import type { BudgetData } from '../../../types/spatial'

export type BudgetSkinMode =
  | 'category_plan'
  | 'envelope'
  | 'zero_based'
  | '50_30_20'
  | 'cashflow'
  | 'sinking_funds'
  | 'shared_budget'
  | 'project_budget'

export type BudgetRuleBucket = 'needs' | 'wants' | 'savings'
export type CashflowKind = 'expense' | 'income'
export type ProjectCostStatus = 'forecast' | 'committed' | 'invoiced' | 'paid'

export interface ZeroBasedState {
  income: number
}

export interface CategoryPlanState {
  actual: Record<string, number>
}

export interface EnvelopeState {
  spent: Record<string, number>
}

export interface RuleState {
  buckets: Record<string, BudgetRuleBucket>
}

export interface CashflowState {
  dates: Record<string, string>
  kinds: Record<string, CashflowKind>
}

export interface SinkingFundsState {
  saved: Record<string, number>
  due: Record<string, string>
}

export interface SharedBudgetState {
  household: string
  payers: Record<string, string>
}

export interface ProjectBudgetState {
  project: string
  statuses: Record<string, ProjectCostStatus>
}

const SKINS = new Set<BudgetSkinMode>([
  'category_plan',
  'envelope',
  'zero_based',
  '50_30_20',
  'cashflow',
  'sinking_funds',
  'shared_budget',
  'project_budget',
])

const RULE_BUCKETS = new Set<BudgetRuleBucket>(['needs', 'wants', 'savings'])
const CASHFLOW_KINDS = new Set<CashflowKind>(['expense', 'income'])
const PROJECT_STATUSES = new Set<ProjectCostStatus>([
  'forecast',
  'committed',
  'invoiced',
  'paid',
])

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function finite(raw: unknown, fallback = 0): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function money(raw: unknown, fallback = 0): number {
  return Math.min(1_000_000_000_000, Math.max(0, finite(raw, fallback)))
}

function shortText(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw.slice(0, 80) : fallback
}

function stringMap(
  raw: unknown,
  data: BudgetData,
  fallback: (id: string, index: number) => string,
): Record<string, string> {
  const source = record(raw)
  return Object.fromEntries(data.items.map((item, index) => [
    item.id,
    shortText(source[item.id], fallback(item.id, index)),
  ]))
}

function enumMap<T extends string>(
  raw: unknown,
  data: BudgetData,
  allowed: ReadonlySet<T>,
  fallback: (id: string, index: number) => T,
): Record<string, T> {
  const source = record(raw)
  return Object.fromEntries(data.items.map((item, index) => {
    const value = source[item.id]
    return [
      item.id,
      typeof value === 'string' && allowed.has(value as T)
        ? value as T
        : fallback(item.id, index),
    ]
  }))
}

function moneyMap(
  raw: unknown,
  data: BudgetData,
  fallback: (id: string, index: number) => number,
): Record<string, number> {
  const source = record(raw)
  return Object.fromEntries(data.items.map((item, index) => [
    item.id,
    money(source[item.id], fallback(item.id, index)),
  ]))
}

export function budgetSkinMode(raw: unknown): BudgetSkinMode {
  return typeof raw === 'string' && SKINS.has(raw as BudgetSkinMode)
    ? raw as BudgetSkinMode
    : 'category_plan'
}

export function budgetTotal(data: BudgetData): number {
  return data.items.reduce(
    (total, item) => total + (Number.isFinite(item.amount) ? item.amount : 0),
    0,
  )
}

export function budgetMagnitude(data: BudgetData): number {
  return data.items.reduce(
    (total, item) => total + (Number.isFinite(item.amount) ? Math.abs(item.amount) : 0),
    0,
  )
}

export function budgetShare(amount: number, data: BudgetData): number {
  const total = budgetMagnitude(data)
  return total > 0 ? Math.abs(amount) / total : 0
}

export function categoryPlanState(raw: unknown, data: BudgetData): CategoryPlanState {
  const source = record(raw)
  return { actual: moneyMap(source.actual, data, () => 0) }
}

export function envelopeState(raw: unknown, data: BudgetData): EnvelopeState {
  const source = record(raw)
  return { spent: moneyMap(source.spent, data, () => 0) }
}

export function zeroBasedState(raw: unknown, data: BudgetData): ZeroBasedState {
  const source = record(raw)
  return { income: money(source.income, Math.max(0, budgetMagnitude(data))) }
}

export function ruleState(raw: unknown, data: BudgetData): RuleState {
  const source = record(raw)
  const defaults: BudgetRuleBucket[] = ['needs', 'wants', 'savings']
  return {
    buckets: enumMap(
      source.buckets,
      data,
      RULE_BUCKETS,
      (_id, index) => defaults[index % defaults.length]!,
    ),
  }
}

export function ruleSummary(
  data: BudgetData,
  state: RuleState,
): Record<BudgetRuleBucket, { amount: number; share: number; target: number }> {
  const total = budgetMagnitude(data)
  const amounts: Record<BudgetRuleBucket, number> = { needs: 0, wants: 0, savings: 0 }
  for (const item of data.items) {
    amounts[state.buckets[item.id] ?? 'needs'] += Math.abs(item.amount)
  }
  return {
    needs: { amount: amounts.needs, share: total ? amounts.needs / total : 0, target: 0.5 },
    wants: { amount: amounts.wants, share: total ? amounts.wants / total : 0, target: 0.3 },
    savings: { amount: amounts.savings, share: total ? amounts.savings / total : 0, target: 0.2 },
  }
}

export function cashflowState(raw: unknown, data: BudgetData): CashflowState {
  const source = record(raw)
  return {
    dates: stringMap(source.dates, data, () => ''),
    kinds: enumMap(source.kinds, data, CASHFLOW_KINDS, () => 'expense'),
  }
}

export function cashflowBalance(data: BudgetData, state: CashflowState): number {
  return data.items.reduce((balance, item) => (
    balance + (state.kinds[item.id] === 'income' ? Math.abs(item.amount) : -Math.abs(item.amount))
  ), 0)
}

export function sinkingFundsState(raw: unknown, data: BudgetData): SinkingFundsState {
  const source = record(raw)
  return {
    saved: moneyMap(source.saved, data, () => 0),
    due: stringMap(source.due, data, () => ''),
  }
}

export function fundProgress(target: number, saved: number): number {
  if (target <= 0) return saved > 0 ? 1 : 0
  return Math.min(1, Math.max(0, saved / target))
}

export function sharedBudgetState(raw: unknown, data: BudgetData): SharedBudgetState {
  const source = record(raw)
  return {
    household: shortText(source.household, 'Our budget'),
    payers: stringMap(source.payers, data, () => 'Shared'),
  }
}

export function projectBudgetState(raw: unknown, data: BudgetData): ProjectBudgetState {
  const source = record(raw)
  return {
    project: shortText(source.project, 'Project runway'),
    statuses: enumMap(source.statuses, data, PROJECT_STATUSES, () => 'forecast'),
  }
}

export function projectStatusTotals(
  data: BudgetData,
  state: ProjectBudgetState,
): Record<ProjectCostStatus, number> {
  const totals: Record<ProjectCostStatus, number> = {
    forecast: 0,
    committed: 0,
    invoiced: 0,
    paid: 0,
  }
  for (const item of data.items) {
    totals[state.statuses[item.id] ?? 'forecast'] += Math.abs(item.amount)
  }
  return totals
}
