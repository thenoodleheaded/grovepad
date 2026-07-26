import type { FormulaData, FormulaOperator } from '../../../types/widgetDataWorkflow'
import { evaluateExpression, EXPRESSION_LIMIT, formatResult } from './calculatorSkinModel'

/**
 * Formula skin data and the one calculation every reader of this card shares.
 *
 * A Formula is a logic card: `a`, `b`, and `operator` stay canonical — a wire
 * writes A and B, and every skin keeps both on screen and editable. What a
 * skin changes is the *question* asked of those two numbers: their sum, the
 * percent between them, their ratio, one period of growth, a written
 * expression, a weighted average, or a choice between two outcomes.
 *
 * Because a skin changes the question, `formulaReading` is the single owner of
 * the answer. The renderer's hero number, the resting tile, and the `result`
 * field a circuit reads all call it, so the number on the card and the number
 * on the wire can never disagree. A card with no stored skin reads exactly as
 * the two-input card always did, so existing boards are untouched.
 */

export type FormulaSkinMode =
  | 'two_input'
  | 'percent_change'
  | 'ratio'
  | 'growth'
  | 'expression'
  | 'weighted_score'
  | 'conditional'

const SKIN_MODES = new Set<FormulaSkinMode>([
  'two_input',
  'percent_change',
  'ratio',
  'growth',
  'expression',
  'weighted_score',
  'conditional',
])

export function formulaSkinMode(raw: unknown): FormulaSkinMode {
  return typeof raw === 'string' && SKIN_MODES.has(raw as FormulaSkinMode)
    ? raw as FormulaSkinMode
    : 'two_input'
}

/* ------------------------------------------------------------- vocabulary */

export const OPERATOR_SYMBOL: Record<FormulaOperator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  modulo: 'mod',
}

export const OPERATOR_WORD: Record<FormulaOperator, string> = {
  add: 'plus',
  subtract: 'minus',
  multiply: 'times',
  divide: 'divided by',
  modulo: 'remainder of',
}

export const OPERATORS = Object.keys(OPERATOR_SYMBOL) as FormulaOperator[]

export function formulaOperator(raw: unknown): FormulaOperator {
  return typeof raw === 'string' && raw in OPERATOR_SYMBOL
    ? raw as FormulaOperator
    : 'add'
}

/** Each skin's own name for the number it publishes. */
const RESULT_WORD: Record<FormulaSkinMode, string> = {
  two_input: 'Result',
  percent_change: 'Change',
  ratio: 'A of total',
  growth: 'Next period',
  expression: 'Result',
  weighted_score: 'Score',
  conditional: 'Output',
}

export function formulaResultWord(skin: FormulaSkinMode): string {
  return RESULT_WORD[skin]
}

const finite = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
)

export { formatResult as formatFormulaNumber }

/* ----------------------------------------------------------------- skins */

export interface FormulaReading {
  /** The number this card shows and publishes. One truth, not two. */
  value: number
  /** Printed after the value: '%' where the answer is a percentage. */
  suffix: string
  /**
   * Why the answer is what it is when the inputs cannot really answer the
   * question — a zero divisor, an empty expression, weights summing to zero.
   * Never an exception: a half-typed card must still render.
   */
  note: string | null
}

const OK = (value: number, suffix = ''): FormulaReading => ({ value, suffix, note: null })

/** The classic two-operand answer — unchanged from the card's first version. */
export function twoInputValue(a: number, b: number, operator: FormulaOperator): number {
  if (operator === 'add') return a + b
  if (operator === 'subtract') return a - b
  if (operator === 'multiply') return a * b
  if (operator === 'divide') return b === 0 ? 0 : a / b
  return b === 0 ? 0 : a % b
}

export function formulaReading(data: FormulaData): FormulaReading {
  const skin = formulaSkinMode(data.skin)
  const a = finite(data.a)
  const b = finite(data.b)
  const state = skinState(data, skin)

  if (skin === 'percent_change') {
    if (a === 0) return { value: 0, suffix: '%', note: 'A start of zero has no percent change' }
    return OK(((b - a) / Math.abs(a)) * 100, '%')
  }

  if (skin === 'ratio') {
    const total = a + b
    if (total === 0) return { value: 0, suffix: '%', note: 'Two zeroes make no ratio' }
    return OK((a / total) * 100, '%')
  }

  if (skin === 'growth') {
    return OK(a * (1 + b / 100))
  }

  if (skin === 'expression') {
    const source = expressionText(state)
    if (!source.trim()) return { value: 0, suffix: '', note: 'Write an expression using A and B' }
    try {
      return OK(evaluateExpression(source, { variables: { a, b } }))
    } catch (error) {
      return { value: 0, suffix: '', note: expressionProblem(error) }
    }
  }

  if (skin === 'weighted_score') {
    const rows = weightedRows(state, a, b)
    const weight = rows.reduce((total, row) => total + row.weight, 0)
    if (weight === 0) return { value: 0, suffix: '', note: 'Give at least one row some weight' }
    const total = rows.reduce((sum, row) => sum + row.value * row.weight, 0)
    return OK(total / weight)
  }

  if (skin === 'conditional') {
    const branches = conditionalBranches(state)
    return OK(comparisonHolds(a, b, comparatorOf(state)) ? branches.whenTrue : branches.whenFalse)
  }

  const operator = formulaOperator(data.operator)
  if ((operator === 'divide' || operator === 'modulo') && b === 0) {
    return { value: 0, suffix: '', note: 'B is zero, so this cannot be divided' }
  }
  return OK(twoInputValue(a, b, operator))
}

/** The published number on its own — what the `result` field and tile read. */
export function formulaValue(data: FormulaData): number {
  return formulaReading(data).value
}

function skinState(data: FormulaData, skin: FormulaSkinMode): Record<string, unknown> {
  const state = data.skinStates?.[skin]
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
}

/* ------------------------------------------------------------ percent/ratio */

/** The two operands as the smallest whole-number ratio, when there is one. */
export function simplifiedRatio(a: number, b: number): { left: number; right: number } | null {
  const scale = 100
  const left = Math.round(finite(a) * scale)
  const right = Math.round(finite(b) * scale)
  if (left === 0 && right === 0) return null
  if (left < 0 || right < 0) return null
  const divisor = greatestCommonDivisor(Math.abs(left), Math.abs(right))
  if (divisor === 0) return null
  const simplified = { left: left / divisor, right: right / divisor }
  // Past a point the "simplified" pair is longer than the numbers it replaces.
  if (simplified.left > 9999 || simplified.right > 9999) return null
  return simplified
}

function greatestCommonDivisor(first: number, second: number): number {
  let x = first
  let y = second
  while (y !== 0) {
    const remainder = x % y
    x = y
    y = remainder
  }
  return x
}

/* ---------------------------------------------------------------- growth */

export const GROWTH_PERIODS = 6

/** Where the same rate takes the starting value, period by period. */
export function growthProjection(
  start: number,
  ratePercent: number,
  periods: number = GROWTH_PERIODS,
): number[] {
  const factor = 1 + finite(ratePercent) / 100
  const steps: number[] = []
  let value = finite(start)
  for (let index = 0; index < Math.max(0, Math.min(24, periods)); index += 1) {
    value *= factor
    steps.push(value)
  }
  return steps
}

/* ------------------------------------------------------------ expression */

export const FORMULA_EXPRESSION_LIMIT = EXPRESSION_LIMIT

export function expressionText(state: Record<string, unknown>): string {
  const raw = state.expression
  return typeof raw === 'string' ? raw.slice(0, FORMULA_EXPRESSION_LIMIT) : ''
}

/** The evaluator's own words, kept short enough to sit under the field. */
function expressionProblem(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message ? `${message[0]!.toUpperCase()}${message.slice(1)}` : 'That expression cannot be read'
}

/* --------------------------------------------------------- weighted score */

export interface WeightedRow {
  id: string
  label: string
  value: number
  weight: number
  /** True for the two rows backed by the canonical A and B. */
  canonical: boolean
}

export const WEIGHTED_EXTRA_LIMIT = 4

function weightOf(raw: unknown, fallback = 1): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  return Math.max(0, Math.min(999, raw))
}

function labelOf(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.trim() ? raw.slice(0, 40) : fallback
}

/**
 * Every scored row. A and B keep their canonical values so a wire writing this
 * card still moves the score; the extra rows are the skin's own, and both
 * kinds carry a weight the skin owns.
 */
export function weightedRows(
  state: Record<string, unknown>,
  a: number,
  b: number,
): WeightedRow[] {
  const rows: WeightedRow[] = [
    {
      id: 'a',
      label: labelOf(state.labelA, 'A'),
      value: finite(a),
      weight: weightOf(state.weightA),
      canonical: true,
    },
    {
      id: 'b',
      label: labelOf(state.labelB, 'B'),
      value: finite(b),
      weight: weightOf(state.weightB),
      canonical: true,
    },
  ]

  const extra = Array.isArray(state.rows) ? state.rows : []
  for (const [index, entry] of extra.slice(0, WEIGHTED_EXTRA_LIMIT).entries()) {
    const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    rows.push({
      id: typeof row.id === 'string' && row.id ? row.id : `row-${index}`,
      label: labelOf(row.label, `Row ${index + 3}`),
      value: finite(row.value),
      weight: weightOf(row.weight),
      canonical: false,
    })
  }
  return rows
}

/** Each row's share of the total weight, for the contribution bars. */
export function weightShares(rows: readonly WeightedRow[]): number[] {
  const total = rows.reduce((sum, row) => sum + row.weight, 0)
  return rows.map((row) => (total === 0 ? 0 : row.weight / total))
}

/* ----------------------------------------------------------- conditional */

export type FormulaComparator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'

export const COMPARATOR_SYMBOL: Record<FormulaComparator, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
  neq: '≠',
}

export const COMPARATORS = Object.keys(COMPARATOR_SYMBOL) as FormulaComparator[]

export function comparatorOf(state: Record<string, unknown>): FormulaComparator {
  const raw = state.comparator
  return typeof raw === 'string' && raw in COMPARATOR_SYMBOL
    ? raw as FormulaComparator
    : 'gt'
}

export function comparisonHolds(a: number, b: number, comparator: FormulaComparator): boolean {
  if (comparator === 'gt') return a > b
  if (comparator === 'gte') return a >= b
  if (comparator === 'lt') return a < b
  if (comparator === 'lte') return a <= b
  if (comparator === 'eq') return a === b
  return a !== b
}

export interface ConditionalBranches {
  whenTrue: number
  whenFalse: number
}

export function conditionalBranches(state: Record<string, unknown>): ConditionalBranches {
  return {
    whenTrue: typeof state.whenTrue === 'number' && Number.isFinite(state.whenTrue)
      ? state.whenTrue
      : 1,
    whenFalse: typeof state.whenFalse === 'number' && Number.isFinite(state.whenFalse)
      ? state.whenFalse
      : 0,
  }
}
