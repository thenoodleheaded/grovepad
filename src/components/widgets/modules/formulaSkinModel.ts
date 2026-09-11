import type {
  FormulaData,
  FormulaInputKey,
  FormulaOperator,
} from '../../../types/widgetDataWorkflow'
import {
  evaluateExpression,
  EXPRESSION_LIMIT,
  formatResult,
  isUsableVariableName,
} from './calculatorSkinModel'

/**
 * Formula skin data and the one calculation every reader of this card shares.
 *
 * A Formula is a logic card. It holds up to six named numbers — `a` … `f` —
 * and every one of them is a circuit port, so any of them can be written by a
 * wire and every one stays on screen and editable by hand. `a` and `b` are
 * always present, which is why a board written before the card grew past two
 * numbers reads exactly as it always did.
 *
 * What a skin changes is the *question* asked of those numbers: their running
 * total, the percent between two of them, one's share of the whole, growth
 * over periods, a written expression, a weighted average, or a choice between
 * two outcomes. Each skin also chooses WHICH inputs fill its roles, so a card
 * fed by four wires can still ask a two-number question of any pair.
 *
 * Because a skin changes the question, `formulaReading` is the single owner of
 * the answer. The renderer's hero number, the resting tile, and the `result`
 * field a circuit reads all call it, so the number on the card and the number
 * on the wire can never disagree — including the rounding a card asks for.
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
  power: '^',
}

export const OPERATOR_WORD: Record<FormulaOperator, string> = {
  add: 'plus',
  subtract: 'minus',
  multiply: 'times',
  divide: 'divided by',
  modulo: 'remainder of',
  power: 'to the power of',
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
  ratio: 'Share',
  growth: 'Projected',
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

/* ---------------------------------------------------------------- inputs */

export const FORMULA_INPUT_KEYS: readonly FormulaInputKey[] = ['a', 'b', 'c', 'd', 'e', 'f']
export const FORMULA_INPUT_MIN = 2
export const FORMULA_INPUT_MAX = FORMULA_INPUT_KEYS.length
/** A name long enough to read, short enough to type into an expression. */
export const FORMULA_NAME_LIMIT = 16

export interface FormulaInput {
  key: FormulaInputKey
  /** The port's fixed letter — what the card's edge and the wire inspector say. */
  letter: string
  /** The name this card gave the slot, or '' when it never did. */
  name: string
  /** What to print: the name if there is one, else the letter. */
  title: string
  value: number
  /** True when a written expression can call the slot by its name. */
  callable: boolean
}

/** How many slots this card holds. Always at least the canonical two. */
export function formulaInputCount(data: FormulaData): number {
  const raw = data.inputCount
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return FORMULA_INPUT_MIN
  return Math.max(FORMULA_INPUT_MIN, Math.min(FORMULA_INPUT_MAX, Math.trunc(raw)))
}

function storedName(data: FormulaData, key: FormulaInputKey): string {
  const raw = data.names?.[key]
  return typeof raw === 'string' ? raw.slice(0, FORMULA_NAME_LIMIT) : ''
}

/**
 * `if` is the evaluator's own word for a branch, so a slot called `if` could
 * never be read as a number. A slot may not answer to another slot's letter
 * either — one letter, one port.
 */
function callableName(name: string, key: FormulaInputKey): boolean {
  const clean = name.trim().toLowerCase()
  if (!isUsableVariableName(clean) || clean === 'if') return false
  return !(FORMULA_INPUT_KEYS as readonly string[]).includes(clean) || clean === key
}

/** Every slot this card holds, in port order. */
export function formulaInputs(data: FormulaData): FormulaInput[] {
  const count = formulaInputCount(data)
  return FORMULA_INPUT_KEYS.slice(0, count).map((key) => {
    const name = storedName(data, key)
    return {
      key,
      letter: key.toUpperCase(),
      name,
      title: name.trim() || key.toUpperCase(),
      value: finite(data[key]),
      callable: callableName(name, key),
    }
  })
}

/** What a written expression may call: every letter, and every usable name. */
export function formulaBindings(inputs: readonly FormulaInput[]): Record<string, number> {
  const bindings: Record<string, number> = {}
  for (const input of inputs) bindings[input.key] = input.value
  for (const input of inputs) {
    if (input.callable) bindings[input.name.trim().toLowerCase()] = input.value
  }
  return bindings
}

/** Grow or shrink the rack. Shrinking forgets the slots it drops, so a card
 *  narrowed back to two is the card it was before it ever grew. */
export function dataWithInputCount(data: FormulaData, count: number): FormulaData {
  const next = Math.max(FORMULA_INPUT_MIN, Math.min(FORMULA_INPUT_MAX, Math.trunc(count)))
  const result: FormulaData = { ...data, inputCount: next }
  const names = { ...(data.names ?? {}) }
  for (const key of FORMULA_INPUT_KEYS.slice(next)) {
    delete result[key as 'c' | 'd' | 'e' | 'f']
    delete names[key]
  }
  if (Object.keys(names).length === 0) delete result.names
  else result.names = names
  if (next === FORMULA_INPUT_MIN) delete result.inputCount
  return result
}

export function dataWithInputName(
  data: FormulaData,
  key: FormulaInputKey,
  name: string,
): FormulaData {
  const names = { ...(data.names ?? {}) }
  const clean = name.slice(0, FORMULA_NAME_LIMIT)
  if (clean.trim()) names[key] = clean
  else delete names[key]
  const next = { ...data }
  if (Object.keys(names).length === 0) delete next.names
  else next.names = names
  return next
}

/** A wire may write a slot this card has not opened yet, so the write opens
 *  it — a number a reader cannot see is a number the card is hiding. */
export function dataWithInputValue(
  data: FormulaData,
  key: FormulaInputKey,
  value: number,
): FormulaData {
  const slot = FORMULA_INPUT_KEYS.indexOf(key) + 1
  const next: FormulaData = { ...data, [key]: finite(value) }
  return slot > formulaInputCount(data) ? { ...next, inputCount: slot } : next
}

/* ------------------------------------------------------------------ roles */

/**
 * Which slot fills one of a skin's roles. A stored key the card no longer
 * holds falls back to the role's default, so narrowing the rack can never
 * leave a skin reading from a slot that is gone.
 */
export function roleInput(
  inputs: readonly FormulaInput[],
  state: Record<string, unknown>,
  role: string,
  fallbackIndex: number,
): FormulaInput {
  const raw = state[role]
  if (typeof raw === 'string') {
    const found = inputs.find((input) => input.key === raw)
    if (found) return found
  }
  return inputs[Math.min(fallbackIndex, inputs.length - 1)] ?? inputs[0]!
}

/* ----------------------------------------------------------------- skins */

export interface FormulaReading {
  /** The number this card shows and publishes. One truth, not two. */
  value: number
  /** Printed after the value: the card's unit, or '%' where the answer is one. */
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
  if (operator === 'power') return a ** b
  if (operator === 'divide') return b === 0 ? 0 : a / b
  return b === 0 ? 0 : a % b
}

/** How many decimal places the card asks for, if it asks at all. */
export function formulaPrecision(data: FormulaData): number | null {
  const raw = data.precision
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.max(0, Math.min(6, Math.trunc(raw)))
}

export function formulaUnit(data: FormulaData): string {
  return typeof data.unit === 'string' ? data.unit.slice(0, 12).trim() : ''
}

export function formulaReading(data: FormulaData): FormulaReading {
  const reading = rawReading(data)
  const places = formulaPrecision(data)
  const unit = formulaUnit(data)
  return {
    // Rounding is part of the answer, not a display trick: a card showing two
    // decimals while its wire carried twelve would be two different numbers.
    value: places === null ? reading.value : roundTo(reading.value, places),
    suffix: unit || reading.suffix,
    note: reading.note,
  }
}

function roundTo(value: number, places: number): number {
  const scale = 10 ** places
  const rounded = Math.round(value * scale) / scale
  return Object.is(rounded, -0) ? 0 : rounded
}

function rawReading(data: FormulaData): FormulaReading {
  const skin = formulaSkinMode(data.skin)
  const inputs = formulaInputs(data)
  const state = skinState(data, skin)

  if (skin === 'percent_change') {
    const from = roleInput(inputs, state, 'fromKey', 0).value
    const to = roleInput(inputs, state, 'toKey', 1).value
    if (from === 0) return { value: 0, suffix: '%', note: 'A start of zero has no percent change' }
    return OK(((to - from) / Math.abs(from)) * 100, '%')
  }

  if (skin === 'ratio') {
    const part = roleInput(inputs, state, 'partKey', 0)
    const total = inputs.reduce((sum, input) => sum + input.value, 0)
    if (total === 0) return { value: 0, suffix: '%', note: 'Parts that add to zero make no ratio' }
    return OK((part.value / total) * 100, '%')
  }

  if (skin === 'growth') {
    const start = roleInput(inputs, state, 'startKey', 0).value
    const rate = roleInput(inputs, state, 'rateKey', 1).value
    return OK(start * (1 + rate / 100) ** growthPeriods(state))
  }

  if (skin === 'expression') {
    const source = expressionText(state)
    if (!source.trim()) return { value: 0, suffix: '', note: 'Write an expression using your inputs' }
    try {
      return OK(evaluateExpression(source, { variables: formulaBindings(inputs) }))
    } catch (error) {
      return { value: 0, suffix: '', note: expressionProblem(error) }
    }
  }

  if (skin === 'weighted_score') {
    const rows = weightedRows(data)
    const weight = rows.reduce((total, row) => total + row.weight, 0)
    if (weight === 0) return { value: 0, suffix: '', note: 'Give at least one row some weight' }
    const total = rows.reduce((sum, row) => sum + row.value * row.weight, 0)
    return OK(total / weight)
  }

  if (skin === 'conditional') {
    const left = roleInput(inputs, state, 'leftKey', 0).value
    const right = roleInput(inputs, state, 'rightKey', 1).value
    const branches = conditionalBranches(state, formulaBindings(inputs))
    const holds = comparisonHolds(left, right, comparatorOf(state))
    const chosen = holds ? branches.whenTrue : branches.whenFalse
    const problem = holds ? branches.trueNote : branches.falseNote
    return problem ? { value: chosen, suffix: '', note: problem } : OK(chosen)
  }

  // two_input: the operation carried down the whole rack, left to right.
  const operator = formulaOperator(data.operator)
  if ((operator === 'divide' || operator === 'modulo') && inputs.slice(1).some((input) => input.value === 0)) {
    return {
      value: 0,
      suffix: '',
      note: inputs.length > 2
        ? 'One of the inputs is zero, so this cannot be divided'
        : 'B is zero, so this cannot be divided',
    }
  }
  return OK(inputs.slice(1).reduce(
    (total, input) => twoInputValue(total, input.value, operator),
    inputs[0]?.value ?? 0,
  ))
}

/** The published number on its own — what the `result` field and tile read. */
export function formulaValue(data: FormulaData): number {
  return formulaReading(data).value
}

/** True when the inputs can actually answer the question being asked. */
export function formulaValid(data: FormulaData): boolean {
  return formulaReading(data).note === null
}

/** The answer as it is printed, unit included. */
export function formulaAnswerText(data: FormulaData): string {
  const reading = formulaReading(data)
  const places = formulaPrecision(data)
  const number = places === null ? formatResult(reading.value) : reading.value.toFixed(places)
  if (!reading.suffix) return number
  return reading.suffix === '%' ? `${number}%` : `${number} ${reading.suffix}`
}

function skinState(data: FormulaData, skin: FormulaSkinMode): Record<string, unknown> {
  const state = data.skinStates?.[skin]
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
}

/* ------------------------------------------------------------ percent/ratio */

/** Two operands as the smallest whole-number ratio, when there is one. */
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

/** Each slot's share of the whole, for the ratio bar. */
export function inputShares(inputs: readonly FormulaInput[]): number[] {
  const total = inputs.reduce((sum, input) => sum + Math.max(0, input.value), 0)
  return inputs.map((input) => (total === 0 ? 1 / inputs.length : Math.max(0, input.value) / total))
}

/* ---------------------------------------------------------------- growth */

export const GROWTH_PERIODS = 6
export const GROWTH_PERIOD_LIMIT = 24

/** How many periods the published answer covers. One, unless the card says. */
export function growthPeriods(state: Record<string, unknown>): number {
  const raw = state.periods
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1
  return Math.max(1, Math.min(GROWTH_PERIOD_LIMIT, Math.trunc(raw)))
}

/** Where the same rate takes the starting value, period by period. */
export function growthProjection(
  start: number,
  ratePercent: number,
  periods: number = GROWTH_PERIODS,
): number[] {
  const factor = 1 + finite(ratePercent) / 100
  const steps: number[] = []
  let value = finite(start)
  for (let index = 0; index < Math.max(0, Math.min(GROWTH_PERIOD_LIMIT, periods)); index += 1) {
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
  /** True for the rows backed by a real input slot — the ones a wire writes. */
  canonical: boolean
  /** The slot behind a canonical row, so the renderer can write it back. */
  key?: FormulaInputKey
}

export const WEIGHTED_EXTRA_LIMIT = 4

function weightOf(raw: unknown, fallback = 1): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  return Math.max(0, Math.min(999, raw))
}

function labelOf(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.trim() ? raw.slice(0, 40) : fallback
}

/** One slot's weight. Boards written when only A and B could be scored kept
 *  their weights under `weightA`/`weightB`, and those still count. */
export function inputWeight(state: Record<string, unknown>, key: FormulaInputKey): number {
  const weights = state.weights
  if (weights && typeof weights === 'object' && !Array.isArray(weights)) {
    const stored = (weights as Record<string, unknown>)[key]
    if (typeof stored === 'number') return weightOf(stored)
  }
  if (key === 'a') return weightOf(state.weightA)
  if (key === 'b') return weightOf(state.weightB)
  return weightOf(undefined)
}

/**
 * Every scored row. The card's own slots keep their values so a wire writing
 * this card still moves the score; the extra rows are the skin's own, and both
 * kinds carry a weight the skin owns.
 */
export function weightedRows(data: FormulaData): WeightedRow[] {
  const state = skinState(data, 'weighted_score')
  const legacyLabel: Partial<Record<FormulaInputKey, unknown>> = {
    a: state.labelA,
    b: state.labelB,
  }

  const rows: WeightedRow[] = formulaInputs(data).map((input) => ({
    id: input.key,
    label: input.name.trim() || labelOf(legacyLabel[input.key], input.letter),
    value: input.value,
    weight: inputWeight(state, input.key),
    canonical: true,
    key: input.key,
  }))

  const extra = Array.isArray(state.rows) ? state.rows : []
  for (const [index, entry] of extra.slice(0, WEIGHTED_EXTRA_LIMIT).entries()) {
    const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    rows.push({
      id: typeof row.id === 'string' && row.id ? row.id : `row-${index}`,
      label: labelOf(row.label, `Row ${rows.length + 1}`),
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
  /** Set when that branch was written as an expression that cannot be read. */
  trueNote: string | null
  falseNote: string | null
}

/** What a branch holds as the card stores it — a number, or an expression. */
export function branchText(state: Record<string, unknown>, side: 'whenTrue' | 'whenFalse'): string {
  const raw = state[side]
  if (typeof raw === 'string') return raw.slice(0, FORMULA_EXPRESSION_LIMIT)
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return side === 'whenTrue' ? '1' : '0'
}

/**
 * Either outcome may be a plain number or an expression over the card's own
 * inputs, so a Formula can answer "the discounted price, else the price".
 */
export function conditionalBranches(
  state: Record<string, unknown>,
  bindings: Record<string, number> = {},
): ConditionalBranches {
  const read = (side: 'whenTrue' | 'whenFalse'): [number, string | null] => {
    const raw = state[side]
    const fallback = side === 'whenTrue' ? 1 : 0
    if (typeof raw === 'number' && Number.isFinite(raw)) return [raw, null]
    if (typeof raw !== 'string') return [fallback, null]
    if (!raw.trim()) return [0, null]
    try {
      return [evaluateExpression(raw.slice(0, FORMULA_EXPRESSION_LIMIT), { variables: bindings }), null]
    } catch (error) {
      return [fallback, expressionProblem(error)]
    }
  }

  const [whenTrue, trueNote] = read('whenTrue')
  const [whenFalse, falseNote] = read('whenFalse')
  return { whenTrue, whenFalse, trueNote, falseNote }
}
