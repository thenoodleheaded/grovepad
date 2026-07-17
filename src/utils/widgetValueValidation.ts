export const COUNTER_STEP_LIMIT = 1_000_000_000
export const BUDGET_AMOUNT_LIMIT = 1e12

export function safeCounterStep(value: number): number {
  if (!Number.isSafeInteger(value)) return 1
  return Math.min(COUNTER_STEP_LIMIT, Math.max(1, value))
}

export function parseBudgetAmount(raw: string): { value?: number; error?: string } {
  if (raw.trim() === '') return { error: 'Enter an amount' }
  const value = Number(raw)
  if (!Number.isFinite(value)) return { error: 'Enter a finite number' }
  if (Math.abs(value) > BUDGET_AMOUNT_LIMIT) {
    return { error: `Amount must be between -${BUDGET_AMOUNT_LIMIT} and ${BUDGET_AMOUNT_LIMIT}` }
  }
  return { value }
}

export function summarizeNumericColumn(rows: string[][], column: number): string | null {
  const numbers = rows.slice(1)
    .map((row) => row[column]?.trim() ?? '')
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite)
  if (numbers.length === 0) return null
  const total = numbers.reduce((sum, value) => sum + value, 0)
  return `Σ ${total} · avg ${(total / numbers.length).toFixed(1)}`
}
