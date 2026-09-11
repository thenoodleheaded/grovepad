import type { BudgetData, BudgetItem } from '../../types/spatial'
import {
  budgetMagnitude,
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
  type BudgetRuleBucket,
  type ProjectCostStatus,
} from '../../components/widgets/modules/budgetSkinModel'
import { skinStateFor } from '../widgetSkins'
import {
  clampFraction,
  compact,
  formatRestNumber,
  REST_BAR_LIMIT,
  REST_ROW_LIMIT,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Budget resting faces.
//
// One set of line items behind eight financial lenses, and each folds to the
// number that lens is actually about: a folded Category Plan is its spend
// bars under the plan-remaining verdict, a folded Zero-based is the dollars
// still unassigned, a folded Cashflow is money in against money out. Every
// reading comes from the same budgetSkinModel derivations the open card
// renders, so the tile, the card, and the Total wire can never disagree.
//
// No new grammar exists for money: bars, gauge, split, and rows already carry
// everything these faces need, so each skin costs one bounded pure builder
// and nothing else.
// ---------------------------------------------------------------------------

const RULE_META: readonly { bucket: BudgetRuleBucket; label: string }[] = [
  { bucket: 'needs', label: 'Needs 50%' },
  { bucket: 'wants', label: 'Wants 30%' },
  { bucket: 'savings', label: 'Savings 20%' },
]

const PROJECT_META: readonly { status: ProjectCostStatus; label: string }[] = [
  { status: 'forecast', label: 'Forecast' },
  { status: 'committed', label: 'Committed' },
  { status: 'invoiced', label: 'Invoiced' },
  { status: 'paid', label: 'Paid' },
]

/** Tile money: compact magnitude (`$1.2k`), not the open card's cent-exact
 * ledger figure — a resting tile answers "roughly where am I", not "audit me". */
function moneyRest(currency: string, value: number): string {
  return `${value < 0 ? '−' : ''}${currency}${formatRestNumber(Math.abs(value))}`
}

/** The biggest lines make the tile: with only a few bars to spend, the lens
 * shows where the money actually is rather than whatever was typed first. */
function largestFirst(items: readonly BudgetItem[]): BudgetItem[] {
  return [...items].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, REST_BAR_LIMIT)
}

export function budgetRestingFace(data: Record<string, unknown>): RestingFaceModel {
  const budget = data as unknown as BudgetData
  const items = Array.isArray(budget.items)
    ? budget.items.filter((item): item is BudgetItem => !!item && typeof item === 'object')
    : []
  // An empty budget opens as its empty state; it folds as honestly.
  if (items.length === 0) return { kind: 'icon' }
  const skin = budgetSkinMode(budget.skin)
  const currency = typeof budget.currency === 'string' && budget.currency ? budget.currency : '$'
  const state = skinStateFor(budget, skin)
  const label = (item: BudgetItem, fallback: string, limit: number) =>
    compact(typeof item.label === 'string' && item.label.trim() ? item.label : fallback, limit)

  if (skin === 'envelope') {
    const { spent } = envelopeState(state, budget)
    return {
      kind: 'bars',
      bars: largestFirst(items).map((item) => {
        const allocated = Math.abs(item.amount)
        const used = spent[item.id] ?? 0
        const remaining = allocated - used
        return {
          key: item.id,
          label: label(item, 'Untitled envelope', 18),
          value: moneyRest(currency, remaining),
          fraction: allocated > 0 ? clampFraction(used / allocated) : used > 0 ? 1 : 0,
          ...(remaining < 0 ? { tone: 'bad' as const } : {}),
        }
      }),
    }
  }

  if (skin === 'zero_based') {
    const { income } = zeroBasedState(state, budget)
    const assigned = budgetMagnitude(budget)
    const remaining = income - assigned
    const balanced = Math.abs(remaining) < 0.005
    const progress = income > 0 ? clampFraction(assigned / income) : 0
    return {
      kind: 'gauge',
      progress,
      primary: moneyRest(currency, remaining),
      secondary: balanced ? 'Every dollar assigned' : remaining > 0 ? 'Left to assign' : 'Over-assigned',
      caption: `${Math.round(progress * 100)}% assigned`,
      tone: balanced ? 'good' : remaining < 0 ? 'bad' : 'accent',
    }
  }

  if (skin === '50_30_20') {
    const summary = ruleSummary(budget, ruleState(state, budget))
    return {
      kind: 'bars',
      bars: RULE_META.map(({ bucket, label: bucketLabel }) => {
        const reading = summary[bucket]
        return {
          key: bucket,
          label: bucketLabel,
          value: moneyRest(currency, reading.amount),
          fraction: clampFraction(reading.share / reading.target),
          ...(reading.share > reading.target ? { tone: 'warn' as const } : {}),
        }
      }),
    }
  }

  if (skin === 'cashflow') {
    // enumMap defaults an unset line to expense, exactly as the open card does.
    const cash = cashflowState(state, budget)
    const balance = cashflowBalance(budget, cash)
    const sum = (kind: 'income' | 'expense') => items.reduce(
      (total, item) => total + (cash.kinds[item.id] === kind ? Math.abs(item.amount) : 0),
      0,
    )
    return {
      kind: 'split',
      divider: '−',
      eyebrow: {
        label: 'Net cashflow',
        note: moneyRest(currency, balance),
        tone: balance < 0 ? 'bad' : 'good',
      },
      left: { primary: moneyRest(currency, sum('income')), secondary: 'Money in', tone: 'good' },
      right: { primary: moneyRest(currency, sum('expense')), secondary: 'Money out' },
    }
  }

  if (skin === 'sinking_funds') {
    const { saved } = sinkingFundsState(state, budget)
    return {
      kind: 'bars',
      bars: largestFirst(items).map((item) => {
        const progress = fundProgress(Math.abs(item.amount), saved[item.id] ?? 0)
        return {
          key: item.id,
          label: label(item, 'Untitled goal', 18),
          value: `${Math.round(progress * 100)}%`,
          fraction: progress,
          ...(progress >= 1 ? { tone: 'good' as const } : {}),
        }
      }),
    }
  }

  if (skin === 'shared_budget') {
    const shared = sharedBudgetState(state, budget)
    const visible = items.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: { label: compact(shared.household, 20) },
      rows: visible.map((item) => ({
        key: item.id,
        label: label(item, 'Untitled line', 22),
        lead: compact(shared.payers[item.id] || 'Shared', 10),
        value: moneyRest(currency, item.amount),
      })),
      overflow: Math.max(0, items.length - visible.length),
    }
  }

  if (skin === 'project_budget') {
    const project = projectBudgetState(state, budget)
    const totals = projectStatusTotals(budget, project)
    const magnitude = budgetMagnitude(budget)
    return {
      kind: 'bars',
      eyebrow: { label: compact(project.project, 20) },
      bars: PROJECT_META.map(({ status, label: statusLabel }) => ({
        key: status,
        label: statusLabel,
        value: moneyRest(currency, totals[status]),
        fraction: magnitude > 0 ? clampFraction(totals[status] / magnitude) : 0,
        ...(status === 'paid' ? { tone: 'good' as const } : status === 'forecast' ? { tone: 'muted' as const } : {}),
      })),
    }
  }

  // category_plan — the default lens. The open card leads with the
  // plan-remaining verdict, so the tile does too.
  const { actual } = categoryPlanState(state, budget)
  const actualTotal = items.reduce((total, item) => total + (actual[item.id] ?? 0), 0)
  const variance = budgetMagnitude(budget) - actualTotal
  return {
    kind: 'bars',
    eyebrow: {
      label: variance < 0 ? 'Over plan' : 'Plan remaining',
      note: moneyRest(currency, variance),
      tone: variance < 0 ? 'bad' : 'good',
    },
    bars: largestFirst(items).map((item) => {
      const planned = Math.abs(item.amount)
      const spent = actual[item.id] ?? 0
      return {
        key: item.id,
        label: label(item, 'Untitled line', 18),
        value: moneyRest(currency, planned),
        fraction: planned > 0 ? clampFraction(spent / planned) : spent > 0 ? 1 : 0,
        ...(spent > planned ? { tone: 'bad' as const } : {}),
      }
    }),
  }
}
