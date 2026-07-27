import { useEffect, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  HandCoins,
  Landmark,
  PiggyBank,
  Plus,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import type { BudgetData, BudgetItem } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { parseBudgetAmount } from '../../../utils/widgetValueValidation'
import {
  budgetMagnitude,
  budgetShare,
  budgetSkinMode,
  budgetTotal,
  cashflowBalance,
  cashflowState,
  categoryPlanState,
  envelopeState,
  fundProgress,
  projectBudgetState,
  projectStatusTotals,
  ruleState,
  ruleSummary,
  sharedBudgetState,
  sinkingFundsState,
  zeroBasedState,
  type BudgetRuleBucket,
  type BudgetSkinMode,
  type CashflowKind,
  type ProjectCostStatus,
} from './budgetSkinModel'

interface BudgetWidgetProps {
  data: BudgetData
  skin?: BudgetSkinMode
  onChange: (data: BudgetData) => void
}

const SKIN_META = {
  category_plan: { label: 'Category plan', note: 'Plan versus actual', icon: ReceiptText },
  envelope: { label: 'Envelope budget', note: 'Spend within each pocket', icon: WalletCards },
  zero_based: { label: 'Zero-based', note: 'Give every dollar a job', icon: CircleDollarSign },
  '50_30_20': { label: '50 / 30 / 20', note: 'Needs, wants, and savings', icon: ShieldCheck },
  cashflow: { label: 'Monthly cashflow', note: 'See money arrive and leave', icon: CalendarDays },
  sinking_funds: { label: 'Sinking funds', note: 'Build toward future costs', icon: PiggyBank },
  shared_budget: { label: 'Shared budget', note: 'Clear household ownership', icon: Users },
  project_budget: { label: 'Project budget', note: 'Forecast through payment', icon: BriefcaseBusiness },
} as const

const RULE_META: Record<BudgetRuleBucket, { label: string; target: string }> = {
  needs: { label: 'Needs', target: '50%' },
  wants: { label: 'Wants', target: '30%' },
  savings: { label: 'Savings', target: '20%' },
}

const RULE_ORDER: BudgetRuleBucket[] = ['needs', 'wants', 'savings']
const PROJECT_ORDER: ProjectCostStatus[] = ['forecast', 'committed', 'invoiced', 'paid']

function formatMoney(value: number): string {
  return Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function moneyText(currency: string, value: number): string {
  return `${value < 0 ? '−' : ''}${currency}${formatMoney(value)}`
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function safeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `budget-${Date.now()}`
}

function BudgetAmountInput({
  id,
  label,
  value,
  onCommit,
  className = '',
}: {
  id: string
  label: string
  value: number
  onCommit: (value: number) => void
  className?: string
}) {
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    const parsed = parseBudgetAmount(draft)
    if (parsed.error || parsed.value === undefined) {
      setError(parsed.error ?? 'Invalid amount')
      return
    }
    setError(null)
    setDraft(String(parsed.value))
    onCommit(parsed.value)
  }

  return (
    <span className={`gp-budget-number-field gp-bare-field ${className}`} data-invalid={error ? '' : undefined}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
          if (event.key === 'Escape') {
            setDraft(String(value))
            setError(null)
          }
        }}
      />
      {error && <span id={`${id}-error`} role="alert">{error}</span>}
    </span>
  )
}

/** Eight calm financial views over one shared, circuit-readable line-item list. */
export function BudgetWidget({ data, skin: rawSkin, onChange }: BudgetWidgetProps) {
  const skin = budgetSkinMode(rawSkin ?? data.skin)
  const [studioOpen, setStudioOpen] = useState(false)
  const total = budgetTotal(data)
  const magnitude = budgetMagnitude(data)
  const MetaIcon = SKIN_META[skin].icon

  const setItem = (id: string, patch: Partial<BudgetItem>) =>
    onChange({
      ...data,
      items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })

  const removeItem = (id: string) =>
    onChange({ ...data, items: data.items.filter((item) => item.id !== id) })

  const addItem = () =>
    onChange({
      ...data,
      items: [...data.items, { id: safeId(), label: '', amount: 0 }],
    })

  const saveState = (value: BudgetSkinMode, state: object) =>
    onChange(dataWithSkinState(
      data,
      value,
      state as Record<string, unknown>,
    ) as BudgetData)

  return (
    <section
      data-floor-panel="rows"
      data-floor-overflow="scroll"
      data-budget-skin={skin}
      className="gp-budget-skin"
    >
      <header className="gp-budget-heading">
        <span className="gp-budget-mark" aria-hidden="true"><MetaIcon size={14} /></span>
        <span className="gp-budget-title-stack">
          <strong>{SKIN_META[skin].label}</strong>
          <small>{SKIN_META[skin].note}</small>
        </span>
        <span className="gp-budget-total-chip">
          <small>{data.items.length} {data.items.length === 1 ? 'line' : 'lines'}</small>
          <strong>{moneyText(data.currency, total)}</strong>
        </span>
        <button
          type="button"
          className="gp-budget-studio-trigger"
          aria-label="Edit budget lines"
          aria-expanded={studioOpen}
          onClick={() => setStudioOpen((open) => !open)}
        >
          <Settings2 size={14} />
        </button>
      </header>

      <main className="gp-budget-workspace">
        {data.items.length === 0 ? (
          <BudgetEmpty onAdd={addItem} />
        ) : (
          <>
            {skin === 'category_plan' && (
              <CategoryPlan
                data={data}
                state={categoryPlanState(skinStateFor(data, skin), data)}
                onState={(state) => saveState(skin, state)}
              />
            )}
            {skin === 'envelope' && (
              <EnvelopeBudget
                data={data}
                state={envelopeState(skinStateFor(data, skin), data)}
                onState={(state) => saveState(skin, state)}
              />
            )}
            {skin === 'zero_based' && (
              <ZeroBased
                data={data}
                state={zeroBasedState(skinStateFor(data, skin), data)}
                onState={(state) => saveState(skin, state)}
              />
            )}
            {skin === '50_30_20' && (
              <RuleBudget
                data={data}
                state={ruleState(skinStateFor(data, skin), data)}
                onState={(state) => saveState(skin, state)}
              />
            )}
            {skin === 'cashflow' && (
              <Cashflow
                data={data}
                state={cashflowState(skinStateFor(data, skin), data)}
                onState={(state) => saveState(skin, state)}
              />
            )}
            {skin === 'sinking_funds' && (
              <SinkingFunds
                data={data}
                state={sinkingFundsState(skinStateFor(data, skin), data)}
                onState={(state) => saveState(skin, state)}
              />
            )}
            {skin === 'shared_budget' && (
              <SharedBudget
                data={data}
                state={sharedBudgetState(skinStateFor(data, skin), data)}
                onState={(state) => saveState(skin, state)}
              />
            )}
            {skin === 'project_budget' && (
              <ProjectBudget
                data={data}
                state={projectBudgetState(skinStateFor(data, skin), data)}
                onState={(state) => saveState(skin, state)}
              />
            )}
          </>
        )}
      </main>

      <footer className="gp-budget-footer">
        <button type="button" onClick={addItem}><Plus size={11} /> New line</button>
        <span>Allocated <strong>{moneyText(data.currency, magnitude)}</strong></span>
      </footer>

      {studioOpen && (
        <BudgetStudio
          data={data}
          setItem={setItem}
          removeItem={removeItem}
          addItem={addItem}
          onClose={() => setStudioOpen(false)}
        />
      )}
    </section>
  )
}

function BudgetEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="gp-budget-empty">
      <span aria-hidden="true"><HandCoins size={22} /></span>
      <strong>Start with one clear number</strong>
      <p>Add a line, give it a name, then choose the view that suits the plan.</p>
      <button type="button" onClick={onAdd}><Plus size={12} /> Add first line</button>
    </div>
  )
}

type CategoryState = ReturnType<typeof categoryPlanState>

function CategoryPlan({
  data,
  state,
  onState,
}: {
  data: BudgetData
  state: CategoryState
  onState: (state: CategoryState) => void
}) {
  const max = Math.max(...data.items.map((item) => Math.max(Math.abs(item.amount), state.actual[item.id] ?? 0)), 1)
  const actualTotal = data.items.reduce((sum, item) => sum + (state.actual[item.id] ?? 0), 0)
  const variance = budgetMagnitude(data) - actualTotal

  return (
    <div className="gp-budget-plan">
      <div className="gp-budget-hero-well" data-tone={variance < 0 ? 'negative' : 'positive'}>
        <span>
          <small>Plan remaining</small>
          <strong>{moneyText(data.currency, variance)}</strong>
        </span>
        <span>
          <small>Actual</small>
          <b>{moneyText(data.currency, actualTotal)}</b>
        </span>
      </div>
      <div className="gp-budget-plan-list gp-budget-scroll">
        {data.items.map((item) => {
          const actual = state.actual[item.id] ?? 0
          const over = actual > Math.abs(item.amount)
          return (
            <article key={item.id} data-over={over || undefined}>
              <header>
                <strong title={item.label}>{item.label || 'Untitled line'}</strong>
                <span>{moneyText(data.currency, item.amount)}</span>
              </header>
              <div className="gp-budget-double-track" aria-hidden="true">
                <i style={{ width: `${Math.abs(item.amount) / max * 100}%` }} />
                <b style={{ width: `${actual / max * 100}%` }} />
              </div>
              <label className="gp-budget-inline-edit">
                <span>{over ? 'Over by' : 'Spent'}</span>
                <BudgetAmountInput
                  id={`budget-actual-${item.id}`}
                  label={`Actual spend for ${item.label || 'line item'}`}
                  value={actual}
                  onCommit={(value) => onState({
                    ...state,
                    actual: { ...state.actual, [item.id]: value },
                  })}
                />
              </label>
            </article>
          )
        })}
      </div>
    </div>
  )
}

type EnvelopeState = ReturnType<typeof envelopeState>

function EnvelopeBudget({
  data,
  state,
  onState,
}: {
  data: BudgetData
  state: EnvelopeState
  onState: (state: EnvelopeState) => void
}) {
  return (
    <div className="gp-budget-envelope-grid gp-budget-scroll">
      {data.items.map((item, index) => {
        const allocated = Math.abs(item.amount)
        const spent = state.spent[item.id] ?? 0
        const remaining = allocated - spent
        const fill = allocated > 0 ? Math.min(1, spent / allocated) : 0
        return (
          <article key={item.id} style={{ '--gp-envelope-index': index } as React.CSSProperties} data-over={remaining < 0 || undefined}>
            <span className="gp-budget-envelope-flap" aria-hidden="true" />
            <header>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <small>{percent(budgetShare(item.amount, data))} of plan</small>
            </header>
            <strong title={item.label}>{item.label || 'Untitled envelope'}</strong>
            <div className="gp-budget-envelope-reading">
              <small>{remaining < 0 ? 'Over budget' : 'Available'}</small>
              <b>{moneyText(data.currency, remaining)}</b>
            </div>
            <div className="gp-budget-envelope-fill" aria-hidden="true"><i style={{ width: `${fill * 100}%` }} /></div>
            <label className="gp-budget-inline-edit">
              <span>Spent</span>
              <BudgetAmountInput
                id={`budget-spent-${item.id}`}
                label={`Spent from ${item.label || 'envelope'}`}
                value={spent}
                onCommit={(value) => onState({
                  ...state,
                  spent: { ...state.spent, [item.id]: value },
                })}
              />
            </label>
          </article>
        )
      })}
    </div>
  )
}

type ZeroState = ReturnType<typeof zeroBasedState>

function ZeroBased({
  data,
  state,
  onState,
}: {
  data: BudgetData
  state: ZeroState
  onState: (state: ZeroState) => void
}) {
  const assigned = budgetMagnitude(data)
  const remaining = state.income - assigned
  const balanced = Math.abs(remaining) < 0.005
  const progress = state.income > 0 ? Math.min(1, assigned / state.income) : 0

  return (
    <div className="gp-budget-zero">
      <div className="gp-budget-zero-orbit" data-balanced={balanced || undefined}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="43" />
          <circle cx="50" cy="50" r="43" pathLength="1" style={{ strokeDasharray: `${progress} 1` }} />
        </svg>
        <span>
          <small>{balanced ? 'Every dollar assigned' : remaining > 0 ? 'Left to assign' : 'Over-assigned'}</small>
          <strong>{moneyText(data.currency, remaining)}</strong>
          <b>{percent(progress)} assigned</b>
        </span>
      </div>
      <div className="gp-budget-zero-ledger">
        <label className="gp-budget-income-field">
          <span><Landmark size={12} /> Monthly income</span>
          <span>{data.currency}</span>
          <BudgetAmountInput
            id="budget-zero-income"
            label="Monthly income"
            value={state.income}
            onCommit={(income) => onState({ income })}
          />
        </label>
        <div className="gp-budget-mini-list gp-budget-scroll">
          {data.items.map((item) => (
            <div key={item.id}>
              <span title={item.label}>{item.label || 'Untitled assignment'}</span>
              <strong>{moneyText(data.currency, Math.abs(item.amount))}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type RuleBudgetState = ReturnType<typeof ruleState>

function RuleBudget({
  data,
  state,
  onState,
}: {
  data: BudgetData
  state: RuleBudgetState
  onState: (state: RuleBudgetState) => void
}) {
  const summary = ruleSummary(data, state)
  const setBucket = (id: string, bucket: BudgetRuleBucket) =>
    onState({ buckets: { ...state.buckets, [id]: bucket } })

  return (
    <div className="gp-budget-rule">
      <div className="gp-budget-rule-bars">
        {RULE_ORDER.map((bucket) => {
          const reading = summary[bucket]
          return (
            <article key={bucket} data-bucket={bucket}>
              <header><strong>{RULE_META[bucket].label}</strong><span>{RULE_META[bucket].target}</span></header>
              <b>{moneyText(data.currency, reading.amount)}</b>
              <div aria-hidden="true"><i style={{ width: `${Math.min(1, reading.share / reading.target) * 100}%` }} /></div>
              <small>{percent(reading.share)} actual · {reading.share > reading.target ? 'above' : 'within'} guide</small>
            </article>
          )
        })}
      </div>
      <div className="gp-budget-rule-lines gp-budget-scroll">
        {data.items.map((item) => {
          const bucket = state.buckets[item.id] ?? 'needs'
          return (
            <div key={item.id}>
              <button
                type="button"
                data-bucket={bucket}
                title="Move to the next group"
                onClick={() => setBucket(item.id, RULE_ORDER[(RULE_ORDER.indexOf(bucket) + 1) % RULE_ORDER.length]!)}
              >
                {RULE_META[bucket].label}
              </button>
              <span title={item.label}>{item.label || 'Untitled line'}</span>
              <strong>{moneyText(data.currency, item.amount)}</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type CashState = ReturnType<typeof cashflowState>

function Cashflow({
  data,
  state,
  onState,
}: {
  data: BudgetData
  state: CashState
  onState: (state: CashState) => void
}) {
  const balance = cashflowBalance(data, state)
  const ordered = [...data.items].sort((a, b) => (state.dates[a.id] || '9999').localeCompare(state.dates[b.id] || '9999'))
  const setKind = (id: string, kind: CashflowKind) =>
    onState({ ...state, kinds: { ...state.kinds, [id]: kind } })

  return (
    <div className="gp-budget-cashflow">
      <div className="gp-budget-hero-well" data-tone={balance < 0 ? 'negative' : 'positive'}>
        <span>
          <small>Net cashflow</small>
          <strong>{moneyText(data.currency, balance)}</strong>
        </span>
        <span className="gp-budget-cashflow-legend">
          <small><i data-kind="income" /> Money in</small>
          <small><i data-kind="expense" /> Money out</small>
        </span>
      </div>
      <div className="gp-budget-cashflow-list gp-budget-scroll">
        {ordered.map((item, index) => {
          const kind = state.kinds[item.id] ?? 'expense'
          const Icon = kind === 'income' ? ArrowDownLeft : ArrowUpRight
          return (
            <article key={item.id} data-kind={kind}>
              <span className="gp-budget-cashflow-line" aria-hidden="true"><i /></span>
              <button
                type="button"
                aria-label={`${item.label || 'Line item'} is ${kind}; click to change`}
                onClick={() => setKind(item.id, kind === 'income' ? 'expense' : 'income')}
              >
                <Icon size={12} />
              </button>
              <label className="gp-bare-field">
                <span>Date</span>
                <input
                  type="date"
                  value={state.dates[item.id] ?? ''}
                  aria-label={`Date for ${item.label || 'line item'}`}
                  onChange={(event) => onState({
                    ...state,
                    dates: { ...state.dates, [item.id]: event.target.value },
                  })}
                />
              </label>
              <span className="gp-budget-cashflow-name" title={item.label}>
                <small>{kind === 'income' ? 'Income' : 'Expense'} {String(index + 1).padStart(2, '0')}</small>
                <strong>{item.label || 'Untitled line'}</strong>
              </span>
              <b>{kind === 'income' ? '+' : '−'}{data.currency}{formatMoney(item.amount)}</b>
            </article>
          )
        })}
      </div>
    </div>
  )
}

type FundsState = ReturnType<typeof sinkingFundsState>

function SinkingFunds({
  data,
  state,
  onState,
}: {
  data: BudgetData
  state: FundsState
  onState: (state: FundsState) => void
}) {
  return (
    <div className="gp-budget-funds gp-budget-scroll">
      {data.items.map((item) => {
        const target = Math.abs(item.amount)
        const saved = state.saved[item.id] ?? 0
        const progress = fundProgress(target, saved)
        return (
          <article key={item.id}>
            <div className="gp-budget-fund-ring" style={{ '--gp-fund-progress': progress } as React.CSSProperties}>
              <span><strong>{percent(progress)}</strong><small>funded</small></span>
            </div>
            <span className="gp-budget-fund-copy">
              <strong title={item.label}>{item.label || 'Untitled goal'}</strong>
              <small>{moneyText(data.currency, saved)} of {moneyText(data.currency, target)}</small>
              <i><b style={{ width: `${progress * 100}%` }} /></i>
            </span>
            <label className="gp-bare-field">
              <span>Target date</span>
              <input
                type="date"
                value={state.due[item.id] ?? ''}
                aria-label={`Target date for ${item.label || 'fund'}`}
                onChange={(event) => onState({
                  ...state,
                  due: { ...state.due, [item.id]: event.target.value },
                })}
              />
            </label>
            <label className="gp-budget-inline-edit">
              <span>Saved</span>
              <BudgetAmountInput
                id={`budget-saved-${item.id}`}
                label={`Saved for ${item.label || 'fund'}`}
                value={saved}
                onCommit={(value) => onState({
                  ...state,
                  saved: { ...state.saved, [item.id]: value },
                })}
              />
            </label>
          </article>
        )
      })}
    </div>
  )
}

type SharedState = ReturnType<typeof sharedBudgetState>

function SharedBudget({
  data,
  state,
  onState,
}: {
  data: BudgetData
  state: SharedState
  onState: (state: SharedState) => void
}) {
  const owners = new Set(Object.values(state.payers).filter(Boolean)).size
  return (
    <div className="gp-budget-shared">
      <div className="gp-budget-shared-banner">
        <span className="gp-budget-avatar-stack" aria-hidden="true"><i>Y</i><i>+</i></span>
        <label className="gp-bare-field">
          <span>Budget name</span>
          <input
            value={state.household}
            aria-label="Shared budget name"
            onChange={(event) => onState({ ...state, household: event.target.value.slice(0, 80) })}
          />
        </label>
        <span><strong>{owners || 1}</strong><small>{owners === 1 ? 'contributor' : 'contributors'}</small></span>
      </div>
      <div className="gp-budget-shared-list gp-budget-scroll">
        {data.items.map((item, index) => (
          <article key={item.id}>
            <span className="gp-budget-owner-badge" aria-hidden="true">{(state.payers[item.id] || 'S').trim().charAt(0).toUpperCase()}</span>
            <span>
              <strong title={item.label}>{item.label || 'Untitled line'}</strong>
              <small>{String(index + 1).padStart(2, '0')} · {percent(budgetShare(item.amount, data))} of shared plan</small>
            </span>
            <label className="gp-bare-field">
              <span>Paid by</span>
              <input
                value={state.payers[item.id] ?? ''}
                aria-label={`Paid by for ${item.label || 'line item'}`}
                onChange={(event) => onState({
                  ...state,
                  payers: { ...state.payers, [item.id]: event.target.value.slice(0, 80) },
                })}
              />
            </label>
            <b>{moneyText(data.currency, item.amount)}</b>
          </article>
        ))}
      </div>
    </div>
  )
}

type ProjectState = ReturnType<typeof projectBudgetState>

function ProjectBudget({
  data,
  state,
  onState,
}: {
  data: BudgetData
  state: ProjectState
  onState: (state: ProjectState) => void
}) {
  const totals = projectStatusTotals(data, state)
  const setStatus = (id: string, status: ProjectCostStatus) =>
    onState({ ...state, statuses: { ...state.statuses, [id]: status } })

  return (
    <div className="gp-budget-project">
      <div className="gp-budget-project-strip">
        <label className="gp-bare-field">
          <span>Project</span>
          <input
            value={state.project}
            aria-label="Project name"
            onChange={(event) => onState({ ...state, project: event.target.value.slice(0, 80) })}
          />
        </label>
        {PROJECT_ORDER.map((status) => (
          <span key={status} data-status={status}>
            <small>{status}</small>
            <strong>{moneyText(data.currency, totals[status])}</strong>
          </span>
        ))}
      </div>
      <div className="gp-budget-project-list gp-budget-scroll">
        {data.items.map((item) => {
          const status = state.statuses[item.id] ?? 'forecast'
          return (
            <article key={item.id} data-status={status}>
              <span className="gp-budget-project-dot" aria-hidden="true" />
              <span>
                <strong title={item.label}>{item.label || 'Untitled cost'}</strong>
                <small>{percent(budgetShare(item.amount, data))} of project budget</small>
              </span>
              <label className="gp-bare-field">
                <span>Status</span>
                <select
                  value={status}
                  aria-label={`Status for ${item.label || 'project cost'}`}
                  onChange={(event) => setStatus(item.id, event.target.value as ProjectCostStatus)}
                >
                  {PROJECT_ORDER.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <b>{moneyText(data.currency, item.amount)}</b>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function BudgetStudio({
  data,
  setItem,
  removeItem,
  addItem,
  onClose,
}: {
  data: BudgetData
  setItem: (id: string, patch: Partial<BudgetItem>) => void
  removeItem: (id: string) => void
  addItem: () => void
  onClose: () => void
}) {
  return (
    <aside className="gp-budget-studio" aria-label="Budget line editor">
      <header>
        <span><strong>Budget studio</strong><small>Edit the shared numbers behind every view</small></span>
        <button type="button" aria-label="Close budget editor" onClick={onClose}><X size={14} /></button>
      </header>
      <div className="gp-budget-studio-list gp-budget-scroll">
        {data.items.map((item, index) => (
          <article key={item.id}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <label className="gp-bare-field">
              <span>Line name</span>
              <input
                value={item.label}
                placeholder="Line item…"
                aria-label={`Name for budget line ${index + 1}`}
                onChange={(event) => setItem(item.id, { label: event.target.value })}
              />
            </label>
            <label className="gp-bare-field">
              <span>Amount · {data.currency}</span>
              <BudgetAmountInput
                id={`budget-studio-${item.id}`}
                label={`Amount for ${item.label || `line ${index + 1}`}`}
                value={item.amount}
                onCommit={(amount) => setItem(item.id, { amount })}
              />
            </label>
            <button type="button" aria-label={`Remove ${item.label || `line ${index + 1}`}`} onClick={() => removeItem(item.id)}>
              <X size={13} />
            </button>
          </article>
        ))}
      </div>
      <button type="button" className="gp-budget-studio-add" onClick={addItem}><Plus size={12} /> Add budget line</button>
    </aside>
  )
}
