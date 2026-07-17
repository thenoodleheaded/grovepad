import type { DebtPayoffData, ExpenseSplitData, SeriesPoint } from '../types/spatial'
import { localDayKey, localDayKeyInDays } from '../utils/localDate'

export { localDayKey, localDayKeyInDays }

export const DAY_MS = 86_400_000

export function daysUntilDate(value: string, now = Date.now()): number {
  if (!value) return 0
  const target = new Date(`${value}T00:00:00`).getTime()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  return Number.isFinite(target) ? Math.ceil((target - today.getTime()) / DAY_MS) : 0
}

export function monthsSince(value: string, now = new Date()): number {
  if (!value) return Infinity
  const date = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(date.getTime())) return Infinity
  return Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth())
}

export interface DebtProjection { months: number; interest: number; debtFreeDate: string; viable: boolean }

export function projectDebtPayoff(data: DebtPayoffData, now = new Date()): DebtProjection {
  const debts = data.debts.map((debt) => ({ ...debt, balance: Math.max(0, debt.balance) }))
  let interest = 0
  let months = 0
  while (debts.some((debt) => debt.balance > 0.005) && months < 1200) {
    months++
    for (const debt of debts) {
      const charge = debt.balance * Math.max(0, debt.apr) / 1200
      debt.balance += charge
      interest += charge
    }
    const minimums = debts.reduce((sum, debt) => sum + (debt.balance > 0 ? Math.max(0, debt.minPayment) : 0), 0)
    let available = minimums + Math.max(0, data.extraPayment)
    for (const debt of debts) {
      const payment = Math.min(debt.balance, Math.max(0, debt.minPayment))
      debt.balance -= payment
      available -= payment
    }
    const ordered = debts.filter((debt) => debt.balance > 0).sort((a, b) =>
      data.strategy === 'avalanche' ? b.apr - a.apr || a.balance - b.balance : a.balance - b.balance || b.apr - a.apr,
    )
    for (const debt of ordered) {
      if (available <= 0) break
      const payment = Math.min(debt.balance, available)
      debt.balance -= payment
      available -= payment
    }
    if (minimums + data.extraPayment <= 0 || debts.every((debt) => debt.minPayment <= debt.balance * debt.apr / 1200)) {
      return { months: Infinity, interest, debtFreeDate: 'No payoff', viable: false }
    }
  }
  const date = new Date(now.getFullYear(), now.getMonth() + months, 1)
  return { months, interest, debtFreeDate: localDayKey(date.getTime()), viable: months < 1200 }
}

export interface SettlementTransfer { from: string; to: string; amount: number }

export function settleExpenses(data: ExpenseSplitData): SettlementTransfer[] {
  const balances = new Map(data.people.map((person) => [person, 0]))
  for (const expense of data.expenses) {
    const participants = expense.splitAmong.filter((person) => balances.has(person))
    if (!participants.length || !balances.has(expense.paidBy)) continue
    const share = expense.amount / participants.length
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amount)
    participants.forEach((person) => balances.set(person, (balances.get(person) ?? 0) - share))
  }
  const creditors = [...balances].filter(([, value]) => value > 0.005).map(([person, value]) => ({ person, value })).sort((a,b)=>b.value-a.value)
  const debtors = [...balances].filter(([, value]) => value < -0.005).map(([person, value]) => ({ person, value: -value })).sort((a,b)=>b.value-a.value)
  const transfers: SettlementTransfer[] = []
  let ci = 0; let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!; const debtor = debtors[di]!
    const amount = Math.min(creditor.value, debtor.value)
    transfers.push({ from: debtor.person, to: creditor.person, amount: Math.round(amount * 100) / 100 })
    creditor.value -= amount; debtor.value -= amount
    if (creditor.value < 0.005) ci++
    if (debtor.value < 0.005) di++
  }
  return transfers
}

export function appendSample(samples: readonly SeriesPoint[], value: number, at = Date.now()): SeriesPoint[] {
  return [...samples, { t: at, v: Number.isFinite(value) ? value : 0 }].slice(-400)
}

export function seriesAverage(samples: readonly SeriesPoint[]): number {
  return samples.length ? samples.reduce((sum, sample) => sum + sample.v, 0) / samples.length : 0
}

export function seriesDelta7d(samples: readonly SeriesPoint[], now = Date.now()): number {
  const latest = samples.at(-1)
  if (!latest) return 0
  const cutoff = now - 7 * DAY_MS
  let baseline = samples[0]
  for (const sample of samples) {
    if (sample.t <= cutoff) baseline = sample
    else break
  }
  return baseline ? latest.v - baseline.v : 0
}
