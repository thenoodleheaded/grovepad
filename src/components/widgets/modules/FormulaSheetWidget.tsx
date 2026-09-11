import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FlaskConical,
  LayoutGrid,
  Minus,
  Plus,
  Rows3,
  Ruler,
  Search,
  Sigma,
  Workflow,
  X,
} from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import type {
  FormulaItem,
  FormulaSheetData,
  FormulaSheetSkin,
} from '../../../types/widgetDataEducation'
import {
  dataWithFormulaDerivationSteps,
  dataWithFormulaExampleOpen,
  dataWithFormulaExampleValue,
  dataWithFormulaUnit,
  dataWithoutFormula,
  formulaDerivationSteps,
  formulaExampleOpenId,
  formulaExampleResult,
  formulaExampleValues,
  formulaIsWritten,
  formulaSheetItems,
  formulaSheetSkin,
  formulaSides,
  formulaSubject,
  formulaSymbols,
  formulaUnitVerdict,
  formulaUnits,
} from './formulaSheetSkinModel'

interface FormulaSheetWidgetProps {
  data: FormulaSheetData
  onChange: (data: FormulaSheetData) => void
  skin?: FormulaSheetSkin
}

/**
 * Six ways to hold the same shelf of named formulas.
 *
 * The list never changes shape between skins — a formula written on the Exam
 * Strip is the same formula the Derivation ladder ends on. What changes is the
 * question being asked of it: *where is it* (Reference Sheet), *what does it
 * say* (Equation Cards), *how many fit* (Exam Strip), *where did it come from*
 * (Derivation), *is it consistent* (Unit-aware), *what is the answer*
 * (Worked Example).
 *
 * Every reading comes from `formulaSheetSkinModel`, so the folded tile and the
 * open card can never tell a reader different things.
 */

const SKIN_META = {
  reference_sheet: { label: 'Reference sheet', hint: 'Look it up fast', icon: Rows3 },
  equation_cards: { label: 'Equation cards', hint: 'One equation at a time', icon: LayoutGrid },
  exam_strip: { label: 'Exam strip', hint: 'Everything on one page', icon: Sigma },
  derivation: { label: 'Derivation', hint: 'How the result was reached', icon: Workflow },
  unit_aware: { label: 'Unit check', hint: 'Both sides must agree', icon: Ruler },
  worked_example: { label: 'Worked example', hint: 'Numbers in, answer out', icon: FlaskConical },
} satisfies Record<FormulaSheetSkin, { label: string; hint: string; icon: typeof Rows3 }>

const PLACEHOLDER = 'a² + b² = c²'

export function FormulaSheetWidget({
  data,
  onChange,
  skin: requestedSkin,
}: FormulaSheetWidgetProps) {
  const formulas = useMemo(() => formulaSheetItems(data.formulas), [data.formulas])
  const skin = requestedSkin ?? formulaSheetSkin(data.skin)
  /** Renderer-ready skins keep their controls here — never in saved data. */
  const [query, setQuery] = useState('')
  const [draftStep, setDraftStep] = useState<{ id: string; text: string } | null>(null)

  const meta = SKIN_META[skin]
  const SkinIcon = meta.icon
  const written = formulas.filter(formulaIsWritten).length

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle || skin !== 'reference_sheet') return formulas
    return formulas.filter((formula) => (
      formula.name.toLowerCase().includes(needle)
      || formula.expression.toLowerCase().includes(needle)
    ))
  }, [formulas, query, skin])

  const baseData = (next = formulas): FormulaSheetData => ({ ...data, formulas: next, skin })

  const setFormula = (id: string, patch: Partial<FormulaItem>) => {
    onChange(baseData(formulas.map((formula) => (
      formula.id === id ? { ...formula, ...patch } : formula
    ))))
  }

  const addFormula = () => {
    onChange(baseData([
      ...formulas,
      { id: crypto.randomUUID(), name: '', expression: '' },
    ]))
  }

  const removeFormula = (id: string) => {
    onChange(dataWithoutFormula(baseData(), id))
  }

  function emptyState(message?: string) {
    if (message) return <p className="gp-fsheet-empty-note">{message}</p>
    return (
      <button type="button" onClick={addFormula} className="gp-fsheet-empty">
        <Plus size={14} aria-hidden />
        Add your first formula
      </button>
    )
  }

  const nameField = (formula: FormulaItem, placeholder = 'Name this formula…') => (
    <input
      value={formula.name}
      placeholder={placeholder}
      aria-label="Formula name"
      onChange={(event) => setFormula(formula.id, { name: event.target.value })}
      className="gp-fsheet-name"
    />
  )

  const expressionField = (formula: FormulaItem) => (
    <input
      value={formula.expression}
      placeholder={PLACEHOLDER}
      aria-label={`Expression for ${formula.name || 'this formula'}`}
      spellCheck={false}
      onChange={(event) => setFormula(formula.id, { expression: event.target.value })}
      className="gp-fsheet-expression"
    />
  )

  const removeButton = (formula: FormulaItem) => (
    <button
      type="button"
      aria-label={`Remove ${formula.name || 'formula'}`}
      onClick={() => removeFormula(formula.id)}
      className="gp-fsheet-remove"
    >
      <X size={11} aria-hidden />
    </button>
  )

  /* ── Reference sheet ─────────────────────────────────────────────────── */

  const referenceRows = () => (
    <div data-island="formula-sheet" data-floor-min-h="96" className="gp-fsheet-ledger">
      {visible.length === 0
        ? emptyState(query.trim() ? 'Nothing matches that' : undefined)
        : visible.map((formula) => (
          <div key={formula.id} className="gp-fsheet-ledger-row gp-bare-field">
            <span className="gp-fsheet-ledger-name">{nameField(formula)}</span>
            <span className="gp-fsheet-ledger-expression">{expressionField(formula)}</span>
            {removeButton(formula)}
          </div>
        ))}
    </div>
  )

  /* ── Equation cards ──────────────────────────────────────────────────── */

  const equationCards = () => (
    <div data-island="formula-sheet" data-floor-min-h="96" className="gp-fsheet-deck">
      {formulas.length === 0 ? emptyState() : formulas.map((formula) => {
        const subject = formulaSubject(formula.expression)
        const symbols = formulaSymbols(formula.expression)
        return (
          <article key={formula.id} className="gp-fsheet-card gp-bare-field">
            <header className="gp-fsheet-card-head">
              {nameField(formula, 'Untitled')}
              {removeButton(formula)}
            </header>
            <div className="gp-fsheet-card-stage">
              {expressionField(formula)}
            </div>
            <footer className="gp-fsheet-card-foot">
              {subject && (
                <span className="gp-fsheet-solves">
                  solves for <b>{subject}</b>
                </span>
              )}
              {symbols.length > 0 && (
                <span className="gp-fsheet-symbols" aria-label={`Uses ${symbols.join(', ')}`}>
                  {symbols.map((symbol) => (
                    <span key={symbol} className="gp-fsheet-symbol">{symbol}</span>
                  ))}
                </span>
              )}
            </footer>
          </article>
        )
      })}
    </div>
  )

  /* ── Exam strip ──────────────────────────────────────────────────────── */

  const examStrip = () => (
    <div data-island="formula-sheet" data-floor-min-h="96" className="gp-fsheet-strip">
      {formulas.length === 0 ? emptyState() : (
        <ol className="gp-fsheet-strip-list">
          {formulas.map((formula, index) => (
            <li key={formula.id} className="gp-fsheet-strip-item gp-bare-field">
              <span className="gp-fsheet-strip-index" aria-hidden>{index + 1}</span>
              <span className="gp-fsheet-strip-body">
                {nameField(formula, 'Title')}
                {expressionField(formula)}
              </span>
              {removeButton(formula)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )

  /* ── Derivation ──────────────────────────────────────────────────────── */

  const commitStep = (formula: FormulaItem) => {
    const text = draftStep?.id === formula.id ? draftStep.text.trim() : ''
    if (!text) return
    const steps = formulaDerivationSteps(data, formula.id)
    onChange(dataWithFormulaDerivationSteps(baseData(), formula.id, [...steps, text]))
    setDraftStep({ id: formula.id, text: '' })
  }

  const setStep = (formula: FormulaItem, at: number, text: string) => {
    const steps = [...formulaDerivationSteps(data, formula.id)]
    steps[at] = text
    onChange(dataWithFormulaDerivationSteps(baseData(), formula.id, steps))
  }

  const removeStep = (formula: FormulaItem, at: number) => {
    const steps = formulaDerivationSteps(data, formula.id).filter((_, index) => index !== at)
    onChange(dataWithFormulaDerivationSteps(baseData(), formula.id, steps))
  }

  const derivationLadder = () => (
    <div data-island="formula-sheet" data-floor-min-h="96" className="gp-fsheet-derivations">
      {formulas.length === 0 ? emptyState() : formulas.map((formula) => {
        const steps = formulaDerivationSteps(data, formula.id)
        const draft = draftStep?.id === formula.id ? draftStep.text : ''
        return (
          <section key={formula.id} className="gp-fsheet-derivation gp-bare-field">
            <header className="gp-fsheet-derivation-head">
              {nameField(formula, 'What is being derived?')}
              {removeButton(formula)}
            </header>

            <ol className="gp-fsheet-rail">
              {steps.map((step, index) => (
                <li key={`${formula.id}-step-${index}`} className="gp-fsheet-rail-step">
                  <span className="gp-fsheet-rail-mark" aria-hidden>{index + 1}</span>
                  <input
                    value={step}
                    aria-label={`Step ${index + 1}`}
                    spellCheck={false}
                    onChange={(event) => setStep(formula, index, event.target.value)}
                    className="gp-fsheet-expression"
                  />
                  <button
                    type="button"
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() => removeStep(formula, index)}
                    className="gp-fsheet-remove"
                  >
                    <Minus size={10} aria-hidden />
                  </button>
                </li>
              ))}
              <li className="gp-fsheet-rail-draft">
                <span className="gp-fsheet-rail-mark is-draft" aria-hidden>
                  <CornerDownRight size={10} />
                </span>
                <input
                  value={draft}
                  placeholder={steps.length === 0 ? 'First line of the working…' : 'Next line…'}
                  aria-label={`Add a step to ${formula.name || 'this derivation'}`}
                  spellCheck={false}
                  onChange={(event) => setDraftStep({ id: formula.id, text: event.target.value })}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    commitStep(formula)
                  }}
                  className="gp-fsheet-expression"
                />
              </li>
            </ol>

            <div className="gp-fsheet-result">
              <span className="gp-fsheet-result-tag">Result</span>
              {expressionField(formula)}
            </div>
          </section>
        )
      })}
    </div>
  )

  /* ── Unit check ──────────────────────────────────────────────────────── */

  const unitPanels = () => (
    <div data-island="formula-sheet" data-floor-min-h="96" className="gp-fsheet-units">
      {formulas.length === 0 ? emptyState() : formulas.map((formula) => {
        const units = formulaUnits(data, formula.id)
        const symbols = formulaSymbols(formula.expression)
        const verdict = formulaUnitVerdict(formula.expression, units)
        const sides = formulaSides(formula.expression)
        return (
          <section
            key={formula.id}
            className="gp-fsheet-unit gp-bare-field"
            data-verdict={verdict.state}
          >
            <header className="gp-fsheet-unit-head">
              {nameField(formula, 'Untitled')}
              {removeButton(formula)}
            </header>
            {expressionField(formula)}

            {symbols.length > 0 && (
              <div className="gp-fsheet-unit-grid">
                {symbols.map((symbol) => (
                  <label key={symbol} className="gp-fsheet-unit-cell">
                    <span className="gp-fsheet-unit-symbol">{symbol}</span>
                    <input
                      value={units[symbol] ?? ''}
                      placeholder="unit"
                      aria-label={`Unit for ${symbol}`}
                      spellCheck={false}
                      onChange={(event) => onChange(dataWithFormulaUnit(
                        baseData(),
                        formula.id,
                        symbol,
                        event.target.value,
                      ))}
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="gp-fsheet-balance" role="status">
              <span className="gp-fsheet-balance-side">
                <small>{sides.left || 'left'}</small>
                <b>{verdict.left || '—'}</b>
              </span>
              <span className="gp-fsheet-balance-pivot" aria-hidden>
                {verdict.state === 'balanced' ? <Check size={12} />
                  : verdict.state === 'mismatch' ? <AlertTriangle size={12} />
                    : <Minus size={12} />}
              </span>
              <span className="gp-fsheet-balance-side">
                <small>{sides.right ? 'right' : '—'}</small>
                <b>{verdict.right || '—'}</b>
              </span>
            </div>
            <p className="gp-fsheet-verdict-note">{verdict.note}</p>
          </section>
        )
      })}
    </div>
  )

  /* ── Worked example ──────────────────────────────────────────────────── */

  const workedExamples = () => {
    const openId = formulaExampleOpenId(data)
    return (
      <div data-island="formula-sheet" data-floor-min-h="96" className="gp-fsheet-examples">
        {formulas.length === 0 ? emptyState() : formulas.map((formula) => {
          const open = openId === formula.id
          const values = formulaExampleValues(data, formula.id)
          const symbols = formulaSymbols(formulaSides(formula.expression).right || formula.expression)
          const result = formulaExampleResult(formula.expression, values)
          return (
            <section key={formula.id} className="gp-fsheet-example gp-bare-field" data-open={open}>
              <header className="gp-fsheet-example-head">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={`${open ? 'Hide' : 'Show'} the example for ${formula.name || 'this formula'}`}
                  onClick={() => onChange(dataWithFormulaExampleOpen(baseData(), open ? '' : formula.id))}
                  className="gp-fsheet-example-toggle"
                >
                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <span className="gp-fsheet-example-copy">
                  {nameField(formula, 'Untitled')}
                  {expressionField(formula)}
                </span>
                {result.state === 'solved' && !open && (
                  <span className="gp-fsheet-example-peek" aria-hidden>{result.text}</span>
                )}
                {removeButton(formula)}
              </header>

              {open && (
                <div className="gp-fsheet-example-body">
                  {symbols.length > 0 && (
                    <div className="gp-fsheet-unit-grid">
                      {symbols.map((symbol) => (
                        <label key={symbol} className="gp-fsheet-unit-cell">
                          <span className="gp-fsheet-unit-symbol">{symbol}</span>
                          <input
                            value={values[symbol] ?? ''}
                            placeholder="0"
                            inputMode="decimal"
                            aria-label={`Value for ${symbol}`}
                            onChange={(event) => onChange(dataWithFormulaExampleValue(
                              baseData(),
                              formula.id,
                              symbol,
                              event.target.value,
                            ))}
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  {result.substituted && (
                    <p className="gp-fsheet-working" aria-label="Working">
                      {result.substituted}
                    </p>
                  )}

                  <div className="gp-fsheet-answer" data-state={result.state} role="status">
                    {result.state === 'solved' ? (
                      <>
                        <span className="gp-fsheet-answer-tag">{result.note}</span>
                        <strong>{result.text}</strong>
                      </>
                    ) : (
                      <span className="gp-fsheet-answer-note">{result.note}</span>
                    )}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    )
  }

  /* ── Assembly ────────────────────────────────────────────────────────── */

  const body = () => {
    if (skin === 'equation_cards') return equationCards()
    if (skin === 'exam_strip') return examStrip()
    if (skin === 'derivation') return derivationLadder()
    if (skin === 'unit_aware') return unitPanels()
    if (skin === 'worked_example') return workedExamples()
    return referenceRows()
  }

  return (
    <div className={`gp-fsheet-skin gp-fsheet-${skin}`} data-formula-skin={skin}>
      <header className="gp-fsheet-heading">
        <span className="gp-fsheet-heading-copy">
          <span className="gp-fsheet-heading-icon"><SkinIcon size={13} aria-hidden /></span>
          <span>
            <strong>{meta.label}</strong>
            <small>{meta.hint}</small>
          </span>
        </span>

        {skin === 'reference_sheet' && formulas.length > 2 ? (
          <label className="gp-fsheet-filter gp-bare-field">
            <Search size={11} aria-hidden />
            <input
              value={query}
              placeholder="Filter"
              aria-label="Filter formulas"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : (
          <span className="gp-fsheet-tally">{written || '—'}</span>
        )}
      </header>

      {body()}

      <footer className="gp-fsheet-footer">
        <button type="button" onClick={addFormula} className="gp-fsheet-add">
          <Plus size={11} aria-hidden />
          Add formula
        </button>
        <span>
          {skin === 'derivation' ? 'Enter adds a step'
            : skin === 'unit_aware' ? 'Name a unit for each symbol'
              : skin === 'worked_example' ? 'Open one to work it out'
                : 'Name it, then write it'}
        </span>
      </footer>
    </div>
  )
}
