import { CornerDownLeft, Delete, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import type { CalculatorData, ModuleData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  angleUnit,
  baseDigits,
  calculatorSkinMode,
  dateMode,
  daysBetween,
  evaluateExpression,
  evaluateIntegerExpression,
  financeMode,
  financeRecipe,
  formatInBase,
  formatResult,
  isUsableVariableName,
  namedVariables,
  numberBase,
  offsetDay,
  safeResult,
  tapeEntries,
  tapeTotal,
  variableBindings,
  workingDaysBetween,
  EXPRESSION_LIMIT,
  FINANCE_MODES,
  TAPE_LIMIT,
  VARIABLE_LIMIT,
  type AngleUnit,
  type CalculatorSkinMode,
  type DateMode,
  type NamedVariable,
  type NumberBase,
  type TapeEntry,
} from './calculatorSkinModel'

interface CalculatorWidgetProps {
  data: CalculatorData
  onChange: (data: CalculatorData) => void
  skin?: CalculatorSkinMode
}

interface SkinProps {
  data: CalculatorData
  commit: (expression: string, result: string) => void
  state: WidgetSkinState
  setState: (next: WidgetSkinState, derived?: { expression: string; result: string }) => void
}

/* ------------------------------------------------------------------ shared */

/** The one readout: what was asked above, what it came to below. */
function Display({
  expression,
  result,
  onExpression,
  onSubmit,
  placeholder = '0',
  label = 'Expression',
  hint,
}: {
  expression: string
  result: string
  onExpression?: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  label?: string
  hint?: string
}) {
  return (
    <div className="gp-calc-display gp-bare-field">
      {onExpression ? (
        <input
          value={expression}
          aria-label={label}
          placeholder={placeholder}
          spellCheck={false}
          maxLength={EXPRESSION_LIMIT}
          data-floor-overflow="scroll"
          onChange={(event) => onExpression(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && onSubmit) {
              event.preventDefault()
              onSubmit()
            }
          }}
          className="gp-calc-expression"
        />
      ) : (
        <span className="gp-calc-expression" title={expression}>{expression || hint || placeholder}</span>
      )}
      <output className="gp-calc-result" data-error={result === 'Error' || undefined}>
        {result || '0'}
      </output>
    </div>
  )
}

interface KeyDef {
  key: string
  label?: string
  span?: 2
  tone?: 'accent' | 'warn' | 'quiet'
  action?: 'clear' | 'back' | 'equals'
}

function Keypad({
  keys,
  columns,
  className = '',
  onPress,
  onClear,
  onBack,
  onEquals,
}: {
  keys: readonly KeyDef[]
  columns: number
  className?: string
  onPress: (key: string) => void
  onClear: () => void
  onBack: () => void
  onEquals: () => void
}) {
  return (
    <div className={`gp-calc-pad ${className}`} style={{ '--gp-calc-columns': columns } as never}>
      {keys.map((entry) => (
        <button
          key={entry.key}
          type="button"
          data-tone={entry.tone}
          data-span={entry.span}
          aria-label={entry.action === 'back' ? 'Backspace' : entry.action === 'clear' ? 'Clear' : entry.label ?? entry.key}
          onClick={() => {
            if (entry.action === 'clear') onClear()
            else if (entry.action === 'back') onBack()
            else if (entry.action === 'equals') onEquals()
            else onPress(entry.key)
          }}
        >
          {entry.action === 'back'
            ? <Delete size={13} aria-hidden />
            : entry.label ?? entry.key}
        </button>
      ))}
    </div>
  )
}

/** A labelled number field. Every skin that asks for figures uses this one. */
function NumberField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string
  value: string
  suffix?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="gp-calc-field gp-bare-field">
      <span>{label}</span>
      <span className="gp-calc-field-input">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          aria-label={label}
          placeholder="0"
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <i>{suffix}</i>}
      </span>
    </label>
  )
}

function ModeBar<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="gp-calc-modes" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function readNumber(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : 0
}

function readText(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

/* ------------------------------------------------------------ basic keypad */

const BASIC_KEYS: readonly KeyDef[] = [
  { key: 'C', action: 'clear', tone: 'warn' },
  { key: '(' }, { key: ')' }, { key: '/' },
  { key: '7' }, { key: '8' }, { key: '9' }, { key: '*' },
  { key: '4' }, { key: '5' }, { key: '6' }, { key: '-' },
  { key: '1' }, { key: '2' }, { key: '3' }, { key: '+' },
  { key: '0' }, { key: '.' },
  { key: '⌫', action: 'back' },
  { key: '=', action: 'equals', tone: 'accent' },
]

/**
 * Scientific keeps the same familiar number block as Basic and puts the
 * functions in their own five-wide row above it. Interleaving them into one
 * grid pushed 0 and the decimal point into whichever cells were left over.
 */
const SCIENTIFIC_FUNCTION_KEYS: readonly KeyDef[] = [
  { key: 'sin(', label: 'sin' }, { key: 'cos(', label: 'cos' }, { key: 'tan(', label: 'tan' },
  { key: 'ln(', label: 'ln' }, { key: 'log(', label: 'log' },
  { key: 'sqrt(', label: '√' }, { key: '^', label: 'xʸ' }, { key: 'pi', label: 'π' },
  { key: 'e' }, { key: 'mod' },
  { key: 'C', action: 'clear', tone: 'warn' }, { key: '(' }, { key: ')' }, { key: '/' },
  { key: '⌫', action: 'back' },
]

/** Four rows, so the function strip above still leaves room for the digits. */
const SCIENTIFIC_NUMBER_KEYS: readonly KeyDef[] = [
  { key: '7' }, { key: '8' }, { key: '9' }, { key: '*' },
  { key: '4' }, { key: '5' }, { key: '6' }, { key: '-' },
  { key: '1' }, { key: '2' }, { key: '3' }, { key: '+' },
  { key: '0' }, { key: '.' }, { key: '=', action: 'equals', tone: 'accent', span: 2 },
]

function ExpressionSkin({
  data,
  commit,
  state,
  setState,
  scientific,
}: SkinProps & { scientific: boolean }) {
  const angle = angleUnit(state.angle)
  const memory = readNumber(state.memory)

  const write = (expression: string) => {
    const result = expression.trim() === ''
      ? ''
      : safeResult(() => evaluateExpression(expression, { angle }))
    commit(expression, result)
  }

  const press = (key: string) => write(data.expression + key)
  const equals = () => {
    if (data.result && data.result !== 'Error') write(data.result)
  }

  return (
    <div className={`gp-calc ${scientific ? 'gp-calc-scientific' : 'gp-calc-basic'}`}>
      <Display
        expression={data.expression}
        result={data.result}
        onExpression={write}
        onSubmit={equals}
      />

      {scientific && (
        <div className="gp-calc-strip">
          <ModeBar
            label="Angle unit"
            value={angle}
            onChange={(next: AngleUnit) => {
              // Changing the unit re-reads the same expression, so the number
              // on screen can never belong to the other unit.
              const result = data.expression.trim() === ''
                ? ''
                : safeResult(() => evaluateExpression(data.expression, { angle: next }))
              setState({ ...state, angle: next }, { expression: data.expression, result })
            }}
            options={[{ value: 'rad', label: 'RAD' }, { value: 'deg', label: 'DEG' }]}
          />
          <span className="gp-calc-memory" data-held={memory !== 0 || undefined}>
            <button type="button" aria-label="Recall memory" onClick={() => press(String(memory))}>MR</button>
            <button
              type="button"
              aria-label="Add the result to memory"
              onClick={() => setState({ ...state, memory: memory + readNumber(data.result) })}
            >M+</button>
            <button type="button" aria-label="Clear memory" onClick={() => setState({ ...state, memory: 0 })}>MC</button>
            <i aria-hidden>{memory === 0 ? '' : formatResult(memory)}</i>
          </span>
        </div>
      )}

      {scientific && (
        <Keypad
          keys={SCIENTIFIC_FUNCTION_KEYS}
          columns={5}
          className="gp-calc-pad--functions"
          onPress={press}
          onClear={() => commit('', '')}
          onBack={() => write(data.expression.slice(0, -1))}
          onEquals={equals}
        />
      )}

      <Keypad
        keys={scientific ? SCIENTIFIC_NUMBER_KEYS : BASIC_KEYS}
        columns={4}
        onPress={press}
        onClear={() => commit('', '')}
        onBack={() => write(data.expression.slice(0, -1))}
        onEquals={equals}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- tape */

function TapeSkin({ data, state, setState }: SkinProps) {
  const entries = tapeEntries(state.entries)
  const total = tapeTotal(entries)

  // The line's own value is shown beside it, but the card's result stays the
  // running total — that is what a tape is for, and what a wire should read.
  const writeLine = (expression: string) => {
    const result = expression.trim() === '' ? '' : safeResult(() => evaluateExpression(expression))
    setState({ ...state, draft: expression, draftResult: result }, {
      expression: entries.length ? `${entries.length} entries` : expression,
      result: formatResult(total),
    })
  }

  const draft = readText(state.draft)
  const draftResult = readText(state.draftResult)

  const addLine = () => {
    if (!draft.trim() || draftResult === '' || draftResult === 'Error') return
    const next: TapeEntry[] = [
      { id: crypto.randomUUID(), expression: draft.trim(), result: draftResult },
      ...entries,
    ].slice(0, TAPE_LIMIT)
    setState({ ...state, entries: next, draft: '', draftResult: '' }, {
      expression: `${next.length} entries`,
      result: formatResult(tapeTotal(next)),
    })
  }

  const removeLine = (id: string) => {
    const next = entries.filter((entry) => entry.id !== id)
    setState({ ...state, entries: next }, {
      expression: next.length ? `${next.length} entries` : '',
      result: next.length ? formatResult(tapeTotal(next)) : '0',
    })
  }

  return (
    <div className="gp-calc gp-calc-tape">
      <div className="gp-calc-roll" role="list" aria-label="Tape">
        {entries.length === 0 && (
          <p className="gp-calc-empty">Type a sum and press Enter to start the tape.</p>
        )}
        {entries.map((entry) => (
          <span key={entry.id} role="listitem" className="gp-calc-roll-row">
            <span className="gp-calc-roll-expression" title={entry.expression}>{entry.expression}</span>
            <span className="gp-calc-roll-result">{entry.result}</span>
            <button
              type="button"
              aria-label={`Remove ${entry.expression}`}
              onClick={() => removeLine(entry.id)}
            >
              <Trash2 size={10} aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <div className="gp-calc-total">
        <span>Total</span>
        <output>{formatResult(total)}</output>
      </div>

      <div className="gp-calc-entry gp-bare-field">
        <input
          value={draft}
          aria-label="New tape line"
          placeholder="e.g. 12.50 * 3"
          spellCheck={false}
          maxLength={EXPRESSION_LIMIT}
          data-floor-overflow="scroll"
          onChange={(event) => writeLine(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            addLine()
          }}
        />
        <i data-error={draftResult === 'Error' || undefined}>{draftResult}</i>
        <button type="button" aria-label="Add to tape" disabled={!draft.trim() || draftResult === 'Error'} onClick={addLine}>
          <CornerDownLeft size={12} aria-hidden />
        </button>
      </div>
      <p className="gp-calc-hint">{data.result === '' ? '' : `${entries.length} of ${TAPE_LIMIT} lines`}</p>
    </div>
  )
}

/* ----------------------------------------------------------------- finance */

function FinanceSkin({ state, setState }: SkinProps) {
  const mode = financeMode(state.mode)
  const recipe = financeRecipe(mode)
  const values = {
    a: readText(state.a),
    b: readText(state.b),
    c: readText(state.c),
  }

  const derive = (next: typeof values, nextMode = mode) => {
    const shape = financeRecipe(nextMode)
    const a = Number(next.a || 0)
    const b = Number(next.b || 0)
    const c = Number(next.c || 0)
    return {
      expression: `${shape.label}: ${shape.summary(a, b, c)}`,
      result: safeResult(() => shape.compute(a, b, c)),
    }
  }

  const patchValue = (key: 'a' | 'b' | 'c', value: string) => {
    const next = { ...values, [key]: value }
    setState({ ...state, ...next, mode }, derive(next))
  }

  return (
    <div className="gp-calc gp-calc-finance">
      <ModeBar
        label="Finance shortcut"
        value={mode}
        onChange={(next) => setState({ ...state, ...values, mode: next }, derive(values, next))}
        options={FINANCE_MODES.map((value) => ({ value, label: financeRecipe(value).label }))}
      />

      <div className="gp-calc-fields">
        {recipe.fields.map((field) => (
          <NumberField
            key={field.key}
            label={field.label}
            suffix={field.suffix}
            value={values[field.key]}
            onChange={(value) => patchValue(field.key, value)}
          />
        ))}
      </div>

      <Answer
        value={safeResult(() => recipe.compute(Number(values.a || 0), Number(values.b || 0), Number(values.c || 0)))}
        unit={recipe.unit}
      />
    </div>
  )
}

function Answer({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="gp-calc-answer" data-error={value === 'Error' || undefined}>
      <output>{value}</output>
      <span>{value === 'Error' ? 'check the figures' : unit}</span>
    </div>
  )
}

/* -------------------------------------------------------------- programmer */

const BITWISE_KEYS: readonly KeyDef[] = [
  { key: '&', label: 'AND' }, { key: '|', label: 'OR' }, { key: '^', label: 'XOR' },
  { key: '~', label: 'NOT' }, { key: '<<', label: '«' }, { key: '>>', label: '»' },
]

const BASE_ROWS: readonly { base: NumberBase; label: string }[] = [
  { base: 'dec', label: 'DEC' },
  { base: 'hex', label: 'HEX' },
  { base: 'oct', label: 'OCT' },
  { base: 'bin', label: 'BIN' },
]

function ProgrammerSkin({ data, commit, state, setState }: SkinProps) {
  const base = numberBase(state.base)

  const write = (expression: string, nextBase = base) => {
    const result = expression.trim() === ''
      ? ''
      : safeResult(() => evaluateIntegerExpression(expression, nextBase))
    commit(expression, result)
    return result
  }

  const value = Number(data.result)
  const readable = Number.isFinite(value) ? value : null

  const digits = baseDigits(base)
  const keys: KeyDef[] = [
    ...digits.map((digit) => ({ key: digit.toLowerCase(), label: digit })),
    { key: '+' }, { key: '-' }, { key: '*' }, { key: '/' },
    ...BITWISE_KEYS,
    { key: '(' }, { key: ')' },
    { key: 'C', action: 'clear' as const, tone: 'warn' as const },
    { key: '⌫', action: 'back' as const },
  ]

  return (
    <div className="gp-calc gp-calc-programmer">
      <ModeBar
        label="Number base"
        value={base}
        onChange={(next: NumberBase) => {
          const result = data.expression.trim() === ''
            ? ''
            : safeResult(() => evaluateIntegerExpression(data.expression, next))
          setState({ ...state, base: next }, { expression: data.expression, result })
        }}
        options={BASE_ROWS.map(({ base: value, label }) => ({ value, label }))}
      />

      <div className="gp-calc-entry gp-calc-entry--flat gp-bare-field">
        <input
          value={data.expression}
          aria-label="Integer expression"
          placeholder={base === 'hex' ? 'ff & 0f' : base === 'bin' ? '1011 | 0110' : '255 >> 2'}
          spellCheck={false}
          maxLength={EXPRESSION_LIMIT}
          data-floor-overflow="scroll"
          onChange={(event) => write(event.target.value)}
        />
      </div>

      <dl className="gp-calc-bases">
        {BASE_ROWS.map((row) => (
          <div key={row.base} data-active={row.base === base || undefined}>
            <dt>{row.label}</dt>
            <dd>{readable === null ? '—' : formatInBase(readable, row.base)}</dd>
          </div>
        ))}
      </dl>

      <Keypad
        keys={keys}
        columns={base === 'hex' ? 6 : 4}
        onPress={(key) => write(data.expression + key)}
        onClear={() => commit('', '')}
        onBack={() => write(data.expression.slice(0, -1))}
        onEquals={() => undefined}
      />
    </div>
  )
}

/* --------------------------------------------------------------- date math */

const DATE_OPTIONS: readonly { value: DateMode; label: string }[] = [
  { value: 'between', label: 'Between' },
  { value: 'offset', label: 'Offset' },
  { value: 'working_days', label: 'Working' },
]

function DateSkin({ state, setState }: SkinProps) {
  const mode = dateMode(state.mode)
  const from = readText(state.from)
  const to = readText(state.to)
  const days = readText(state.days)

  const derive = (next: { mode: DateMode; from: string; to: string; days: string }) => {
    if (next.mode === 'offset') {
      return {
        expression: `${next.from || '—'} ${Number(next.days || 0) < 0 ? '−' : '+'} ${Math.abs(Number(next.days || 0))}d`,
        result: (() => {
          try {
            return offsetDay(next.from, Number(next.days || 0))
          } catch {
            return 'Error'
          }
        })(),
      }
    }
    const label = next.mode === 'working_days' ? 'working days' : 'days'
    return {
      expression: `${next.from || '—'} → ${next.to || '—'} (${label})`,
      result: safeResult(() => (
        next.mode === 'working_days'
          ? workingDaysBetween(next.from, next.to)
          : daysBetween(next.from, next.to)
      )),
    }
  }

  const patch = (next: Partial<{ mode: DateMode; from: string; to: string; days: string }>) => {
    const merged = { mode, from, to, days, ...next }
    setState({ ...state, ...merged }, derive(merged))
  }

  const answer = derive({ mode, from, to, days })

  return (
    <div className="gp-calc gp-calc-date">
      <ModeBar label="Date calculation" value={mode} onChange={(next) => patch({ mode: next })} options={DATE_OPTIONS} />

      <div className="gp-calc-fields">
        <label className="gp-calc-field gp-bare-field">
          <span>{mode === 'offset' ? 'Date' : 'From'}</span>
          <span className="gp-calc-field-input">
            <input type="date" value={from} aria-label="From date" onChange={(event) => patch({ from: event.target.value })} />
          </span>
        </label>
        {mode === 'offset' ? (
          <NumberField label="Days" value={days} onChange={(value) => patch({ days: value })} />
        ) : (
          <label className="gp-calc-field gp-bare-field">
            <span>To</span>
            <span className="gp-calc-field-input">
              <input type="date" value={to} aria-label="To date" onChange={(event) => patch({ to: event.target.value })} />
            </span>
          </label>
        )}
      </div>

      <Answer
        value={answer.result}
        unit={mode === 'offset' ? 'date' : mode === 'working_days' ? 'working days' : 'days'}
      />
      {mode === 'working_days' && (
        <p className="gp-calc-hint">Weekends excluded. Public holidays are not known here.</p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- named variables */

function VariablesSkin({ data, commit, state, setState }: SkinProps) {
  const variables = useMemo(() => namedVariables(state.variables), [state.variables])
  const bindings = useMemo(() => variableBindings(variables), [variables])

  const recompute = (expression: string, list: readonly NamedVariable[]) => (
    expression.trim() === ''
      ? ''
      : safeResult(() => evaluateExpression(expression, { variables: variableBindings(list) }))
  )

  const setVariables = (next: NamedVariable[]) => {
    setState({ ...state, variables: next }, {
      expression: data.expression,
      result: recompute(data.expression, next),
    })
  }

  const add = () => {
    if (variables.length >= VARIABLE_LIMIT) return
    setVariables([...variables, { id: crypto.randomUUID(), name: '', value: 0 }])
  }

  return (
    <div className="gp-calc gp-calc-variables">
      <Display
        expression={data.expression}
        result={data.result}
        label="Expression with names"
        placeholder="rate * hours"
        onExpression={(expression) => commit(expression, recompute(expression, variables))}
      />

      <div className="gp-calc-variable-list">
        {variables.length === 0 && (
          <p className="gp-calc-empty">Name a value, then use that name in the expression above.</p>
        )}
        {variables.map((variable, index) => {
          const usable = isUsableVariableName(variable.name)
          return (
            <div key={variable.id} className="gp-calc-variable gp-bare-field" data-invalid={variable.name && !usable ? 'true' : undefined}>
              <input
                value={variable.name}
                aria-label={`Name of value ${index + 1}`}
                placeholder="name"
                spellCheck={false}
                onChange={(event) => setVariables(variables.map((entry) => (
                  entry.id === variable.id ? { ...entry, name: event.target.value } : entry
                )))}
              />
              <input
                type="number"
                inputMode="decimal"
                value={String(variable.value)}
                aria-label={variable.name || `Value ${index + 1}`}
                onChange={(event) => setVariables(variables.map((entry) => (
                  entry.id === variable.id ? { ...entry, value: Number(event.target.value) || 0 } : entry
                )))}
              />
              <button
                type="button"
                aria-label={`Remove ${variable.name || `value ${index + 1}`}`}
                onClick={() => setVariables(variables.filter((entry) => entry.id !== variable.id))}
              >
                <Trash2 size={10} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      <div className="gp-calc-variable-foot">
        <button type="button" disabled={variables.length >= VARIABLE_LIMIT} onClick={add}>
          <Plus size={11} aria-hidden />
          {variables.length >= VARIABLE_LIMIT ? `${VARIABLE_LIMIT} is the limit` : 'Name a value'}
        </button>
        <span className="gp-calc-hint">
          {Object.keys(bindings).length > 0
            ? `A wire can write ${Object.keys(bindings).join(', ')}`
            : 'Named values can be written by a wire'}
        </span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- root */

/**
 * One calculator, seven ways to reach a number. Whichever skin is worn,
 * `result` stays the single value a wire reads and `expression` stays the
 * readable record of how it was reached — so a card feeding a gate keeps
 * feeding it after a skin change.
 *
 * No skin uses `eval`: everything is parsed by hand in calculatorSkinModel.ts.
 */
export function CalculatorWidget({ data, onChange, skin: worn }: CalculatorWidgetProps) {
  // A persisted skin from an older or hostile board is normalised here, so no
  // renderer below has to guard against a value it has never heard of.
  const skin = calculatorSkinMode(worn)

  const commit = (expression: string, result: string) => {
    onChange({ ...data, expression, result, skin })
  }

  const state = skinStateFor(data, skin)
  const setState = (
    next: WidgetSkinState,
    derived?: { expression: string; result: string },
  ) => {
    const base = derived ? { ...data, ...derived } : data
    onChange(dataWithSkinState({ ...base, skin } as ModuleData, skin, next) as CalculatorData)
  }

  const props: SkinProps = { data, commit, state, setState }

  if (skin === 'scientific') return <ExpressionSkin {...props} scientific />
  if (skin === 'tape') return <TapeSkin {...props} />
  if (skin === 'finance') return <FinanceSkin {...props} />
  if (skin === 'programmer') return <ProgrammerSkin {...props} />
  if (skin === 'date_math') return <DateSkin {...props} />
  if (skin === 'named_variables') return <VariablesSkin {...props} />
  return <ExpressionSkin {...props} scientific={false} />
}
