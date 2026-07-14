import { Delete } from 'lucide-react'
import type { CalculatorData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface CalculatorWidgetProps {
  data: CalculatorData
  onChange: (data: CalculatorData) => void
}

/** Recursive-descent evaluator for +, -, *, /, parens — no eval/Function. */
function evaluateExpression(input: string): number {
  const src = input.replace(/\s+/g, '')
  let i = 0

  const peek = () => src[i]

  const parseNumber = (): number => {
    const start = i
    while (i < src.length && /[0-9.]/.test(src[i]!)) i++
    const token = src.slice(start, i)
    if (token === '' || token === '.') throw new Error('Bad number')
    const n = Number(token)
    if (Number.isNaN(n)) throw new Error('Bad number')
    return n
  }

  const parseFactor = (): number => {
    if (peek() === '(') {
      i++
      const v = parseExpr()
      if (peek() !== ')') throw new Error('Expected )')
      i++
      return v
    }
    if (peek() === '-') {
      i++
      return -parseFactor()
    }
    if (peek() === '+') {
      i++
      return parseFactor()
    }
    return parseNumber()
  }

  const parseTerm = (): number => {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = src[i]!
      i++
      const rhs = parseFactor()
      if (op === '*') v *= rhs
      else {
        if (rhs === 0) throw new Error('Div by 0')
        v /= rhs
      }
    }
    return v
  }

  const parseExpr = (): number => {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = src[i]!
      i++
      const rhs = parseTerm()
      v = op === '+' ? v + rhs : v - rhs
    }
    return v
  }

  if (src === '') return 0
  const value = parseExpr()
  if (i !== src.length) throw new Error('Unexpected token')
  return value
}

const KEYS = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '(', ')'],
] as const

function formatResult(n: number): string {
  if (!Number.isFinite(n)) return 'Error'
  const rounded = Math.round(n * 1e10) / 1e10
  return rounded.toString()
}

/** A pocket calculator — type or tap, evaluated with a tiny local parser. */
export function CalculatorWidget({ data, onChange }: CalculatorWidgetProps) {
  const resultRef = useFieldAnchor<HTMLSpanElement>('result')
  const setExpression = (expression: string) => {
    let result = data.result
    try {
      result = expression.trim() === '' ? '' : formatResult(evaluateExpression(expression))
    } catch {
      result = expression.trim() === '' ? '' : 'Error'
    }
    onChange({ expression, result })
  }

  const press = (key: string) => setExpression(data.expression + key)
  const backspace = () => setExpression(data.expression.slice(0, -1))
  const clear = () => onChange({ expression: '', result: '' })
  const equals = () => {
    if (data.result && data.result !== 'Error') setExpression(data.result)
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="gp-well flex shrink-0 flex-col items-end gap-0.5 px-3 py-2">
        <input
          value={data.expression}
          placeholder="0"
          aria-label="Expression"
          onChange={(e) => setExpression(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') equals()
          }}
          className="gp-input--bare w-full text-right font-mono text-[13px] text-neutral-400 outline-none placeholder:text-neutral-700"
        />
        <span
          ref={resultRef}
          className="gp-hero w-full truncate text-right font-mono"
        >
          {data.result || '0'}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-4 gap-1.5">
        {KEYS.flat().map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="flex items-center justify-center rounded-lg text-[13px] font-medium text-neutral-300 transition-colors hover:bg-neutral-800 active:bg-neutral-700"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={clear}
          className="flex items-center justify-center rounded-lg text-[11px] font-semibold text-red-400/80 transition-colors hover:bg-red-500/10"
        >
          C
        </button>
        <button
          type="button"
          aria-label="Backspace"
          onClick={backspace}
          className="flex items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800"
        >
          <Delete size={13} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Plus"
          onClick={() => press('+')}
          className="flex items-center justify-center rounded-lg text-[13px] font-medium text-neutral-300 transition-colors hover:bg-neutral-800 active:bg-neutral-700"
        >
          +
        </button>
        <button
          type="button"
          onClick={equals}
          style={{
            background: 'color-mix(in oklab, var(--gp-widget-accent), transparent 86%)',
            color: 'var(--gp-widget-accent)',
          }}
          className="flex items-center justify-center rounded-lg text-[13px] font-semibold transition-colors"
        >
          =
        </button>
      </div>
    </div>
  )
}
