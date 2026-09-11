import type {
  FormulaItem,
  FormulaSheetData,
  FormulaSheetSkin,
} from '../../../types/widgetDataEducation'
import type { ModuleData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  EXPRESSION_FUNCTION_NAMES,
  evaluateExpression,
  formatResult,
} from './calculatorSkinModel'

/**
 * The one place a Formula Sheet is understood.
 *
 * Every skin asks a different question of the SAME list of named formulas, and
 * all six questions are answered here so the open card, the folded tile and the
 * `count` field can never disagree. Nothing in this module renders; nothing in
 * it reaches for the DOM.
 *
 * Three skins are renderer-ready and add nothing to saved data. Three are
 * schema-extensions and keep their extra material in `skinStates`, isolated per
 * skin so leaving one and coming back loses nothing — and so a board written by
 * an older build, which has none of it, still reads perfectly.
 */

export const FORMULA_SHEET_SKINS: readonly FormulaSheetSkin[] = [
  'reference_sheet',
  'equation_cards',
  'exam_strip',
  'derivation',
  'unit_aware',
  'worked_example',
]

const MAX_FORMULAS = 120
const MAX_NAME = 90
const MAX_EXPRESSION = 240
const MAX_SYMBOLS = 12
const MAX_STEPS = 12
const MAX_STEP_TEXT = 160
const MAX_UNIT = 24
const MAX_VALUE = 24
/** Guards the unit walker against a pathologically nested expression. */
const MAX_DEPTH = 24

export function formulaSheetSkin(raw: unknown): FormulaSheetSkin {
  return typeof raw === 'string' && FORMULA_SHEET_SKINS.includes(raw as FormulaSheetSkin)
    ? raw as FormulaSheetSkin
    : 'reference_sheet'
}

function cleanText(raw: unknown, limit: number): string {
  return typeof raw === 'string' ? raw.slice(0, limit) : ''
}

function cleanRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

/** The formulas as the card may safely draw them, whatever the record holds. */
export function formulaSheetItems(raw: unknown): FormulaItem[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_FORMULAS).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const item = candidate as Partial<FormulaItem>
    return [{
      id: typeof item.id === 'string' && item.id ? item.id : `formula-${index}`,
      name: cleanText(item.name, MAX_NAME),
      expression: cleanText(item.expression, MAX_EXPRESSION),
    }]
  })
}

/** A formula counts once it says something — the `count` field's rule too. */
export function formulaIsWritten(item: FormulaItem): boolean {
  return item.name.trim().length > 0 || item.expression.trim().length > 0
}

/* ── Reading an expression ─────────────────────────────────────────────── */

export type FormulaTokenKind = 'number' | 'symbol' | 'operator' | 'open' | 'close'

export interface FormulaToken {
  kind: FormulaTokenKind
  text: string
}

const OPERATOR_CHARS = new Set([
  '+', '-', '*', '/', '^', '%', '=', '<', '>', ',',
  '×', '÷', '·', '−', '≤', '≥', '≈',
])

/** Names the evaluator owns, so `sin` is never mistaken for a variable. */
const RESERVED = new Set<string>([
  ...EXPRESSION_FUNCTION_NAMES,
  'pi', 'tau', 'inf', 'infinity',
])

/**
 * Split a run of letters into the symbols a reader sees in it.
 *
 * A capital starts a new symbol, which is what makes `nRT` read as n·R·T and
 * `pV` as p·V while leaving `Force` whole. A leftover all-lowercase run of one
 * or two letters is implicit multiplication too — `nt` is n·t — but three or
 * more lowercase letters is a word (`litres`, `mass`) and stays whole. The
 * trade-off is deliberate and only bites two-letter abbreviations such as `km`,
 * which appear inside names far more often than inside real algebra.
 */
function segmentIdentifier(run: string): string[] {
  const capitalised: string[] = []
  for (const char of run) {
    if (capitalised.length === 0 || /[A-Z]/.test(char)) capitalised.push(char)
    else capitalised[capitalised.length - 1] += char
  }
  return capitalised.flatMap((segment) => (
    // `pi` is one constant, not p·i — a reserved name is never split.
    segment.length <= 2 && /^[a-z]+$/.test(segment) && !isReserved(segment)
      ? [...segment]
      : [segment]
  ))
}

/** The expression as tokens. Anything unrecognised is dropped, never thrown. */
export function formulaTokens(expression: string): FormulaToken[] {
  const source = expression.slice(0, MAX_EXPRESSION)
  const tokens: FormulaToken[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]!
    if (/\s/.test(char)) {
      index += 1
    } else if (/[0-9.]/.test(char)) {
      let text = ''
      while (index < source.length && /[0-9.]/.test(source[index]!)) {
        text += source[index]!
        index += 1
      }
      tokens.push({ kind: 'number', text })
    } else if (/[A-Za-z_Ͱ-Ͽ]/.test(char)) {
      let run = ''
      while (index < source.length && /[A-Za-z0-9_Ͱ-Ͽ]/.test(source[index]!)) {
        run += source[index]!
        index += 1
      }
      for (const symbol of segmentIdentifier(run)) tokens.push({ kind: 'symbol', text: symbol })
    } else if (char === '(' || char === '[' || char === '{') {
      tokens.push({ kind: 'open', text: '(' })
      index += 1
    } else if (char === ')' || char === ']' || char === '}') {
      tokens.push({ kind: 'close', text: ')' })
      index += 1
    } else if (OPERATOR_CHARS.has(char)) {
      tokens.push({ kind: 'operator', text: char })
      index += 1
    } else {
      index += 1
    }
  }
  return tokens
}

function isReserved(symbol: string): boolean {
  return RESERVED.has(symbol.toLowerCase())
}

/**
 * The distinct quantities the formula talks about, in the order they are first
 * written. Function names are not quantities.
 */
export function formulaSymbols(expression: string): string[] {
  const seen = new Set<string>()
  const symbols: string[] = []
  for (const token of formulaTokens(expression)) {
    if (token.kind !== 'symbol' || isReserved(token.text)) continue
    if (seen.has(token.text)) continue
    seen.add(token.text)
    symbols.push(token.text)
    if (symbols.length >= MAX_SYMBOLS) break
  }
  return symbols
}

export interface FormulaSides {
  left: string
  right: string
  balanced: boolean
}

/** The two halves of an equation, split at the first `=`. */
export function formulaSides(expression: string): FormulaSides {
  const at = expression.indexOf('=')
  if (at < 0) return { left: '', right: expression.trim(), balanced: false }
  return {
    left: expression.slice(0, at).trim(),
    right: expression.slice(at + 1).trim(),
    balanced: true,
  }
}

/** The quantity the formula gives you, when its left side is a lone symbol. */
export function formulaSubject(expression: string): string {
  const { left, balanced } = formulaSides(expression)
  if (!balanced) return ''
  const symbols = formulaSymbols(left)
  return symbols.length === 1 && formulaTokens(left).length === 1 ? symbols[0]! : left
}

function normaliseOperator(text: string): string {
  if (text === '×' || text === '·') return '*'
  if (text === '÷') return '/'
  if (text === '−') return '-'
  return text
}

/** Whether `nRT` hides a multiplication sign between these two tokens. */
function multipliesImplicitly(previous: FormulaToken | undefined, token: FormulaToken): boolean {
  if (!previous) return false
  const closesValue = previous.kind === 'number' || previous.kind === 'symbol' || previous.kind === 'close'
  const opensValue = token.kind === 'number' || token.kind === 'symbol' || token.kind === 'open'
  const callingFunction = previous.kind === 'symbol' && isReserved(previous.text) && token.kind === 'open'
  return closesValue && opensValue && !callingFunction
}

/**
 * The same expression with its implicit multiplications written out, which is
 * the only form the shared evaluator can read: it has no notion of `nRT`.
 */
export function evaluableExpression(expression: string): string {
  const tokens = formulaTokens(expression)
  let output = ''
  tokens.forEach((token, index) => {
    if (multipliesImplicitly(tokens[index - 1], token)) output += '*'
    output += token.kind === 'operator' ? normaliseOperator(token.text) : token.text
  })
  return output
}

/* ── Derivation ────────────────────────────────────────────────────────── */

function omit(state: WidgetSkinState, key: string): WidgetSkinState {
  const { [key]: _dropped, ...rest } = state
  return rest
}

function stepsFromState(state: WidgetSkinState): Record<string, string[]> {
  const source = cleanRecord(state.steps)
  const result: Record<string, string[]> = {}
  for (const [id, raw] of Object.entries(source).slice(0, MAX_FORMULAS)) {
    if (!Array.isArray(raw)) continue
    const steps = raw
      .slice(0, MAX_STEPS)
      .map((value) => cleanText(value, MAX_STEP_TEXT))
    if (steps.length > 0) result[id] = steps
  }
  return result
}

export function formulaDerivationSteps(
  data: Pick<FormulaSheetData, 'skinStates'>,
  formulaId: string,
): string[] {
  return stepsFromState(skinStateFor(data, 'derivation'))[formulaId] ?? []
}

export function dataWithFormulaDerivationSteps(
  data: FormulaSheetData,
  formulaId: string,
  steps: readonly string[],
): FormulaSheetData {
  const state = skinStateFor(data, 'derivation')
  const all = stepsFromState(state)
  const next = steps.slice(0, MAX_STEPS).map((step) => cleanText(step, MAX_STEP_TEXT))
  if (next.length > 0) all[formulaId] = next
  else delete all[formulaId]
  return dataWithSkinState(
    { ...data, skin: 'derivation' } as ModuleData,
    'derivation',
    Object.keys(all).length > 0 ? { ...state, steps: all } : omit(state, 'steps'),
  ) as FormulaSheetData
}

/* ── Units ─────────────────────────────────────────────────────────────── */

function unitsFromState(state: WidgetSkinState): Record<string, Record<string, string>> {
  const source = cleanRecord(state.units)
  const result: Record<string, Record<string, string>> = {}
  for (const [id, raw] of Object.entries(source).slice(0, MAX_FORMULAS)) {
    const perSymbol = cleanRecord(raw)
    const units: Record<string, string> = {}
    for (const [symbol, value] of Object.entries(perSymbol).slice(0, MAX_SYMBOLS)) {
      const unit = cleanText(value, MAX_UNIT).trim()
      if (unit) units[symbol] = unit
    }
    if (Object.keys(units).length > 0) result[id] = units
  }
  return result
}

export function formulaUnits(
  data: Pick<FormulaSheetData, 'skinStates'>,
  formulaId: string,
): Record<string, string> {
  return unitsFromState(skinStateFor(data, 'unit_aware'))[formulaId] ?? {}
}

export function dataWithFormulaUnit(
  data: FormulaSheetData,
  formulaId: string,
  symbol: string,
  unit: string,
): FormulaSheetData {
  const state = skinStateFor(data, 'unit_aware')
  const all = unitsFromState(state)
  const current = { ...(all[formulaId] ?? {}) }
  const next = cleanText(unit, MAX_UNIT).trim()
  if (next) current[symbol] = next
  else delete current[symbol]
  if (Object.keys(current).length > 0) all[formulaId] = current
  else delete all[formulaId]
  return dataWithSkinState(
    { ...data, skin: 'unit_aware' } as ModuleData,
    'unit_aware',
    Object.keys(all).length > 0 ? { ...state, units: all } : omit(state, 'units'),
  ) as FormulaSheetData
}

/** A unit product: what is on top of the fraction and what is underneath. */
export interface UnitSignature {
  numerator: readonly string[]
  denominator: readonly string[]
}

const DIMENSIONLESS: UnitSignature = { numerator: [], denominator: [] }

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
}

/**
 * Read a written unit as a product, so `m/s` is metres over seconds rather
 * than one opaque word. Everything after the first slash is underneath, which
 * is how `kg·m/s²` is read aloud. A power may be written `s^2`, `s2` or `s²`.
 */
export function parseUnit(text: string): UnitSignature {
  const numerator: string[] = []
  const denominator: string[] = []
  let below = false
  const normalised = [...text.slice(0, MAX_UNIT)]
    .map((char) => SUPERSCRIPTS[char] ?? char)
    .join('')
  for (const rawFactor of normalised.split(/[·*.×\s]+/)) {
    for (const [at, piece] of rawFactor.split('/').entries()) {
      if (at > 0) below = true
      const factor = piece.trim()
      if (!factor) continue
      const match = /^([^\d^]+)(?:\^?(\d+))?$/.exec(factor)
      if (!match) continue
      const unit = match[1]!.trim()
      if (!unit) continue
      const power = Math.max(1, Math.min(8, Number(match[2] ?? '1') || 1))
      const target = below ? denominator : numerator
      for (let step = 0; step < power; step += 1) target.push(unit)
    }
  }
  return { numerator, denominator }
}

function multiply(left: UnitSignature, right: UnitSignature): UnitSignature {
  return {
    numerator: [...left.numerator, ...right.numerator],
    denominator: [...left.denominator, ...right.denominator],
  }
}

function invert(signature: UnitSignature): UnitSignature {
  return { numerator: signature.denominator, denominator: signature.numerator }
}

/** Cancel matching factors and sort, so `m·s/s` and `m` are one signature. */
export function normaliseUnits(signature: UnitSignature): UnitSignature {
  const denominator = [...signature.denominator]
  const numerator: string[] = []
  for (const unit of signature.numerator) {
    const at = denominator.indexOf(unit)
    if (at >= 0) denominator.splice(at, 1)
    else numerator.push(unit)
  }
  return { numerator: numerator.sort(), denominator: denominator.sort() }
}

/** `m·m·s` reads as `m^2·s` — a printed unit, not a repeated one. */
function collapse(units: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1)
  return [...counts.entries()]
    .map(([unit, count]) => (count > 1 ? `${unit}^${count}` : unit))
    .join('·')
}

export function formatUnits(signature: UnitSignature): string {
  const { numerator, denominator } = normaliseUnits(signature)
  if (numerator.length === 0 && denominator.length === 0) return 'dimensionless'
  const top = numerator.length > 0 ? collapse(numerator) : '1'
  return denominator.length > 0 ? `${top}/${collapse(denominator)}` : top
}

function sameUnits(left: UnitSignature, right: UnitSignature): boolean {
  const a = normaliseUnits(left)
  const b = normaliseUnits(right)
  return a.numerator.join('|') === b.numerator.join('|')
    && a.denominator.join('|') === b.denominator.join('|')
}

interface UnitWalk {
  /** `null` when a symbol in this branch has no unit named for it yet. */
  signature: UnitSignature | null
  /** True once a sum has added two different units together. */
  conflict: boolean
  /** The two sides of the offending sum, for the message the card shows. */
  detail: string
}

/**
 * Walk the expression combining the units its symbols were given.
 *
 * Multiplication concatenates, division inverts, an integer power repeats, and
 * addition demands both sides already agree — which is where a real mistake
 * shows itself. A symbol with no unit named yet makes the branch unknown rather
 * than wrong, because silence is not an error.
 */
function walkUnits(
  tokens: readonly FormulaToken[],
  units: Record<string, string>,
): UnitWalk {
  let index = 0
  let conflict = false
  let detail = ''

  const skipGroup = () => {
    let nesting = 0
    while (index < tokens.length) {
      const token = tokens[index]!
      if (token.kind === 'open') nesting += 1
      if (token.kind === 'close') {
        nesting -= 1
        if (nesting <= 0) {
          index += 1
          return
        }
      }
      index += 1
    }
  }

  const parseAtom = (depth: number): UnitSignature | null => {
    if (depth > MAX_DEPTH) {
      index = tokens.length
      return null
    }
    const token = tokens[index]
    if (!token) return null
    if (token.kind === 'operator' && (token.text === '-' || token.text === '+' || token.text === '−')) {
      index += 1
      return parseAtom(depth + 1)
    }
    if (token.kind === 'number') {
      index += 1
      return DIMENSIONLESS
    }
    if (token.kind === 'symbol') {
      index += 1
      if (isReserved(token.text)) {
        // A function's answer has no unit knowable from its name alone.
        if (tokens[index]?.kind === 'open') skipGroup()
        return null
      }
      const unit = units[token.text]
      return unit ? parseUnit(unit) : null
    }
    if (token.kind === 'open') {
      index += 1
      const inner = parseExpression(depth + 1)
      if (tokens[index]?.kind === 'close') index += 1
      return inner
    }
    index += 1
    return null
  }

  const parsePower = (depth: number): UnitSignature | null => {
    const base = parseAtom(depth)
    const token = tokens[index]
    if (!token || token.kind !== 'operator' || token.text !== '^') return base
    index += 1
    const exponentToken = tokens[index]
    // Only a literal whole power keeps a unit meaningful; `x^n` does not.
    if (!exponentToken || exponentToken.kind !== 'number') {
      parseAtom(depth + 1)
      return null
    }
    index += 1
    const exponent = Number(exponentToken.text)
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > 8) return null
    if (!base) return null
    let result: UnitSignature = DIMENSIONLESS
    for (let step = 0; step < exponent; step += 1) result = multiply(result, base)
    return result
  }

  const parseTerm = (depth: number): UnitSignature | null => {
    let left = parsePower(depth)
    while (index < tokens.length) {
      const token = tokens[index]!
      const implicit = token.kind === 'number' || token.kind === 'symbol' || token.kind === 'open'
      const explicit = token.kind === 'operator'
        && (token.text === '*' || token.text === '/' || token.text === '×' || token.text === '÷' || token.text === '·')
      if (!implicit && !explicit) break
      const dividing = explicit && (token.text === '/' || token.text === '÷')
      if (explicit) index += 1
      const right = parsePower(depth)
      left = left && right ? multiply(left, dividing ? invert(right) : right) : null
    }
    return left
  }

  const parseExpression = (depth: number): UnitSignature | null => {
    let left = parseTerm(depth)
    while (index < tokens.length) {
      const token = tokens[index]!
      if (token.kind !== 'operator' || (token.text !== '+' && token.text !== '-' && token.text !== '−')) break
      index += 1
      const right = parseTerm(depth)
      if (left && right && !sameUnits(left, right)) {
        conflict = true
        if (!detail) detail = `${formatUnits(left)} + ${formatUnits(right)}`
      }
      left = left ?? right
    }
    return left
  }

  const signature = parseExpression(0)
  return { signature, conflict, detail }
}

export type UnitVerdictState = 'balanced' | 'mismatch' | 'unchecked'

export interface UnitVerdict {
  state: UnitVerdictState
  left: string
  right: string
  note: string
}

/**
 * Whether the units named for this formula's symbols survive its own algebra.
 * `unchecked` is the honest answer while symbols are still unnamed — a card
 * must never accuse a formula of being wrong for being unfinished.
 */
export function formulaUnitVerdict(
  expression: string,
  units: Record<string, string>,
): UnitVerdict {
  const sides = formulaSides(expression)
  if (!sides.balanced || !sides.left || !sides.right) {
    return { state: 'unchecked', left: '', right: '', note: 'Needs both sides of an equation' }
  }
  const left = walkUnits(formulaTokens(sides.left), units)
  const right = walkUnits(formulaTokens(sides.right), units)
  if (left.conflict || right.conflict) {
    const detail = left.detail || right.detail
    return {
      state: 'mismatch',
      left: left.signature ? formatUnits(left.signature) : '?',
      right: right.signature ? formatUnits(right.signature) : '?',
      note: detail ? `Adds ${detail}` : 'Adds unlike units',
    }
  }
  if (!left.signature || !right.signature) {
    const total = formulaSymbols(expression).length
    const named = formulaSymbols(expression).filter((symbol) => units[symbol]).length
    return {
      state: 'unchecked',
      left: left.signature ? formatUnits(left.signature) : '?',
      right: right.signature ? formatUnits(right.signature) : '?',
      note: named >= total
        ? 'Not resolvable from these units'
        : `${total - named} of ${total} symbols still need a unit`,
    }
  }
  const balanced = sameUnits(left.signature, right.signature)
  return {
    state: balanced ? 'balanced' : 'mismatch',
    left: formatUnits(left.signature),
    right: formatUnits(right.signature),
    note: balanced ? 'Both sides agree' : 'The two sides are different quantities',
  }
}

/* ── Worked example ────────────────────────────────────────────────────── */

function valuesFromState(state: WidgetSkinState): Record<string, Record<string, string>> {
  const source = cleanRecord(state.values)
  const result: Record<string, Record<string, string>> = {}
  for (const [id, raw] of Object.entries(source).slice(0, MAX_FORMULAS)) {
    const perSymbol = cleanRecord(raw)
    const values: Record<string, string> = {}
    for (const [symbol, value] of Object.entries(perSymbol).slice(0, MAX_SYMBOLS)) {
      const text = cleanText(value, MAX_VALUE).trim()
      if (text) values[symbol] = text
    }
    if (Object.keys(values).length > 0) result[id] = values
  }
  return result
}

export function formulaExampleValues(
  data: Pick<FormulaSheetData, 'skinStates'>,
  formulaId: string,
): Record<string, string> {
  return valuesFromState(skinStateFor(data, 'worked_example'))[formulaId] ?? {}
}

export function dataWithFormulaExampleValue(
  data: FormulaSheetData,
  formulaId: string,
  symbol: string,
  value: string,
): FormulaSheetData {
  const state = skinStateFor(data, 'worked_example')
  const all = valuesFromState(state)
  const current = { ...(all[formulaId] ?? {}) }
  const next = cleanText(value, MAX_VALUE).trim()
  if (next) current[symbol] = next
  else delete current[symbol]
  if (Object.keys(current).length > 0) all[formulaId] = current
  else delete all[formulaId]
  return dataWithSkinState(
    { ...data, skin: 'worked_example' } as ModuleData,
    'worked_example',
    Object.keys(all).length > 0 ? { ...state, values: all } : omit(state, 'values'),
  ) as FormulaSheetData
}

/** Exactly one example is open at a time, so the card keeps one focus. */
export function formulaExampleOpenId(
  data: Pick<FormulaSheetData, 'skinStates'>,
): string {
  return cleanText(skinStateFor(data, 'worked_example').openId, 120)
}

export function dataWithFormulaExampleOpen(
  data: FormulaSheetData,
  formulaId: string,
): FormulaSheetData {
  const state = skinStateFor(data, 'worked_example')
  return dataWithSkinState(
    { ...data, skin: 'worked_example' } as ModuleData,
    'worked_example',
    formulaId ? { ...state, openId: formulaId } : omit(state, 'openId'),
  ) as FormulaSheetData
}

/**
 * The formula with its numbers written in, which is the working a reader wants.
 * Implicit multiplication is spelled with a × here: once `nt` has become two
 * numbers, `12 3` would read as a typo rather than as a product.
 */
export function substitute(expression: string, values: Record<string, string>): string {
  const tokens = formulaTokens(expression)
  return tokens
    .map((token, index) => {
      const sign = multipliesImplicitly(tokens[index - 1], token) ? '× ' : ''
      if (token.kind !== 'symbol' || isReserved(token.text)) return sign + token.text
      const value = values[token.text]?.trim()
      return sign + (value || token.text)
    })
    .join(' ')
    .replace(/\s+([)\],])/g, '$1')
    .replace(/([([])\s+/g, '$1')
}

export interface FormulaExampleResult {
  state: 'solved' | 'waiting' | 'unsolvable'
  text: string
  note: string
  /** The substituted right-hand side, shown as the working. */
  substituted: string
}

/**
 * Put the example's numbers into the formula and read the answer off it.
 *
 * The right-hand side is evaluated by the Calculator's own evaluator, so a
 * Formula Sheet and a Calculator can never disagree about arithmetic. The
 * evaluator folds case, so `V` and `v` would collide — a formula using both is
 * reported as unsolvable rather than answered wrongly.
 */
export function formulaExampleResult(
  expression: string,
  values: Record<string, string>,
): FormulaExampleResult {
  const sides = formulaSides(expression)
  const body = sides.balanced ? sides.right : sides.left || expression.trim()
  if (!body) return { state: 'waiting', text: '', note: 'Write the formula first', substituted: '' }

  const symbols = formulaSymbols(body)
  if (symbols.length === 0) {
    return { state: 'waiting', text: '', note: 'No quantities to substitute', substituted: '' }
  }
  const missing = symbols.filter((symbol) => !values[symbol]?.trim())
  if (missing.length > 0) {
    return {
      state: 'waiting',
      text: '',
      note: `Give ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''} a value`,
      substituted: substitute(body, values),
    }
  }

  const folded = new Map<string, string>()
  for (const symbol of symbols) {
    const key = symbol.toLowerCase()
    const existing = folded.get(key)
    if (existing && existing !== symbol) {
      return {
        state: 'unsolvable',
        text: '',
        note: `${existing} and ${symbol} cannot both be read`,
        substituted: substitute(body, values),
      }
    }
    folded.set(key, symbol)
  }

  const variables: Record<string, number> = {}
  for (const symbol of symbols) {
    const parsed = Number(values[symbol]!.trim())
    if (!Number.isFinite(parsed)) {
      return {
        state: 'unsolvable',
        text: '',
        note: `${symbol} is not a number`,
        substituted: substitute(body, values),
      }
    }
    variables[symbol.toLowerCase()] = parsed
  }

  try {
    const answer = evaluateExpression(evaluableExpression(body), { variables })
    if (!Number.isFinite(answer)) {
      return { state: 'unsolvable', text: '', note: 'No finite answer', substituted: substitute(body, values) }
    }
    return {
      state: 'solved',
      text: formatResult(answer),
      note: sides.balanced && sides.left ? sides.left : 'answer',
      substituted: substitute(body, values),
    }
  } catch {
    return {
      state: 'unsolvable',
      text: '',
      note: 'This expression cannot be worked out',
      substituted: substitute(body, values),
    }
  }
}

/* ── Removal ───────────────────────────────────────────────────────────── */

/**
 * Delete a formula and every skin's private material about it, so a sheet can
 * never carry steps, units, or an example for a formula that is gone.
 */
export function dataWithoutFormula(
  data: FormulaSheetData,
  formulaId: string,
): FormulaSheetData {
  const nextStates: Record<string, Record<string, unknown>> = {}
  for (const [skin, rawState] of Object.entries(data.skinStates ?? {})) {
    const state = cleanRecord(rawState)
    const {
      steps: _steps,
      units: _units,
      values: _values,
      openId: _openId,
      ...rest
    } = state
    const next: Record<string, unknown> = { ...rest }
    for (const key of ['steps', 'units', 'values'] as const) {
      const held = { ...cleanRecord(state[key]) }
      delete held[formulaId]
      if (Object.keys(held).length > 0) next[key] = held
    }
    const openId = cleanText(state.openId, 120)
    if (openId && openId !== formulaId) next.openId = openId
    if (Object.keys(next).length > 0) nextStates[skin] = next
  }
  const { skinStates: _dropped, ...withoutStates } = data
  return {
    ...withoutStates,
    formulas: data.formulas.filter((formula) => formula.id !== formulaId),
    ...(Object.keys(nextStates).length > 0 ? { skinStates: nextStates } : {}),
  }
}
