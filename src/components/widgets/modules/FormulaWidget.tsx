import {
  ArrowDownRight, ArrowUpRight, Copy, GitBranch, Minus, Percent, Plus,
  Scale, Sigma, TrendingUp, Variable,
} from 'lucide-react'
import type { ModuleData } from '../../../types/spatial'
import type { FormulaData, FormulaOperator } from '../../../types/widgetDataWorkflow'
import { useTransientValue } from '../../../hooks/useTransientValue'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  COMPARATOR_SYMBOL,
  COMPARATORS,
  comparatorOf,
  comparisonHolds,
  conditionalBranches,
  expressionText,
  FORMULA_EXPRESSION_LIMIT,
  formatFormulaNumber,
  formulaReading,
  formulaResultWord,
  GROWTH_PERIODS,
  growthProjection,
  OPERATOR_SYMBOL,
  OPERATOR_WORD,
  OPERATORS,
  simplifiedRatio,
  WEIGHTED_EXTRA_LIMIT,
  weightedRows,
  weightShares,
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
    </header>
  )
}

/**
 * One operand. A and B are visually identical alternatives wherever both are
 * shown — the symmetry rule in Article XVIII: a card that drew one of them
 * larger would be recommending it.
 */
function Operand({
  name,
  label,
  value,
  onChange,
  suffix,
}: {
  name: 'a' | 'b'
  label: string
  value: number
  onChange: (value: number) => void
  suffix?: string
}) {
  return (
    <label className="gp-fx-operand gp-bare-field" data-operand={name}>
      <span className="gp-fx-label">{label}</span>
      <span className="gp-fx-operand-value">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          aria-label={label}
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
        />
        {suffix && <em aria-hidden>{suffix}</em>}
      </span>
    </label>
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
  const [copied, showCopied] = useTransientValue(false)

  return (
    <div className="gp-fx-result gp-flat-visual-own" data-tone={tone}>
      <div className="gp-fx-result-row">
        <span className="gp-fx-label">{formulaResultWord(skin)}</span>
        <output className="gp-fx-hero">
          {tone === 'up' && <ArrowUpRight size={16} aria-hidden />}
          {tone === 'down' && <ArrowDownRight size={16} aria-hidden />}
          <strong>{formatFormulaNumber(reading.value)}</strong>
          {reading.suffix && <em>{reading.suffix}</em>}
        </output>
        <button
          type="button"
          className="gp-fx-copy"
          aria-label="Copy result"
          title="Copy result"
          onClick={() => {
            void navigator.clipboard?.writeText(formatFormulaNumber(reading.value))
            showCopied(true, 1400)
          }}
        >
          {copied ? <span className="gp-fx-copied">Copied</span> : <Copy size={11} aria-hidden />}
        </button>
      </div>
      {children}
      {reading.note && <p className="gp-fx-note">{reading.note}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------- skins */

function TwoInputSkin({ data, patch }: SkinProps) {
  const operator = data.operator
  return (
    <div className="gp-fx gp-fx--two">
      <FormulaLabel skin="two_input" value={data.label} onChange={(label) => patch({ label })} />

      <div className="gp-fx-operands">
        <Operand name="a" label="A" value={data.a} onChange={(a) => patch({ a })} />
        <span className="gp-fx-operator-mark" aria-hidden>{OPERATOR_SYMBOL[operator]}</span>
        <Operand name="b" label="B" value={data.b} onChange={(b) => patch({ b })} />
      </div>

      <div className="gp-fx-operators" role="group" aria-label="Operation">
        {OPERATORS.map((option: FormulaOperator) => (
          <button
            key={option}
            type="button"
            aria-pressed={operator === option}
            aria-label={`A ${OPERATOR_WORD[option]} B`}
            onClick={() => patch({ operator: option })}
          >
            {OPERATOR_SYMBOL[option]}
          </button>
        ))}
      </div>

      <Result data={data} skin="two_input" />
    </div>
  )
}

function PercentChangeSkin({ data, patch }: SkinProps) {
  const reading = formulaReading(data)
  const tone = reading.note ? undefined : reading.value > 0 ? 'up' : reading.value < 0 ? 'down' : undefined
  const difference = data.b - data.a

  return (
    <div className="gp-fx gp-fx--percent">
      <FormulaLabel skin="percent_change" value={data.label} onChange={(label) => patch({ label })} />

      <div className="gp-fx-operands">
        <Operand name="a" label="Before" value={data.a} onChange={(a) => patch({ a })} />
        <span className="gp-fx-operator-mark" aria-hidden>→</span>
        <Operand name="b" label="After" value={data.b} onChange={(b) => patch({ b })} />
      </div>

      <Result data={data} skin="percent_change" tone={tone}>
        <p className="gp-fx-caption">
          {difference === 0
            ? 'No movement between the two values'
            : `${difference > 0 ? 'Up' : 'Down'} ${formatFormulaNumber(Math.abs(difference))} in absolute terms`}
        </p>
      </Result>
    </div>
  )
}

function RatioSkin({ data, patch }: SkinProps) {
  const total = data.a + data.b
  const shareA = total === 0 ? 0.5 : Math.min(1, Math.max(0, data.a / total))
  const simplified = simplifiedRatio(data.a, data.b)

  return (
    <div className="gp-fx gp-fx--ratio">
      <FormulaLabel skin="ratio" value={data.label} onChange={(label) => patch({ label })} />

      <div className="gp-fx-operands">
        <Operand name="a" label="Part A" value={data.a} onChange={(a) => patch({ a })} />
        <span className="gp-fx-operator-mark" aria-hidden>:</span>
        <Operand name="b" label="Part B" value={data.b} onChange={(b) => patch({ b })} />
      </div>

      {/* The split itself, drawn to scale — the one thing a pair of numbers
          cannot say on their own. */}
      <div
        className="gp-fx-split gp-flat-visual-own"
        role="img"
        aria-label={`A holds ${Math.round(shareA * 100)} percent of the total`}
      >
        <span className="gp-fx-split-a" style={{ flexGrow: Math.max(0.001, shareA) }} />
        <span className="gp-fx-split-b" style={{ flexGrow: Math.max(0.001, 1 - shareA) }} />
      </div>

      <Result data={data} skin="ratio">
        <p className="gp-fx-caption">
          {simplified
            ? `Simplifies to ${simplified.left} : ${simplified.right}`
            : 'No whole-number ratio for these two'}
        </p>
      </Result>
    </div>
  )
}

function GrowthSkin({ data, patch }: SkinProps) {
  const projection = growthProjection(data.a, data.b, GROWTH_PERIODS)
  // Compound growth over six periods is a narrow band of similar numbers, so
  // bars drawn from zero would all look the same height. These are scaled
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

      <div className="gp-fx-operands">
        <Operand name="a" label="Start" value={data.a} onChange={(a) => patch({ a })} />
        <span className="gp-fx-operator-mark" aria-hidden>↗</span>
        <Operand name="b" label="Rate" suffix="%" value={data.b} onChange={(b) => patch({ b })} />
      </div>

      <Result data={data} skin="growth" />

      {/* Where the same rate keeps going. Read-only foresight: the published
          number is always one period, so chaining two cards means two periods. */}
      <div className="gp-fx-projection">
        <span className="gp-fx-label">If the rate holds</span>
        <ol className="gp-fx-periods">
          {projection.map((value, index) => (
            <li key={index} data-first={index === 0 || undefined}>
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
    </div>
  )
}

function ExpressionSkin({ data, patch, state, setState }: SkinProps) {
  const source = expressionText(state)
  const reading = formulaReading(data)

  const insert = (token: string) => {
    setState({ ...state, expression: `${source}${token}`.slice(0, FORMULA_EXPRESSION_LIMIT) })
  }

  return (
    <div className="gp-fx gp-fx--expression">
      <FormulaLabel skin="expression" value={data.label} onChange={(label) => patch({ label })} />

      <div className="gp-fx-expression gp-bare-field" data-invalid={reading.note ? true : undefined}>
        <input
          value={source}
          aria-label="Expression over A and B"
          placeholder="a * b / 2"
          maxLength={FORMULA_EXPRESSION_LIMIT}
          onChange={(event) => setState({ ...state, expression: event.target.value })}
        />
      </div>

      <div className="gp-fx-tokens" role="group" aria-label="Insert into the expression">
        {['a', 'b', '+', '−', '×', '÷', '(', ')'].map((token) => (
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

      <div className="gp-fx-operands">
        <Operand name="a" label="a" value={data.a} onChange={(a) => patch({ a })} />
        <span className="gp-fx-operator-mark" aria-hidden>·</span>
        <Operand name="b" label="b" value={data.b} onChange={(b) => patch({ b })} />
      </div>

      <Result data={data} skin="expression" />
    </div>
  )
}

function WeightedScoreSkin({ data, patch, state, setState }: SkinProps) {
  const rows = weightedRows(state, data.a, data.b)
  const shares = weightShares(rows)
  const extra = Array.isArray(state.rows) ? state.rows as Record<string, unknown>[] : []

  const writeExtra = (next: Record<string, unknown>[]) => setState({ ...state, rows: next })
  const editExtra = (index: number, patchRow: Record<string, unknown>) => {
    writeExtra(extra.map((row, position) => (position === index ? { ...row, ...patchRow } : row)))
  }

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
          const canonical = row.canonical
          const extraIndex = index - 2
          return (
            <li key={row.id} className="gp-fx-row" data-canonical={canonical || undefined}>
              <span className="gp-fx-row-share" style={{ width: `${shares[index]! * 100}%` }} aria-hidden />
              <div className="gp-fx-row-name gp-bare-field">
                <input
                  value={canonical
                    ? String((row.id === 'a' ? state.labelA : state.labelB) ?? '')
                    : String(extra[extraIndex]?.label ?? '')}
                  aria-label={`Row ${index + 1} name`}
                  placeholder={row.label}
                  onChange={(event) => (canonical
                    ? setState({ ...state, [row.id === 'a' ? 'labelA' : 'labelB']: event.target.value })
                    : editExtra(extraIndex, { label: event.target.value }))}
                />
              </div>
              <label className="gp-fx-row-cell gp-bare-field">
                <input
                  type="number"
                  step="any"
                  aria-label={`Row ${index + 1} value`}
                  value={row.value}
                  onChange={(event) => {
                    const value = Number(event.target.value) || 0
                    if (canonical) return patch(row.id === 'a' ? { a: value } : { b: value })
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
                  onChange={(event) => {
                    const weight = Math.max(0, Number(event.target.value) || 0)
                    if (canonical) {
                      return setState({ ...state, [row.id === 'a' ? 'weightA' : 'weightB']: weight })
                    }
                    editExtra(extraIndex, { weight })
                  }}
                />
              </label>
              {canonical ? (
                <span className="gp-fx-row-tag" title="Wired inputs A and B">{row.id.toUpperCase()}</span>
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

      <button
        type="button"
        className="gp-fx-add"
        disabled={extra.length >= WEIGHTED_EXTRA_LIMIT}
        onClick={() => writeExtra([...extra, { id: crypto.randomUUID(), label: '', value: 0, weight: 1 }])}
      >
        <Plus size={12} aria-hidden />
        Add a row
      </button>

      <Result data={data} skin="weighted_score" />
    </div>
  )
}

function ConditionalSkin({ data, patch, state, setState }: SkinProps) {
  const comparator = comparatorOf(state)
  const branches = conditionalBranches(state)
  const holds = comparisonHolds(data.a, data.b, comparator)

  return (
    <div className="gp-fx gp-fx--conditional">
      <FormulaLabel skin="conditional" value={data.label} onChange={(label) => patch({ label })} />

      <div className="gp-fx-operands">
        <Operand name="a" label="A" value={data.a} onChange={(a) => patch({ a })} />
        <span className="gp-fx-operator-mark" aria-hidden>{COMPARATOR_SYMBOL[comparator]}</span>
        <Operand name="b" label="B" value={data.b} onChange={(b) => patch({ b })} />
      </div>

      <div className="gp-fx-operators" role="group" aria-label="Comparison">
        {COMPARATORS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={comparator === option}
            aria-label={`A ${COMPARATOR_SYMBOL[option]} B`}
            onClick={() => setState({ ...state, comparator: option })}
          >
            {COMPARATOR_SYMBOL[option]}
          </button>
        ))}
      </div>

      {/* Both outcomes stay the same size — the card must not look as though
          it prefers one branch (the symmetry rule). */}
      <div className="gp-fx-branches">
        <label className="gp-fx-branch gp-bare-field" data-live={holds || undefined}>
          <span className="gp-fx-label">Then</span>
          <input
            type="number"
            step="any"
            aria-label="Value when the comparison holds"
            value={branches.whenTrue}
            onChange={(event) => setState({ ...state, whenTrue: Number(event.target.value) || 0 })}
          />
        </label>
        <label className="gp-fx-branch gp-bare-field" data-live={!holds || undefined}>
          <span className="gp-fx-label">Else</span>
          <input
            type="number"
            step="any"
            aria-label="Value when the comparison does not hold"
            value={branches.whenFalse}
            onChange={(event) => setState({ ...state, whenFalse: Number(event.target.value) || 0 })}
          />
        </label>
      </div>

      <Result data={data} skin="conditional">
        <p className="gp-fx-caption">
          {`${formatFormulaNumber(data.a)} ${COMPARATOR_SYMBOL[comparator]} ${formatFormulaNumber(data.b)} is ${holds ? 'true' : 'false'}`}
        </p>
      </Result>
    </div>
  )
}

/* -------------------------------------------------------------------- root */

/**
 * One pair of numbers, seven questions. A and B stay canonical in every skin —
 * a wire writes them, and every skin keeps them on screen and editable — while
 * the skin decides what is asked of them. Whatever it asks, the number the card
 * shows is the number it publishes: `formulaReading` is the only calculation,
 * and the `result` field, the resting tile, and this renderer all read it.
 */
export function FormulaWidget({ data, onChange, skin = 'two_input' }: FormulaWidgetProps) {
  const patch: Patch = (next) => onChange({ ...data, ...next, skin })

  const state = skinStateFor(data, skin)
  const setState = (next: WidgetSkinState) => {
    onChange(dataWithSkinState({ ...data, skin } as ModuleData, skin, next) as FormulaData)
  }

  const props: SkinProps = { data, patch, state, setState }

  if (skin === 'percent_change') return <PercentChangeSkin {...props} />
  if (skin === 'ratio') return <RatioSkin {...props} />
  if (skin === 'growth') return <GrowthSkin {...props} />
  if (skin === 'expression') return <ExpressionSkin {...props} />
  if (skin === 'weighted_score') return <WeightedScoreSkin {...props} />
  if (skin === 'conditional') return <ConditionalSkin {...props} />
  return <TwoInputSkin {...props} />
}
