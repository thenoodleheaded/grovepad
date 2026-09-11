/**
 * Calculator skin data and the pure maths its renderers share.
 *
 * `CalculatorData.result` is the one canonical output — it is what the circuit
 * reads and what a wire carries — and `expression` is the human-readable
 * record of how that number was reached. Every skin writes both. A skin's own
 * working (the tape's rows, the finance inputs, the named variables) lives in
 * its own pocket of `skinStates`.
 *
 * Nothing here uses `eval` or `Function`: an expression arriving from a shared
 * board, an import, or the MCP connector is untrusted input, so it is parsed
 * by hand and bounded on length and depth.
 */

export type CalculatorSkinMode =
  | 'basic'
  | 'scientific'
  | 'tape'
  | 'finance'
  | 'programmer'
  | 'date_math'
  | 'named_variables'

const SKIN_MODES = new Set<CalculatorSkinMode>([
  'basic',
  'scientific',
  'tape',
  'finance',
  'programmer',
  'date_math',
  'named_variables',
])

export function calculatorSkinMode(raw: unknown): CalculatorSkinMode {
  return typeof raw === 'string' && SKIN_MODES.has(raw as CalculatorSkinMode)
    ? raw as CalculatorSkinMode
    : 'basic'
}

/** An expression longer than this is a paste accident or an attack, not sums. */
export const EXPRESSION_LIMIT = 240
const DEPTH_LIMIT = 32

export type AngleUnit = 'rad' | 'deg'

export function angleUnit(raw: unknown): AngleUnit {
  return raw === 'deg' ? 'deg' : 'rad'
}

interface EvaluateOptions {
  variables?: Readonly<Record<string, number>>
  angle?: AngleUnit
}

const CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  e: Math.E,
}

type UnaryFn = (value: number) => number

const FUNCTIONS: Readonly<Record<string, UnaryFn>> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
}

const TRIG_IN = new Set(['sin', 'cos', 'tan'])
const TRIG_OUT = new Set(['asin', 'acos', 'atan'])

/**
 * Functions that take more than one argument — the ones a real formula needs
 * once it is more than a sum. `round` and `log` also appear in the unary table
 * above and must answer identically on one argument, so an expression written
 * before they took a second one keeps exactly the number it had.
 */
interface MultiFunction {
  min: number
  max: number
  apply: (args: number[]) => number
}

const ARGUMENT_LIMIT = 8

const MULTI_FUNCTIONS: Readonly<Record<string, MultiFunction>> = {
  min: { min: 1, max: ARGUMENT_LIMIT, apply: (args) => Math.min(...args) },
  max: { min: 1, max: ARGUMENT_LIMIT, apply: (args) => Math.max(...args) },
  sum: { min: 1, max: ARGUMENT_LIMIT, apply: (args) => args.reduce((total, value) => total + value, 0) },
  avg: {
    min: 1,
    max: ARGUMENT_LIMIT,
    apply: (args) => args.reduce((total, value) => total + value, 0) / args.length,
  },
  pow: { min: 2, max: 2, apply: ([base, power]) => base! ** power! },
  clamp: {
    min: 3,
    max: 3,
    apply: ([value, first, second]) => Math.min(
      Math.max(value!, Math.min(first!, second!)),
      Math.max(first!, second!),
    ),
  },
  round: {
    min: 1,
    max: 2,
    apply: ([value, digits]) => {
      const scale = 10 ** Math.max(0, Math.min(10, Math.trunc(digits ?? 0)))
      return Math.round(value! * scale) / scale
    },
  },
  log: {
    min: 1,
    max: 2,
    apply: ([value, base]) => (base === undefined ? Math.log10(value!) : Math.log(value!) / Math.log(base)),
  },
}

/** Every name a written expression may call, for the help a card prints. */
export const EXPRESSION_FUNCTION_NAMES: readonly string[] = [
  ...Object.keys(FUNCTIONS),
  ...Object.keys(MULTI_FUNCTIONS).filter((name) => !(name in FUNCTIONS)),
  'if',
].sort()

/**
 * Recursive-descent evaluator for `+ - * / ^ mod %`, comparisons, `&&`/`||`,
 * parentheses, unary signs, named constants, named variables, and a fixed
 * function table (the unary maths above, `min`/`max`/`sum`/`avg`/`pow`/`clamp`,
 * and a three-part `if`). `^` is exponentiation here; the programmer skin has
 * its own parser where it is XOR.
 *
 * A comparison answers 1 or 0 so it can be used as a number, which is what
 * makes `if(stock < 5, price * 2, price)` readable on a card. `if` chooses its
 * branch before evaluating it, so the untaken half may safely divide by a zero.
 */
export function evaluateExpression(input: string, options: EvaluateOptions = {}): number {
  if (input.length > EXPRESSION_LIMIT) throw new Error('Expression too long')
  const src = input.replace(/\s+/g, '').toLowerCase()
  const angle = options.angle ?? 'rad'
  const variables = options.variables ?? {}
  let i = 0
  let depth = 0

  const peek = () => src[i]

  const parseNumber = (): number => {
    const start = i
    while (i < src.length && /[0-9.]/.test(src[i]!)) i += 1
    const token = src.slice(start, i)
    if (token === '' || token === '.' || (token.match(/\./g)?.length ?? 0) > 1) {
      throw new Error('Bad number')
    }
    const value = Number(token)
    if (Number.isNaN(value)) throw new Error('Bad number')
    return value
  }

  /** The text of one argument, skipped without evaluating it — how `if`
   *  reaches its chosen branch without running the other one. */
  const skipArgument = (): string => {
    const start = i
    let nesting = 0
    while (i < src.length) {
      const char = src[i]!
      if (char === '(') nesting += 1
      else if (char === ')') {
        if (nesting === 0) break
        nesting -= 1
      } else if (char === ',' && nesting === 0) break
      i += 1
    }
    if (nesting !== 0) throw new Error('Expected )')
    return src.slice(start, i)
  }

  const parseArguments = (name: string): number[] => {
    if (peek() !== '(') throw new Error(`${name} needs (`)
    i += 1
    const args: number[] = [parseTop()]
    while (peek() === ',') {
      i += 1
      if (args.length >= ARGUMENT_LIMIT) throw new Error(`${name} takes fewer values`)
      args.push(parseTop())
    }
    if (peek() !== ')') throw new Error('Expected )')
    i += 1
    return args
  }

  const parseName = (): number => {
    const start = i
    while (i < src.length && /[a-z0-9_]/.test(src[i]!)) i += 1
    const name = src.slice(start, i)
    if (!name) throw new Error('Unexpected token')

    // `if` reads its branches as text and evaluates only the chosen one.
    if (name === 'if') {
      if (peek() !== '(') throw new Error('if needs (')
      i += 1
      const condition = parseTop()
      if (peek() !== ',') throw new Error('if needs three parts')
      i += 1
      const whenTrue = skipArgument()
      if (peek() !== ',') throw new Error('if needs three parts')
      i += 1
      const whenFalse = skipArgument()
      if (peek() !== ')') throw new Error('Expected )')
      i += 1
      return evaluateExpression(condition !== 0 ? whenTrue : whenFalse, options)
    }

    const many = MULTI_FUNCTIONS[name]
    if (many) {
      const args = parseArguments(name)
      if (args.length < many.min || args.length > many.max) {
        throw new Error(`${name} takes ${many.min === many.max ? many.min : `${many.min}-${many.max}`} values`)
      }
      return many.apply(args)
    }

    const fn = FUNCTIONS[name]
    if (fn) {
      const args = parseArguments(name)
      if (args.length !== 1) throw new Error(`${name} takes one value`)
      const argument = angle === 'deg' && TRIG_IN.has(name) ? (args[0]! * Math.PI) / 180 : args[0]!
      const value = fn(argument)
      return angle === 'deg' && TRIG_OUT.has(name) ? (value * 180) / Math.PI : value
    }

    if (name in variables) return variables[name]!
    if (name in CONSTANTS) return CONSTANTS[name]!
    throw new Error(`Unknown name ${name}`)
  }

  const parseFactor = (): number => {
    depth += 1
    if (depth > DEPTH_LIMIT) throw new Error('Too deeply nested')
    try {
      if (peek() === '(') {
        i += 1
        const value = parseTop()
        if (peek() !== ')') throw new Error('Expected )')
        i += 1
        return value
      }
      if (peek() === '-') {
        i += 1
        return -parseFactor()
      }
      if (peek() === '+') {
        i += 1
        return parseFactor()
      }
      // `!x` only ever starts a factor, so it can never be read as the `!=`
      // that follows one.
      if (peek() === '!') {
        i += 1
        return parseFactor() === 0 ? 1 : 0
      }
      if (peek() !== undefined && /[a-z]/.test(peek()!)) return parseName()
      return parseNumber()
    } finally {
      depth -= 1
    }
  }

  /** Right-associative, so 2^3^2 is 512 the way a scientific calculator reads it. */
  const parsePower = (): number => {
    const base = parseFactor()
    if (peek() === '^') {
      i += 1
      return base ** parsePower()
    }
    return base
  }

  const parseTerm = (): number => {
    let value = parsePower()
    for (;;) {
      if (peek() === '*' || peek() === '/') {
        const op = src[i]!
        i += 1
        const rhs = parsePower()
        if (op === '*') value *= rhs
        else {
          if (rhs === 0) throw new Error('Div by 0')
          value /= rhs
        }
        continue
      }
      // `%` is the remainder spelling most people reach for; `mod` is the one
      // this parser has always had. They are the same operation.
      if (src.startsWith('mod', i) || peek() === '%') {
        i += peek() === '%' ? 1 : 3
        const rhs = parsePower()
        if (rhs === 0) throw new Error('Mod by 0')
        value %= rhs
        continue
      }
      return value
    }
  }

  const parseExpr = (): number => {
    let value = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = src[i]!
      i += 1
      const rhs = parseTerm()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  /** A comparison answers 1 or 0, so it reads as a number anywhere. */
  const parseCompare = (): number => {
    let value = parseExpr()
    for (;;) {
      const two = src.slice(i, i + 2)
      const one = peek()
      let op: string | null = null
      let width = 2
      if (two === '<=' || two === '>=' || two === '==' || two === '!=') op = two
      else if (one === '<' || one === '>') { op = one; width = 1 }
      else if (one === '=') { op = '=='; width = 1 }
      if (!op) return value
      i += width
      const rhs = parseExpr()
      value = Number(
        op === '<' ? value < rhs
        : op === '>' ? value > rhs
        : op === '<=' ? value <= rhs
        : op === '>=' ? value >= rhs
        : op === '==' ? value === rhs
        : value !== rhs,
      )
    }
  }

  const parseAnd = (): number => {
    let value = parseCompare()
    while (src.startsWith('&&', i)) {
      i += 2
      const rhs = parseCompare()
      value = value !== 0 && rhs !== 0 ? 1 : 0
    }
    return value
  }

  const parseTop = (): number => {
    let value = parseAnd()
    while (src.startsWith('||', i)) {
      i += 2
      const rhs = parseAnd()
      value = value !== 0 || rhs !== 0 ? 1 : 0
    }
    return value
  }

  if (src === '') return 0
  const value = parseTop()
  if (i !== src.length) throw new Error('Unexpected token')
  if (!Number.isFinite(value)) throw new Error('Not a number')
  return value
}

export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return 'Error'
  const rounded = Math.round(value * 1e10) / 1e10
  if (Object.is(rounded, -0)) return '0'
  // A result too long to read as digits is more useful in scientific notation.
  if (rounded !== 0 && (Math.abs(rounded) >= 1e12 || Math.abs(rounded) < 1e-9)) {
    return rounded.toExponential(6)
  }
  return rounded.toString()
}

/** The result string a skin should store, including the shared error word. */
export function safeResult(compute: () => number): string {
  try {
    return formatResult(compute())
  } catch {
    return 'Error'
  }
}

/* --------------------------------------------------------------- programmer */

export type NumberBase = 'dec' | 'hex' | 'oct' | 'bin'

const BASE_RADIX: Record<NumberBase, number> = { dec: 10, hex: 16, oct: 8, bin: 2 }
const BASE_DIGITS: Record<NumberBase, RegExp> = {
  dec: /[0-9]/,
  hex: /[0-9a-f]/,
  oct: /[0-7]/,
  bin: /[01]/,
}

export function numberBase(raw: unknown): NumberBase {
  return raw === 'hex' || raw === 'oct' || raw === 'bin' ? raw : 'dec'
}

export function baseDigits(base: NumberBase): string[] {
  return '0123456789ABCDEF'.slice(0, BASE_RADIX[base]).split('')
}

/**
 * Integers only, with the operators a programmer expects: `^` is XOR here, not
 * exponentiation, and `~`, `&`, `|`, `<<`, `>>` mean what they mean in code.
 * Bare digits read in the card's current base; `0x`/`0o`/`0b` always win.
 *
 * JavaScript's bitwise operators are 32-bit, so the range is stated rather
 * than silently truncated.
 */
export function evaluateIntegerExpression(input: string, base: NumberBase): number {
  if (input.length > EXPRESSION_LIMIT) throw new Error('Expression too long')
  const src = input.replace(/\s+/g, '').toLowerCase()
  let i = 0
  let depth = 0

  const peek = () => src[i]

  const parseLiteral = (): number => {
    let radix = BASE_RADIX[base]
    let digits = BASE_DIGITS[base]
    if (src[i] === '0' && /[xob]/.test(src[i + 1] ?? '')) {
      const marker = src[i + 1]!
      radix = marker === 'x' ? 16 : marker === 'o' ? 8 : 2
      digits = marker === 'x' ? BASE_DIGITS.hex : marker === 'o' ? BASE_DIGITS.oct : BASE_DIGITS.bin
      i += 2
    }
    const start = i
    while (i < src.length && digits.test(src[i]!)) i += 1
    const token = src.slice(start, i)
    if (!token) throw new Error('Bad number')
    const value = Number.parseInt(token, radix)
    if (Number.isNaN(value)) throw new Error('Bad number')
    if (!Number.isSafeInteger(value)) throw new Error('Out of range')
    return value
  }

  const parseFactor = (): number => {
    depth += 1
    if (depth > DEPTH_LIMIT) throw new Error('Too deeply nested')
    try {
      if (peek() === '(') {
        i += 1
        const value = parseOr()
        if (peek() !== ')') throw new Error('Expected )')
        i += 1
        return value
      }
      if (peek() === '~') {
        i += 1
        return ~parseFactor()
      }
      if (peek() === '-') {
        i += 1
        return -parseFactor()
      }
      return parseLiteral()
    } finally {
      depth -= 1
    }
  }

  const parseMul = (): number => {
    let value = parseFactor()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = src[i]!
      i += 1
      const rhs = parseFactor()
      if (rhs === 0 && op !== '*') throw new Error('Div by 0')
      value = op === '*' ? value * rhs : op === '/' ? Math.trunc(value / rhs) : value % rhs
    }
    return value
  }

  const parseAdd = (): number => {
    let value = parseMul()
    while (peek() === '+' || peek() === '-') {
      const op = src[i]!
      i += 1
      const rhs = parseMul()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  const parseShift = (): number => {
    let value = parseAdd()
    while (src.startsWith('<<', i) || src.startsWith('>>', i)) {
      const op = src.slice(i, i + 2)
      i += 2
      const rhs = parseAdd()
      value = op === '<<' ? value << rhs : value >> rhs
    }
    return value
  }

  const parseAnd = (): number => {
    let value = parseShift()
    while (peek() === '&') {
      i += 1
      value &= parseShift()
    }
    return value
  }

  const parseXor = (): number => {
    let value = parseAnd()
    while (peek() === '^') {
      i += 1
      value ^= parseAnd()
    }
    return value
  }

  const parseOr = (): number => {
    let value = parseXor()
    while (peek() === '|') {
      i += 1
      value |= parseXor()
    }
    return value
  }

  if (src === '') return 0
  const value = parseOr()
  if (i !== src.length) throw new Error('Unexpected token')
  return value
}

export function formatInBase(value: number, base: NumberBase): string {
  if (!Number.isFinite(value)) return 'Error'
  const whole = Math.trunc(value)
  const sign = whole < 0 ? '-' : ''
  return sign + Math.abs(whole).toString(BASE_RADIX[base]).toUpperCase()
}

/* ------------------------------------------------------------------- tape */

export interface TapeEntry {
  id: string
  expression: string
  result: string
}

export const TAPE_LIMIT = 30

export function tapeEntries(raw: unknown): TapeEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, TAPE_LIMIT).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Partial<TapeEntry>
    if (typeof entry.id !== 'string' || !entry.id) return []
    return [{
      id: entry.id,
      expression: typeof entry.expression === 'string' ? entry.expression.slice(0, EXPRESSION_LIMIT) : '',
      result: typeof entry.result === 'string' ? entry.result.slice(0, 40) : '',
    }]
  })
}

/** The adding machine's running total: every row that produced a number. */
export function tapeTotal(entries: readonly TapeEntry[]): number {
  return entries.reduce((sum, entry) => {
    const value = Number(entry.result)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
}

/* ---------------------------------------------------------------- finance */

export type FinanceMode = 'percent_change' | 'margin' | 'markup' | 'tax' | 'compound'

export interface FinanceField {
  key: 'a' | 'b' | 'c'
  label: string
  suffix?: string
}

interface FinanceRecipe {
  label: string
  fields: readonly FinanceField[]
  /** What the answer means, shown beside it. */
  unit: string
  compute: (a: number, b: number, c: number) => number
  summary: (a: number, b: number, c: number) => string
}

const FINANCE_RECIPES: Record<FinanceMode, FinanceRecipe> = {
  percent_change: {
    label: 'Change',
    fields: [{ key: 'a', label: 'From' }, { key: 'b', label: 'To' }],
    unit: '%',
    compute: (a, b) => {
      if (a === 0) throw new Error('From cannot be zero')
      return ((b - a) / a) * 100
    },
    summary: (a, b) => `${a} → ${b}`,
  },
  margin: {
    label: 'Margin',
    fields: [{ key: 'a', label: 'Cost' }, { key: 'b', label: 'Price' }],
    unit: '%',
    compute: (a, b) => {
      if (b === 0) throw new Error('Price cannot be zero')
      return ((b - a) / b) * 100
    },
    summary: (a, b) => `cost ${a}, price ${b}`,
  },
  markup: {
    label: 'Markup',
    fields: [{ key: 'a', label: 'Cost' }, { key: 'b', label: 'Price' }],
    unit: '%',
    compute: (a, b) => {
      if (a === 0) throw new Error('Cost cannot be zero')
      return ((b - a) / a) * 100
    },
    summary: (a, b) => `cost ${a}, price ${b}`,
  },
  tax: {
    label: 'Tax',
    fields: [{ key: 'a', label: 'Amount' }, { key: 'b', label: 'Rate', suffix: '%' }],
    unit: 'total',
    compute: (a, b) => a * (1 + b / 100),
    summary: (a, b) => `${a} plus ${b}%`,
  },
  compound: {
    label: 'Growth',
    fields: [
      { key: 'a', label: 'Amount' },
      { key: 'b', label: 'Rate', suffix: '%' },
      { key: 'c', label: 'Periods' },
    ],
    unit: 'future value',
    compute: (a, b, c) => a * (1 + b / 100) ** c,
    summary: (a, b, c) => `${a} at ${b}% for ${c}`,
  },
}

export const FINANCE_MODES = Object.keys(FINANCE_RECIPES) as FinanceMode[]

export function financeMode(raw: unknown): FinanceMode {
  return typeof raw === 'string' && raw in FINANCE_RECIPES
    ? raw as FinanceMode
    : 'percent_change'
}

export function financeRecipe(mode: FinanceMode): FinanceRecipe {
  return FINANCE_RECIPES[mode]
}

/* -------------------------------------------------------------- date math */

export type DateMode = 'between' | 'offset' | 'working_days'

const DATE_MODES = new Set<DateMode>(['between', 'offset', 'working_days'])
const DAY_MS = 86_400_000

export function dateMode(raw: unknown): DateMode {
  return typeof raw === 'string' && DATE_MODES.has(raw as DateMode) ? raw as DateMode : 'between'
}

/** Midday UTC, so a daylight-saving shift can never move a date by one. */
export function parseDayKey(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const time = Date.parse(`${raw}T12:00:00Z`)
  return Number.isNaN(time) ? null : time
}

export function formatDayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const start = parseDayKey(from)
  const end = parseDayKey(to)
  if (start === null || end === null) throw new Error('Need two dates')
  return Math.round((end - start) / DAY_MS)
}

export function offsetDay(from: string, days: number): string {
  const start = parseDayKey(from)
  if (start === null || !Number.isFinite(days)) throw new Error('Need a date')
  return formatDayKey(start + Math.trunc(days) * DAY_MS)
}

/** Whole weekdays from `from` up to and including `to`. Holidays are not known here. */
export function workingDaysBetween(from: string, to: string): number {
  const start = parseDayKey(from)
  const end = parseDayKey(to)
  if (start === null || end === null) throw new Error('Need two dates')
  const [first, last] = start <= end ? [start, end] : [end, start]
  const span = Math.round((last - first) / DAY_MS)
  if (span > 366 * 20) throw new Error('Range too long')
  let count = 0
  for (let day = 0; day <= span; day += 1) {
    const weekday = new Date(first + day * DAY_MS).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return start <= end ? count : -count
}

/* -------------------------------------------------------- named variables */

export interface NamedVariable {
  id: string
  name: string
  value: number
}

/** Three slots, because three writable circuit fields is what the ports expose. */
export const VARIABLE_LIMIT = 3

const VALID_NAME = /^[a-z][a-z0-9_]{0,15}$/

export function namedVariables(raw: unknown): NamedVariable[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, VARIABLE_LIMIT).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const variable = item as Partial<NamedVariable>
    if (typeof variable.id !== 'string' || !variable.id) return []
    const name = typeof variable.name === 'string' ? variable.name.slice(0, 16) : ''
    const value = typeof variable.value === 'number' && Number.isFinite(variable.value)
      ? variable.value
      : 0
    return [{ id: variable.id, name, value }]
  })
}

/** Only names the parser can actually resolve, and never a function's name. */
export function isUsableVariableName(name: string): boolean {
  const clean = name.trim().toLowerCase()
  return VALID_NAME.test(clean)
    && !EXPRESSION_FUNCTION_NAMES.includes(clean)
    && !(clean in CONSTANTS)
}

export function variableBindings(
  variables: readonly NamedVariable[],
): Record<string, number> {
  const bindings: Record<string, number> = {}
  for (const variable of variables) {
    const name = variable.name.trim().toLowerCase()
    if (isUsableVariableName(name)) bindings[name] = variable.value
  }
  return bindings
}
