import {
  ArrowDownRight, ArrowUpRight, Check, Copy, GitBranch, Minus, Percent, Plus,
  Scale, Sigma, TrendingUp, Variable,
} from 'lucide-react'
import type { ModuleData } from '../../../types/spatial'
import type {
  FormulaData,
  FormulaInputKey,
  FormulaOperator,
} from '../../../types/widgetDataWorkflow'
import { useTransientValue } from '../../../hooks/useTransientValue'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import { EXPRESSION_FUNCTION_NAMES } from './calculatorSkinModel'
import {
  branchText,
  COMPARATOR_SYMBOL,
  COMPARATORS,
  comparatorOf,
  comparisonHolds,
  conditionalBranches,
  dataWithInputCount,
  dataWithInputName,
  expressionText,
  FORMULA_EXPRESSION_LIMIT,
  FORMULA_INPUT_MAX,
  FORMULA_INPUT_MIN,
  FORMULA_NAME_LIMIT,
  formatFormulaNumber,
  formulaBindings,
  formulaInputs,
  formulaPrecision,
  formulaReading,
  formulaResultWord,
  formulaUnit,
  GROWTH_PERIOD_LIMIT,
  GROWTH_PERIODS,
  growthPeriods,
  growthProjection,
  inputShares,
  OPERATOR_SYMBOL,
  OPERATOR_WORD,
  OPERATORS,
  roleInput,
  simplifiedRatio,
  WEIGHTED_EXTRA_LIMIT,
  weightedRows,
  weightShares,
  type FormulaInput,
  type FormulaSkinMode,
} from './formulaSkinModel'

interface FormulaWidgetProps {
  data: FormulaData
  onChange: (data: FormulaData) => void
  skin?: FormulaSkinMode
}

type Patch = (next: Partial<FormulaData>) => void

interface SkinProps {
  data: FormulaData
  patch: Patch
  /** Whole-card writes the model owns: naming a slot, growing the rack. */
  write: (next: FormulaData) => void
  state: WidgetSkinState
  setState: (next: WidgetSkinState) => void
}

const SKIN_GLYPH: Record<FormulaSkinMode, typeof Sigma> = {
  two_input: Sigma,
  percent_change: Percent,
  ratio: Scale,
  growth: TrendingUp,
  expression: Variable,
  weighted_score: Sigma,
  conditional: GitBranch,
}

const SKIN_NAME: Record<FormulaSkinMode, string> = {
  two_input: 'Chain',
  percent_change: 'Change',
  ratio: 'Ratio',
  growth: 'Projection',
  expression: 'Expression',
  weighted_score: 'Weighted',
  conditional: 'Conditional',
}

/* ------------------------------------------------------------------ shared */

/** The card's own name. Every skin carries it in the same place. */
function FormulaLabel({
  skin,
  value,
  onChange,
}: {
  skin: FormulaSkinMode
  value: string
  onChange: (value: string) => void
}) {
  const Glyph = SKIN_GLYPH[skin]
  return (
    <header className="gp-fx-head">
      <span className="gp-fx-glyph" aria-hidden><Glyph size={14} /></span>
      <div className="gp-fx-name gp-bare-field">
        <input
          value={value}
          aria-label="Formula label"
          placeholder="Name this calculation"
          data-floor-overflow="scroll"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <span className="gp-fx-kind" aria-hidden>{SKIN_NAME[skin]}</span>
    </header>
  )
}

/**
 * One input slot: its name, its number, and the letter of the port a wire
 * lands on. Every slot is drawn identically — a card that made one input
 * larger than another would be recommending it (Article XVIII).
 */
function Slot({
  input,
  role,
  onName,
  onValue,
  suffix,
}: {
  input: FormulaInput
  /** What this skin is currently using the slot for, if anything. */
  role?: string
  onName: (name: string) => void
  onValue: (value: number) => void
  suffix?: string
}) {
  return (
    <div className="gp-fx-operand gp-bare-field" data-operand={input.key}>
      <span className="gp-fx-slot-head">
        <input
          className="gp-fx-slot-name"
          value={input.name}
          aria-label={`Input ${input.letter} name`}
          placeholder={role ?? input.letter}
          maxLength={FORMULA_NAME_LIMIT}
          onChange={(event) => onName(event.target.value)}
        />
        <span className="gp-fx-port-tag" title={`Circuit port ${input.letter}`}>{input.letter}</span>
      </span>
      <span className="gp-fx-operand-value">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          aria-label={`${input.title} value`}
          value={Number.isFinite(input.value) ? input.value : 0}
          onChange={(event) => onValue(Number(event.target.value) || 0)}
          onFocus={(event) => event.currentTarget.select()}
        />
        {suffix && <em aria-hidden>{suffix}</em>}
      </span>
      {role && <span className="gp-fx-slot-role" aria-hidden>{role}</span>}
    </div>
  )
}

/**
 * Every input the card holds, with the two controls that grow and shrink the
 * rack. This is the one place a Formula's numbers are edited by hand, and each
 * one of them is a port a wire can write instead.
 */
function InputRack({
  data,
  write,
  patch,
  roles = {},
  suffixes = {},
}: {
  data: FormulaData
  write: (next: FormulaData) => void
  patch: Patch
  /** Slot key → the job this skin gives it, printed under the number. */
  roles?: Partial<Record<FormulaInputKey, string>>
  suffixes?: Partial<Record<FormulaInputKey, string>>
}) {
  const inputs = formulaInputs(data)
  return (
    <div className="gp-fx-rack">
      <div className="gp-fx-operands" data-count={inputs.length}>
        {inputs.map((input) => (
          <Slot
            key={input.key}
            input={input}
            role={roles[input.key]}
            suffix={suffixes[input.key]}
            onName={(name) => write(dataWithInputName(data, input.key, name))}
            onValue={(value) => patch({ [input.key]: value } as Partial<FormulaData>)}
          />
        ))}
      </div>
      <div className="gp-fx-rack-footer">
        <button
          type="button"
          className="gp-fx-add"
          disabled={inputs.length <= FORMULA_INPUT_MIN}
          aria-label="Remove the last input"
          onClick={() => write(dataWithInputCount(data, inputs.length - 1))}
        >
          <Minus size={12} aria-hidden />
        </button>
        <span className="gp-fx-rack-count">{inputs.length} inputs</span>
        <button
          type="button"
          className="gp-fx-add"
          disabled={inputs.length >= FORMULA_INPUT_MAX}
          aria-label="Add an input"
          onClick={() => write(dataWithInputCount(data, inputs.length + 1))}
        >
          <Plus size={12} aria-hidden />
        </button>
      </div>
    </div>
  )
}

/** Which input fills one of a skin's roles. */
function RolePicker({
  label,
  inputs,
  selected,
  onSelect,
}: {
  label: string
  inputs: readonly FormulaInput[]
  selected: FormulaInputKey
  onSelect: (key: FormulaInputKey) => void
}) {
  return (
    <div className="gp-fx-role">
      <span className="gp-fx-label">{label}</span>
      <div className="gp-fx-operators" role="group" aria-label={`${label} input`}>
        {inputs.map((input) => (
          <button
            key={input.key}
            type="button"
            aria-pressed={selected === input.key}
            aria-label={`${label}: ${input.title}`}
            onClick={() => onSelect(input.key)}
          >
            {input.title}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * How the answer is printed — and therefore how it is published, because the
 * rounding a reader sees is the rounding the wire carries.
 */
function AnswerFormat({ data, patch }: { data: FormulaData; patch: Patch }) {
  const places = formulaPrecision(data)
  return (
    <div className="gp-fx-format">
      <label className="gp-fx-format-cell gp-bare-field">
        <span className="gp-fx-label">Unit</span>
        <input
          value={formulaUnit(data)}
          aria-label="Unit printed after the answer"
          placeholder="none"
          maxLength={12}
          onChange={(event) => patch({ unit: event.target.value || undefined })}
        />
      </label>
      <label className="gp-fx-format-cell gp-bare-field">
        <span className="gp-fx-label">Decimals</span>
        <input
          type="number"
          min="0"
          max="6"
          step="1"
          aria-label="Decimal places"
          placeholder="auto"
          value={places === null ? '' : places}
          onChange={(event) => {
            const raw = event.target.value
            patch({ precision: raw === '' ? undefined : Math.max(0, Math.min(6, Number(raw) || 0)) })
          }}
        />
      </label>
    </div>
  )
}

/**
 * The answer. Every skin publishes exactly this number, so it is always the
 * card's one hero and always carries the skin's own word for it.
 */
function Result({
  data,
  skin,
  tone,
  children,
}: {
  data: FormulaData
  skin: FormulaSkinMode
  tone?: 'up' | 'down'
  children?: React.ReactNode
}) {
  const reading = formulaReading(data)
  const places = formulaPrecision(data)
  const printed = places === null ? formatFormulaNumber(reading.value) : reading.value.toFixed(places)
  const [copied, showCopied] = useTransientValue(false)

  return (
    <div className="gp-fx-result gp-flat-visual-own" data-tone={tone}>
      <div className="gp-fx-result-row">
        <span className="gp-fx-label">{formulaResultWord(skin)}</span>
        <output className="gp-fx-hero">
          {tone === 'up' && <ArrowUpRight size={16} aria-hidden />}
          {tone === 'down' && <ArrowDownRight size={16} aria-hidden />}
          <strong>{printed}</strong>
          {reading.suffix && <em>{reading.suffix}</em>}
        </output>
        <button
          type="button"
          className="gp-fx-copy"
          data-copied={copied || undefined}
          aria-label="Copy result"
          title={copied ? 'Result copied' : 'Copy result'}
          onClick={() => {
            void navigator.clipboard?.writeText(printed)
            showCopied(true, 1400)
          }}
        >
          {copied ? <Check size={12} aria-hidden /> : <Copy size={11} aria-hidden />}
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? 'Result copied' : ''}
          </span>
        </button>
      </div>
      {children}
      {reading.note && <p className="gp-fx-note">{reading.note}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------- skins */

function TwoInputSkin({ data, patch, write }: SkinProps) {
  const operator = data.operator
  const inputs = formulaInputs(data)
  const sentence = inputs
    .map((input) => formatFormulaNumber(input.value))
    .join(` ${OPERATOR_SYMBOL[operator]} `)

  return (
    <div className="gp-fx gp-fx--two">
      <FormulaLabel skin="two_input" value={data.label} onChange={(label) => patch({ label })} />

      <InputRack data={data} write={write} patch={patch} />

      <div className="gp-fx-operators" role="group" aria-label="Operation">
        {OPERATORS.map((option: FormulaOperator) => (
          <button
            key={option}
            type="button"
            aria-pressed={operator === option}
            aria-label={`Each input ${OPERATOR_WORD[option]} the next`}
            onClick={() => patch({ operator: option })}
          >
            {OPERATOR_SYMBOL[option]}
          </button>
        ))}
      </div>

      <Result data={data} skin="two_input">
        {/* The whole chain as it is read, left to right. */}
        <p className="gp-fx-caption">{sentence}</p>
      </Result>

      <AnswerFormat data={data} patch={patch} />
    </div>
  )
}

function PercentChangeSkin({ data, patch, write, state, setState }: SkinProps) {
  const inputs = formulaInputs(data)
  const from = roleInput(inputs, state, 'fromKey', 0)
  const to = roleInput(inputs, state, 'toKey', 1)
  const reading = formulaReading(data)
  const tone = reading.note ? undefined : reading.value > 0 ? 'up' : reading.value < 0 ? 'down' : undefined
  const difference = to.value - from.value

  return (
    <div className="gp-fx gp-fx--percent">
      <FormulaLabel skin="percent_change" value={data.label} onChange={(label) => patch({ label })} />

      <InputRack
        data={data}
        write={write}
        patch={patch}
        roles={{ [from.key]: 'Before', [to.key]: 'After' }}
      />

      {inputs.length > 2 && (
        <div className="gp-fx-roles">
          <RolePicker
            label="Before"
            inputs={inputs}
            selected={from.key}
            onSelect={(key) => setState({ ...state, fromKey: key })}
          />
          <RolePicker
            label="After"
            inputs={inputs}
            selected={to.key}
            onSelect={(key) => setState({ ...state, toKey: key })}
          />
        </div>
      )}

      <Result data={data} skin="percent_change" tone={tone}>
        <p className="gp-fx-caption">
          {difference === 0
            ? 'No movement between the two values'
            : `${difference > 0 ? 'Up' : 'Down'} ${formatFormulaNumber(Math.abs(difference))} in absolute terms`}
        </p>
      </Result>

      <AnswerFormat data={data} patch={patch} />
    </div>
  )
}

function RatioSkin({ data, patch, write, state, setState }: SkinProps) {
  const inputs = formulaInputs(data)
  const part = roleInput(inputs, state, 'partKey', 0)
  const shares = inputShares(inputs)
  const simplified = inputs.length === 2
    ? simplifiedRatio(inputs[0]!.value, inputs[1]!.value)
    : null

  return (
    <div className="gp-fx gp-fx--ratio">
      <FormulaLabel skin="ratio" value={data.label} onChange={(label) => patch({ label })} />

      <InputRack data={data} write={write} patch={patch} roles={{ [part.key]: 'Share of' }} />

      {/* The split itself, drawn to scale — the one thing a row of numbers
          cannot say on its own. Every part is a segment; the one being asked
          about is the lit one. */}
      <div
        className="gp-fx-split gp-flat-visual-own"
        role="img"
        aria-label={inputs
          .map((input, index) => `${input.title} holds ${Math.round(shares[index]! * 100)} percent of the total`)
          .join(', ')}
      >
        {inputs.map((input, index) => (
          <span
            key={input.key}
            className="gp-fx-split-part"
            data-lit={input.key === part.key || undefined}
            style={{ flexGrow: Math.max(0.001, shares[index]!) }}
          />
        ))}
      </div>
      <div className="gp-fx-split-legend">
        {inputs.map((input, index) => (
          <button
            key={input.key}
            type="button"
            aria-pressed={input.key === part.key}
            aria-label={`Measure the share held by ${input.title}`}
            onClick={() => setState({ ...state, partKey: input.key })}
          >
            <i data-lit={input.key === part.key || undefined} />
            {input.title} · {Math.round(shares[index]! * 100)}%
          </button>
        ))}
      </div>

      <Result data={data} skin="ratio">
        <p className="gp-fx-caption">
          {simplified
            ? `Simplifies to ${simplified.left} : ${simplified.right}`
            : `${part.title} against ${inputs.length - 1} other ${inputs.length === 2 ? 'part' : 'parts'}`}
        </p>
      </Result>

      <AnswerFormat data={data} patch={patch} />
    </div>
  )
}

function GrowthSkin({ data, patch, write, state, setState }: SkinProps) {
  const inputs = formulaInputs(data)
  const start = roleInput(inputs, state, 'startKey', 0)
  const rate = roleInput(inputs, state, 'rateKey', 1)
  const periods = growthPeriods(state)
  const projection = growthProjection(start.value, rate.value, Math.max(GROWTH_PERIODS, periods))
  // Compound growth over several periods is a narrow band of similar numbers,
  // so bars drawn from zero would all look the same height. These are scaled
  // between the smallest and largest period shown — they compare the
  // projection with itself, which is the only comparison being offered.
  const sizes = projection.map(Math.abs)
  const low = Math.min(...sizes)
  const high = Math.max(...sizes)
  const barHeight = (value: number) => (
    high === low ? 62 : 26 + ((Math.abs(value) - low) / (high - low)) * 74
  )

  return (
    <div className="gp-fx gp-fx--growth">
      <FormulaLabel skin="growth" value={data.label} onChange={(label) => patch({ label })} />

      <InputRack
        data={data}
        write={write}
        patch={patch}
        roles={{ [start.key]: 'Start', [rate.key]: 'Rate' }}
        suffixes={{ [rate.key]: '%' }}
      />

      {inputs.length > 2 && (
        <div className="gp-fx-roles">
          <RolePicker
            label="Start"
            inputs={inputs}
            selected={start.key}
            onSelect={(key) => setState({ ...state, startKey: key })}
          />
          <RolePicker
            label="Rate"
            inputs={inputs}
            selected={rate.key}
            onSelect={(key) => setState({ ...state, rateKey: key })}
          />
        </div>
      )}

      {/* How far ahead the published number looks. One period is the answer
          this card has always given, so an untouched card is unchanged. */}
      <label className="gp-fx-periods-control gp-bare-field">
        <span className="gp-fx-label">Periods ahead</span>
        <input
          type="number"
          min="1"
          max={GROWTH_PERIOD_LIMIT}
          step="1"
          aria-label="Periods ahead"
          value={periods}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setState({
            ...state,
            periods: Math.max(1, Math.min(GROWTH_PERIOD_LIMIT, Math.trunc(Number(event.target.value) || 1))),
          })}
        />
      </label>

      <Result data={data} skin="growth" />

      {/* Where the same rate keeps going. The period the card publishes is the
          lit one. */}
      <div className="gp-fx-projection">
        <span className="gp-fx-label">If the rate holds</span>
        <ol className="gp-fx-periods">
          {projection.map((value, index) => (
            <li key={index} data-first={index + 1 === periods || undefined}>
              <span className="gp-fx-period-track" aria-hidden>
                <span className="gp-fx-period-bar" style={{ height: `${barHeight(value)}%` }} />
              </span>
              <em>{index + 1}</em>
              <span className="gp-fx-period-value">
                {formatFormulaNumber(Math.round(value * 100) / 100)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <AnswerFormat data={data} patch={patch} />
    </div>
  )
}

function ExpressionSkin({ data, patch, write, state, setState }: SkinProps) {
  const inputs = formulaInputs(data)
  const source = expressionText(state)
  const reading = formulaReading(data)
  const names = Object.keys(formulaBindings(inputs))

  const insert = (token: string) => {
    setState({ ...state, expression: `${source}${token}`.slice(0, FORMULA_EXPRESSION_LIMIT) })
  }

  return (
    <div className="gp-fx gp-fx--expression">
      <FormulaLabel skin="expression" value={data.label} onChange={(label) => patch({ label })} />

      <div className="gp-fx-expression gp-bare-field" data-invalid={reading.note ? true : undefined}>
        <span className="gp-fx-expression-prefix" aria-hidden>ƒ</span>
        <input
          value={source}
          aria-label="Expression over this card's inputs"
          placeholder="if(b = 0, 0, a / b)"
          maxLength={FORMULA_EXPRESSION_LIMIT}
          onChange={(event) => setState({ ...state, expression: event.target.value })}
        />
      </div>

      {/* Everything this expression may name: the card's own inputs first,
          then the operators it is most often written with. */}
      <div className="gp-fx-tokens" role="group" aria-label="Insert into the expression">
        {inputs.map((input) => (
          <button
            key={input.key}
            type="button"
            aria-label={`Insert ${input.title}`}
            title={`${input.title} is ${formatFormulaNumber(input.value)}`}
            onClick={() => insert(input.callable ? input.name.trim().toLowerCase() : input.key)}
          >
            {input.title}
          </button>
        ))}
        {['+', '−', '×', '÷', '(', ')'].map((token) => (
          <button
            key={token}
            type="button"
            aria-label={`Insert ${token}`}
            onClick={() => insert(token === '−' ? '-' : token === '×' ? '*' : token === '÷' ? '/' : token)}
          >
            {token}
          </button>
        ))}
      </div>

      <details className="gp-fx-help">
        <summary>What this expression can use</summary>
        <p>
          Your inputs, by name or letter: <code>{names.join(', ')}</code>. The operators
          {' '}<code>+ - * / ^ mod</code>, comparisons <code>{'< > = !='}</code> that answer 1 or 0,
          {' '}<code>&amp;&amp;</code> and <code>||</code>, and the functions
          {' '}<code>{EXPRESSION_FUNCTION_NAMES.join(', ')}</code>.
        </p>
      </details>

      <InputRack data={data} write={write} patch={patch} />

      <Result data={data} skin="expression" />

      <AnswerFormat data={data} patch={patch} />
    </div>
  )
}

function WeightedScoreSkin({ data, patch, write, state, setState }: SkinProps) {
  const rows = weightedRows(data)
  const shares = weightShares(rows)
  const totalWeight = rows.reduce((total, row) => total + row.weight, 0)
  const inputs = formulaInputs(data)
  const extra = Array.isArray(state.rows) ? state.rows as Record<string, unknown>[] : []

  const writeExtra = (next: Record<string, unknown>[]) => setState({ ...state, rows: next })
  const editExtra = (index: number, patchRow: Record<string, unknown>) => {
    writeExtra(extra.map((row, position) => (position === index ? { ...row, ...patchRow } : row)))
  }
  const setWeight = (key: FormulaInputKey, weight: number) => setState({
    ...state,
    weights: { ...(state.weights as Record<string, unknown> ?? {}), [key]: weight },
  })

  return (
    <div className="gp-fx gp-fx--weighted">
      <FormulaLabel skin="weighted_score" value={data.label} onChange={(label) => patch({ label })} />

      {/* Column names once, above the list — a table is one island, and three
          rows repeating "VALUE / WEIGHT" is chrome, not information. */}
      <div className="gp-fx-rows-head" aria-hidden>
        <span className="gp-fx-label">Row</span>
        <span className="gp-fx-label">Value</span>
        <span className="gp-fx-label">Weight</span>
        <span />
      </div>

      <ul className="gp-fx-rows">
        {rows.map((row, index) => {
          const key = row.key
          const extraIndex = index - inputs.length
          // Boards scored before slots could be named kept their words under
          // `labelA`/`labelB`; the field shows those until it is retyped.
          const legacy = key === 'a' ? state.labelA : key === 'b' ? state.labelB : undefined
          return (
            <li key={row.id} className="gp-fx-row" data-canonical={row.canonical || undefined}>
              <span className="gp-fx-row-share" style={{ width: `${shares[index]! * 100}%` }} aria-hidden />
              <div className="gp-fx-row-name gp-bare-field">
                <input
                  value={key
                    ? (data.names?.[key] ?? (typeof legacy === 'string' ? legacy : ''))
                    : String(extra[extraIndex]?.label ?? '')}
                  aria-label={`Row ${index + 1} name`}
                  placeholder={row.label}
                  maxLength={FORMULA_NAME_LIMIT}
                  onChange={(event) => (key
                    ? write(dataWithInputName(data, key, event.target.value))
                    : editExtra(extraIndex, { label: event.target.value }))}
                />
              </div>
              <label className="gp-fx-row-cell gp-bare-field">
                <input
                  type="number"
                  step="any"
                  aria-label={`Row ${index + 1} value`}
                  value={row.value}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    const value = Number(event.target.value) || 0
                    if (key) return patch({ [key]: value } as Partial<FormulaData>)
                    editExtra(extraIndex, { value })
                  }}
                />
              </label>
              <label className="gp-fx-row-cell gp-bare-field">
                <input
                  type="number"
                  min="0"
                  step="any"
                  aria-label={`Row ${index + 1} weight`}
                  value={row.weight}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    const weight = Math.max(0, Number(event.target.value) || 0)
                    if (key) return setWeight(key, weight)
                    editExtra(extraIndex, { weight })
                  }}
                />
              </label>
              {key ? (
                <span className="gp-fx-row-tag" title={`Circuit port ${row.id.toUpperCase()}`}>
                  {row.id.toUpperCase()}
                </span>
              ) : (
                <button
                  type="button"
                  className="gp-fx-row-remove"
                  aria-label={`Remove row ${index + 1}`}
                  onClick={() => writeExtra(extra.filter((_row, position) => position !== extraIndex))}
                >
                  <Minus size={11} aria-hidden />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <div className="gp-fx-row-footer">
        <button
          type="button"
          className="gp-fx-add"
          disabled={inputs.length >= FORMULA_INPUT_MAX}
          onClick={() => write(dataWithInputCount(data, inputs.length + 1))}
        >
          <Plus size={12} aria-hidden />
          Add a wired row
        </button>
        <button
          type="button"
          className="gp-fx-add"
          disabled={extra.length >= WEIGHTED_EXTRA_LIMIT}
          onClick={() => writeExtra([...extra, { id: crypto.randomUUID(), label: '', value: 0, weight: 1 }])}
        >
          <Plus size={12} aria-hidden />
          Add a row
        </button>
        <span className="gp-fx-weight-total">
          Total weight <strong>{formatFormulaNumber(totalWeight)}</strong>
        </span>
      </div>

      <Result data={data} skin="weighted_score" />

      <AnswerFormat data={data} patch={patch} />
    </div>
  )
}

function ConditionalSkin({ data, patch, write, state, setState }: SkinProps) {
  const inputs = formulaInputs(data)
  const comparator = comparatorOf(state)
  const left = roleInput(inputs, state, 'leftKey', 0)
  const right = roleInput(inputs, state, 'rightKey', 1)
  const holds = comparisonHolds(left.value, right.value, comparator)
  // Read so a branch that cannot be parsed is reported where it is typed.
  const branches = conditionalBranches(state, formulaBindings(inputs))

  return (
    <div className="gp-fx gp-fx--conditional">
      <FormulaLabel skin="conditional" value={data.label} onChange={(label) => patch({ label })} />

      <InputRack
        data={data}
        write={write}
        patch={patch}
        roles={{ [left.key]: 'Compare', [right.key]: 'Against' }}
      />

      {inputs.length > 2 && (
        <div className="gp-fx-roles">
          <RolePicker
            label="Compare"
            inputs={inputs}
            selected={left.key}
            onSelect={(key) => setState({ ...state, leftKey: key })}
          />
          <RolePicker
            label="Against"
            inputs={inputs}
            selected={right.key}
            onSelect={(key) => setState({ ...state, rightKey: key })}
          />
        </div>
      )}

      <div className="gp-fx-operators" role="group" aria-label="Comparison">
        {COMPARATORS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={comparator === option}
            aria-label={`${left.title} ${COMPARATOR_SYMBOL[option]} ${right.title}`}
            onClick={() => setState({ ...state, comparator: option })}
          >
            {COMPARATOR_SYMBOL[option]}
          </button>
        ))}
      </div>

      {/* Both outcomes stay the same size — the card must not look as though
          it prefers one branch (the symmetry rule). Either may be a plain
          number or an expression over the card's own inputs. */}
      <div className="gp-fx-branches">
        <label
          className="gp-fx-branch gp-bare-field"
          data-live={holds || undefined}
          data-invalid={branches.trueNote ? true : undefined}
        >
          <span className="gp-fx-label">Then</span>
          <input
            aria-label="Value when the comparison holds"
            placeholder="1"
            maxLength={FORMULA_EXPRESSION_LIMIT}
            value={branchText(state, 'whenTrue')}
            onChange={(event) => setState({ ...state, whenTrue: event.target.value })}
          />
          <span className="gp-fx-branch-state" aria-hidden>{holds ? 'Selected' : 'Standby'}</span>
        </label>
        <label
          className="gp-fx-branch gp-bare-field"
          data-live={!holds || undefined}
          data-invalid={branches.falseNote ? true : undefined}
        >
          <span className="gp-fx-label">Else</span>
          <input
            aria-label="Value when the comparison does not hold"
            placeholder="0"
            maxLength={FORMULA_EXPRESSION_LIMIT}
            value={branchText(state, 'whenFalse')}
            onChange={(event) => setState({ ...state, whenFalse: event.target.value })}
          />
          <span className="gp-fx-branch-state" aria-hidden>{!holds ? 'Selected' : 'Standby'}</span>
        </label>
      </div>

      <Result data={data} skin="conditional">
        <p className="gp-fx-caption">
          {`${formatFormulaNumber(left.value)} ${COMPARATOR_SYMBOL[comparator]} ${formatFormulaNumber(right.value)} is ${holds ? 'true' : 'false'}`}
        </p>
      </Result>

      <AnswerFormat data={data} patch={patch} />
    </div>
  )
}

/* -------------------------------------------------------------------- root */

/**
 * Up to six named numbers, seven questions. Every input is a circuit port and
 * every input stays on screen and editable — a wire writes them, and a card
 * that hid one could not be corrected by hand. The skin decides what is asked
 * of them and which of them fill its roles. Whatever it asks, the number the
 * card shows is the number it publishes: `formulaReading` is the only
 * calculation, and the `result` field, the resting tile, and this renderer all
 * read it.
 */
export function FormulaWidget({ data, onChange, skin = 'two_input' }: FormulaWidgetProps) {
  const write = (next: FormulaData) => onChange({ ...next, skin })
  const patch: Patch = (next) => write({ ...data, ...next })

  const state = skinStateFor(data, skin)
  const setState = (next: WidgetSkinState) => {
    onChange(dataWithSkinState({ ...data, skin } as ModuleData, skin, next) as FormulaData)
  }

  const props: SkinProps = { data, patch, write, state, setState }

  if (skin === 'percent_change') return <PercentChangeSkin {...props} />
  if (skin === 'ratio') return <RatioSkin {...props} />
  if (skin === 'growth') return <GrowthSkin {...props} />
  if (skin === 'expression') return <ExpressionSkin {...props} />
  if (skin === 'weighted_score') return <WeightedScoreSkin {...props} />
  if (skin === 'conditional') return <ConditionalSkin {...props} />
  return <TwoInputSkin {...props} />
}
