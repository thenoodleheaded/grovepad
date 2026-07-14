import { useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Minus,
  Plus,
  X,
} from 'lucide-react'
import type {
  BranchGateData,
  DailyAgendaData,
  DatePickerData,
  DecisionMatrixData,
  FormField,
  FormFieldType,
  FormWidgetData,
  FormulaData,
  FormulaOperator,
  InventoryData,
  LineChartData,
  LogbookData,
  NumberInputData,
  OutlineData,
  PieChartData,
  ProcessData,
  ProcessStepStatus,
  RiskLevel,
  RiskRegisterData,
  StatusData,
  SwotData,
  TextInputData,
  TimesheetData,
  ToggleData,
  UnitConverterCategory,
  UnitConverterData,
  WorkflowStatus,
} from '../../../types/spatial'
import { GRID_SIZE } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { useTransientValue } from '../../../hooks/useTransientValue'
import { WidgetPanel } from '../WidgetPanel'

const inputClass =
  'gp-input w-full min-w-0 px-2 text-neutral-200 outline-none placeholder:text-neutral-700'
const numericClass =
  'bg-transparent font-mono tabular-nums text-neutral-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
const panelClass = 'gp-island'

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value)))
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function SmallAction({
  label,
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-25 ${
        danger
          ? 'text-neutral-700 hover:bg-red-500/10 hover:text-red-400'
          : 'text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300'
      }`}
    >
      {children}
    </button>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-medium text-neutral-600 transition-colors hover:bg-neutral-800/70 hover:text-neutral-300"
    >
      <Plus size={10} aria-hidden />
      {label}
    </button>
  )
}

function Stat({
  label,
  value,
  accent = 'text-neutral-300',
  anchor,
}: {
  label: string
  value: string | number
  accent?: string
  anchor?: ReturnType<typeof useFieldAnchor<HTMLDivElement>>
}) {
  return (
    <div ref={anchor} className="gp-well min-w-0 px-2 py-2">
      <p className="gp-label truncate">{label}</p>
      <p className={`gp-value truncate ${accent}`}>{value}</p>
    </div>
  )
}

function ProgressBar({ value, color = '#34d399' }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800/80">
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${clamp(value, 0, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inputs and branch logic
// ---------------------------------------------------------------------------

export function TextInputWidget({
  data,
  onChange,
}: {
  data: TextInputData
  onChange: (data: TextInputData) => void
}) {
  const valueRef = useFieldAnchor<HTMLDivElement>('value')
  const hasValueRef = useFieldAnchor<HTMLSpanElement>('has_value')
  const control = data.multiline ? (
    <textarea
      value={data.value}
      placeholder={data.placeholder}
      rows={3}
      onChange={(event) => onChange({ ...data, value: event.target.value })}
      className={`${inputClass} flex-1 resize-none leading-relaxed`}
    />
  ) : (
    <input
      value={data.value}
      placeholder={data.placeholder}
      onChange={(event) => onChange({ ...data, value: event.target.value })}
      className={`${inputClass} text-[15px] font-medium`}
    />
  )

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          value={data.label}
          placeholder="Label"
          onChange={(event) => onChange({ ...data, label: event.target.value })}
          className="gp-input--bare min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 outline-none"
        />
        <button
          type="button"
          onClick={() => onChange({ ...data, multiline: !data.multiline })}
          className="rounded-md border gp-hairline px-1.5 py-0.5 font-mono text-[8px] uppercase text-neutral-600 hover:text-neutral-300"
        >
          {data.multiline ? 'Wrap' : 'Single'}
        </button>
        <span
          ref={hasValueRef}
          title={data.value.trim() ? 'Has a value' : 'Empty'}
          className={`h-1.5 w-1.5 rounded-full ${data.value.trim() ? 'bg-emerald-400' : 'bg-neutral-700'}`}
        />
      </div>
      <div ref={valueRef} data-island="value" data-island-size="free" className={`${panelClass} flex min-h-0 flex-1 px-3 py-2`}>
        {control}
      </div>
    </div>
  )
}

export function NumberInputWidget({
  data,
  onChange,
}: {
  data: NumberInputData
  onChange: (data: NumberInputData) => void
}) {
  const valueRef = useFieldAnchor<HTMLDivElement>('value')
  const low = Math.min(finite(data.min), finite(data.max, 100))
  const high = Math.max(finite(data.min), finite(data.max, 100))
  const step = Math.max(0.0001, Math.abs(finite(data.step, 1)))
  const setValue = (value: number) => onChange({ ...data, value: clamp(value, low, high) })

  return (
    <div className="flex h-full flex-col gap-2">
      <input
        value={data.label}
        placeholder="Value label"
        onChange={(event) => onChange({ ...data, label: event.target.value })}
        className="gp-input--bare gp-label w-full outline-none"
      />
      <div data-island="value" data-island-size="fixed" className={`${panelClass} space-y-2 px-2 py-2`}>
      <div ref={valueRef} className="flex items-center gap-2">
        <SmallAction label="Decrease" onClick={() => setValue(data.value - step)}>
          <Minus size={12} />
        </SmallAction>
        <input
          type="number"
          value={finite(data.value)}
          min={low}
          max={high}
          step={step}
          onChange={(event) => setValue(Number(event.target.value))}
          className={`${numericClass} gp-input--bare gp-hero min-w-0 flex-1 text-center`}
          style={{ color: 'var(--gp-widget-accent)' }}
        />
        <SmallAction label="Increase" onClick={() => setValue(data.value + step)}>
          <Plus size={12} />
        </SmallAction>
      </div>
      <input
        type="range"
        min={low}
        max={high}
        step={step}
        value={clamp(data.value, low, high)}
        onChange={(event) => setValue(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-sky-400"
      />
      </div>
      <div data-island="bounds" data-island-size="fixed" className="mt-auto grid grid-cols-3 gap-2 border-t gp-hairline pt-2">
        {(['min', 'max', 'step'] as const).map((key) => (
          <label key={key} className="flex items-center gap-1">
            <span className="font-mono text-[8px] uppercase text-neutral-700">{key}</span>
            <input
              type="number"
              value={data[key]}
              onChange={(event) => onChange({ ...data, [key]: Number(event.target.value) })}
              className={`${numericClass} gp-input--bare w-full text-right text-[9px] text-neutral-500`}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

export function ToggleWidget({
  data,
  onChange,
}: {
  data: ToggleData
  onChange: (data: ToggleData) => void
}) {
  const valueRef = useFieldAnchor<HTMLButtonElement>('value')
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <input
        value={data.label}
        placeholder="Condition"
        onChange={(event) => onChange({ ...data, label: event.target.value })}
        className={`${inputClass} text-center text-[14px] font-medium`}
      />
      <div data-island="switch" data-island-size="fixed" className={`${panelClass} flex flex-col gap-2 px-3 py-2`}>
      <button
        ref={valueRef}
        type="button"
        role="switch"
        aria-checked={data.value}
        onClick={() => onChange({ ...data, value: !data.value })}
        className={`mx-auto flex h-10 w-20 items-center !rounded-full border p-1 transition-all duration-200 ${
          data.value ? '' : 'border-neutral-700 bg-neutral-900/70'
        }`}
        style={
          data.value
            ? {
                borderColor: 'color-mix(in oklab, var(--gp-widget-accent), transparent 50%)',
                background: 'color-mix(in oklab, var(--gp-widget-accent), transparent 85%)',
                boxShadow: '0 0 18px color-mix(in oklab, var(--gp-widget-accent), transparent 88%)',
              }
            : undefined
        }
      >
        <span
          className={`h-7 w-7 rounded-full shadow-lg transition-transform duration-200 ${
            data.value ? 'translate-x-10' : 'translate-x-0 bg-neutral-600'
          }`}
          style={data.value ? { background: 'var(--gp-widget-accent)' } : undefined}
        />
      </button>
      <p
        className={`text-center font-mono text-[9px] uppercase tracking-widest ${data.value ? '' : 'text-neutral-600'}`}
        style={data.value ? { color: 'var(--gp-widget-accent)' } : undefined}
      >
        {data.value ? 'On · true' : 'Off · false'}
      </p>
      </div>
    </div>
  )
}

/**
 * Bool gate — two glued glass subpanels, one per outcome. The pill name is
 * the only title (the old question line is gone). At detail height (≥ 4
 * cells) each side grows a description; from then on the card's height
 * follows the descriptions, not manual drags.
 */
export function BranchGateWidget({
  data,
  onChange,
  height,
  onHeightChange,
}: {
  data: BranchGateData
  onChange: (data: BranchGateData) => void
  height: number
  onHeightChange?: (height: number) => void
}) {
  const valueRef = useFieldAnchor<HTMLButtonElement>('value')
  const inverseRef = useFieldAnchor<HTMLButtonElement>('inverse')
  const rootRef = useRef<HTMLDivElement>(null)
  const detail = height >= GRID_SIZE * 4

  useLayoutEffect(() => {
    if (!detail || !rootRef.current) return
    onHeightChange?.(rootRef.current.scrollHeight)
  }, [detail, data.trueNote, data.falseNote, onHeightChange])

  const side = (isTrue: boolean) => {
    const active = data.value === isTrue
    const tone = isTrue
      ? active
        ? 'border-emerald-400/50 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.10)]'
        : 'text-neutral-600 hover:border-emerald-400/25'
      : active
        ? 'border-violet-400/50 text-violet-300 shadow-[0_0_20px_rgba(167,139,250,0.10)]'
        : 'text-neutral-600 hover:border-violet-400/25'
    return (
      // Paired outcomes are pixel-identical siblings forever (XVIII.1, the
      // symmetry rule): a True button bigger than its False twin is a thumb
      // on the scale, so neither side may be scaled at all.
      <WidgetPanel grip={false} island={isTrue ? 'true' : 'false'} sizing="fixed" className="relative min-w-0">
        <button
          ref={isTrue ? valueRef : inverseRef}
          type="button"
          aria-pressed={active}
          onClick={() => onChange({ ...data, value: isTrue })}
          className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[inherit] px-1.5 py-1 transition-all ${tone}`}
        >
          <span className="font-mono text-[8px] font-bold uppercase tracking-widest">
            {isTrue ? 'True' : 'False'}
          </span>
          <input
            value={isTrue ? data.trueLabel : data.falseLabel}
            aria-label={isTrue ? 'True label' : 'False label'}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChange(
                isTrue
                  ? { ...data, trueLabel: event.target.value }
                  : { ...data, falseLabel: event.target.value },
              )
            }
            className="w-full min-w-0 bg-transparent text-center text-[11px] font-semibold text-neutral-300 outline-none"
          />
          {detail && (
            <textarea
              value={(isTrue ? data.trueNote : data.falseNote) ?? ''}
              placeholder="Describe this outcome…"
              aria-label={isTrue ? 'True description' : 'False description'}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                onChange(
                  isTrue
                    ? { ...data, trueNote: event.target.value }
                    : { ...data, falseNote: event.target.value },
                )
              }
              className="gp-note-area mt-1 w-full resize-none bg-transparent text-center text-[10px] leading-relaxed text-neutral-400 outline-none placeholder:text-neutral-700"
            />
          )}
        </button>
      </WidgetPanel>
    )
  }

  return (
    <div ref={rootRef} className="grid h-full grid-cols-2 gap-2">
      {side(true)}
      {side(false)}
    </div>
  )
}

const FORMULA_LABELS: Record<FormulaOperator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  modulo: '%',
}

function formulaResult(data: FormulaData): number {
  const a = finite(data.a)
  const b = finite(data.b)
  if (data.operator === 'add') return a + b
  if (data.operator === 'subtract') return a - b
  if (data.operator === 'multiply') return a * b
  if (data.operator === 'divide') return b === 0 ? 0 : a / b
  return b === 0 ? 0 : a % b
}

export function FormulaWidget({
  data,
  onChange,
}: {
  data: FormulaData
  onChange: (data: FormulaData) => void
}) {
  const aRef = useFieldAnchor<HTMLLabelElement>('a')
  const bRef = useFieldAnchor<HTMLLabelElement>('b')
  const resultRef = useFieldAnchor<HTMLDivElement>('result')
  const result = formulaResult(data)
  return (
    <div className="flex h-full flex-col gap-3">
      <input
        value={data.label}
        onChange={(event) => onChange({ ...data, label: event.target.value })}
        className="bg-transparent text-center text-[11px] font-medium text-neutral-500 outline-none"
      />
      <div data-island="operands" data-island-size="fixed" className="grid grid-cols-[1fr_52px_1fr] items-center gap-2">
        {/* Operands are visually equal alternatives — fixed by the symmetry rule. */}
        <label ref={aRef} className={`${panelClass} px-2 py-2 text-center`}>
          <span className="block font-mono text-[8px] uppercase text-neutral-700">A</span>
          <input
            type="number"
            value={finite(data.a)}
            onChange={(event) => onChange({ ...data, a: Number(event.target.value) })}
            className={`${numericClass} w-full text-center text-lg font-semibold`}
          />
        </label>
        <select
          value={data.operator}
          aria-label="Formula operator"
          onChange={(event) => onChange({ ...data, operator: event.target.value as FormulaOperator })}
          className="h-10 text-center text-lg font-semibold text-neutral-200 outline-none"
        >
          {Object.entries(FORMULA_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <label ref={bRef} className={`${panelClass} px-2 py-2 text-center`}>
          <span className="block font-mono text-[8px] uppercase text-neutral-700">B</span>
          <input
            type="number"
            value={finite(data.b)}
            onChange={(event) => onChange({ ...data, b: Number(event.target.value) })}
            className={`${numericClass} w-full text-center text-lg font-semibold`}
          />
        </label>
      </div>
      <div ref={resultRef} data-island="result" data-island-size="fixed" className="gp-well flex flex-1 items-center justify-between gap-2 px-4 py-2">
        <span className="gp-label mb-0">Result</span>
        <strong className="gp-hero min-w-0 truncate">
          {Math.round(result * 1e8) / 1e8}
        </strong>
        <SmallAction label="Copy result" onClick={() => void navigator.clipboard?.writeText(String(result))}>
          <Copy size={11} />
        </SmallAction>
      </div>
    </div>
  )
}

const STATUS_META: Array<{ value: WorkflowStatus; label: string; color: string; progress: number }> = [
  { value: 'not_started', label: 'Not started', color: '#737373', progress: 0 },
  { value: 'in_progress', label: 'In progress', color: '#38bdf8', progress: 50 },
  { value: 'blocked', label: 'Blocked', color: '#fb7185', progress: 50 },
  { value: 'done', label: 'Done', color: '#34d399', progress: 100 },
]

export function StatusWidget({
  data,
  onChange,
}: {
  data: StatusData
  onChange: (data: StatusData) => void
}) {
  const statusRef = useFieldAnchor<HTMLDivElement>('status')
  const progressRef = useFieldAnchor<HTMLDivElement>('progress')
  const completeRef = useFieldAnchor<HTMLSpanElement>('complete')
  const current = STATUS_META.find((item) => item.value === data.value) ?? STATUS_META[0]!
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={data.label}
          onChange={(event) => onChange({ ...data, label: event.target.value })}
          className={`${inputClass} flex-1 font-medium`}
        />
        <span ref={completeRef} className="flex items-center gap-1 font-mono text-[9px] uppercase" style={{ color: current.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: current.color }} />
          {current.label}
        </span>
      </div>
      <div ref={statusRef} data-island="states" data-island-size="fixed" className="grid grid-cols-4 gap-2">
        {STATUS_META.map((item) => (
          <button
            key={item.value}
            type="button"
            title={item.label}
            aria-label={item.label}
            onClick={() => onChange({ ...data, value: item.value })}
            className={`h-9 rounded-lg border transition-all ${data.value === item.value ? 'border-current bg-white/[0.04]' : 'gp-hairline opacity-45 hover:opacity-80'}`}
            style={{ color: item.color }}
          >
            <span className="mx-auto block h-2 w-2 rounded-full bg-current" />
          </button>
        ))}
      </div>
      <div ref={progressRef} data-island="progress" data-island-size="width" className="mt-auto space-y-1.5">
        <div className="flex justify-between font-mono text-[8px] uppercase text-neutral-700">
          <span>Progress signal</span><span>{current.progress}%</span>
        </div>
        <ProgressBar value={current.progress} color={current.color} />
      </div>
    </div>
  )
}

function daysUntil(date: string): number {
  if (!date) return 0
  const target = new Date(`${date}T00:00:00`)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const delta = Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
  return Number.isFinite(delta) ? delta : 0
}

export function DatePickerWidget({
  data,
  onChange,
}: {
  data: DatePickerData
  onChange: (data: DatePickerData) => void
}) {
  const dateRef = useFieldAnchor<HTMLDivElement>('date')
  const daysRef = useFieldAnchor<HTMLDivElement>('days_until')
  const dueRef = useFieldAnchor<HTMLDivElement>('is_due')
  const days = daysUntil(data.date)
  const due = Boolean(data.date) && days <= 0
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <input
          value={data.label}
          onChange={(event) => onChange({ ...data, label: event.target.value })}
          className={`${inputClass} flex-1 font-medium`}
        />
        <button
          type="button"
          onClick={() => onChange({ ...data, includeTime: !data.includeTime })}
          className={`rounded-md border px-2 py-1 font-mono text-[8px] uppercase ${data.includeTime ? 'border-orange-400/40 text-orange-300' : 'gp-hairline text-neutral-600'}`}
        >
          Time
        </button>
      </div>
      <div ref={dateRef} data-island="date" data-island-size="width" className={`${panelClass} flex items-center gap-2 px-3 py-2`}>
        <input
          type="date"
          value={data.date}
          onChange={(event) => onChange({ ...data, date: event.target.value })}
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-neutral-300 outline-none [color-scheme:dark]"
        />
        {data.includeTime && (
          <input
            type="time"
            value={data.time}
            onChange={(event) => onChange({ ...data, time: event.target.value })}
            className="w-20 bg-transparent font-mono text-[11px] text-neutral-400 outline-none [color-scheme:dark]"
          />
        )}
      </div>
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-2 gap-2">
        <Stat anchor={daysRef} label="Days until" value={data.date ? days : '—'} accent={days < 0 ? 'text-red-300' : 'text-orange-300'} />
        <Stat anchor={dueRef} label="Due state" value={!data.date ? 'Unset' : due ? 'Due' : 'Upcoming'} accent={due ? 'text-red-300' : 'text-emerald-300'} />
      </div>
      <div data-island="actions" data-island-size="fixed" className="mt-auto flex justify-end gap-1">
        <button type="button" onClick={() => onChange({ ...data, date: todayISO() })} className="rounded-md px-2 py-1 text-[9px] text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300">Today</button>
        <button type="button" onClick={() => onChange({ ...data, date: '', time: '' })} className="rounded-md px-2 py-1 text-[9px] text-neutral-700 hover:bg-red-500/10 hover:text-red-400">Clear</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Structured notes and planning
// ---------------------------------------------------------------------------

function outlineHiddenIndices(data: OutlineData): Set<number> {
  const hidden = new Set<number>()
  const collapsedDepths: number[] = []
  data.items.forEach((item, index) => {
    while (collapsedDepths.length > 0 && collapsedDepths[collapsedDepths.length - 1]! >= item.depth) {
      collapsedDepths.pop()
    }
    if (collapsedDepths.length > 0) hidden.add(index)
    else if (item.collapsed) collapsedDepths.push(item.depth)
  })
  return hidden
}

export function OutlineWidget({
  data,
  onChange,
}: {
  data: OutlineData
  onChange: (data: OutlineData) => void
}) {
  const countRef = useFieldAnchor<HTMLSpanElement>('item_count')
  const topLevelRef = useFieldAnchor<HTMLSpanElement>('top_level_count')
  const hidden = outlineHiddenIndices(data)
  const setItem = (id: string, patch: Partial<OutlineData['items'][number]>) =>
    onChange({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const addAfter = (index: number) => {
    const depth = data.items[index]?.depth ?? 0
    const items = [...data.items]
    items.splice(index + 1, 0, { id: crypto.randomUUID(), text: '', depth, collapsed: false })
    onChange({ items })
  }
  const remove = (id: string) => onChange({ items: data.items.filter((item) => item.id !== id) })
  const topLevel = data.items.filter((item) => item.depth === 0).length

  return (
    <div className="flex h-full flex-col">
      <div data-island="summary" data-island-size="fixed" className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-300/70">Structured outline</span>
        <span className="flex gap-2 font-mono text-[9px] text-neutral-600">
          <span ref={topLevelRef}>{topLevel} roots</span>
          <span ref={countRef}>{data.items.length} items</span>
        </span>
      </div>
      <div data-island="outline" data-island-size="free" data-island-min-h="96" className="min-h-0 flex-1 overflow-y-auto rounded-xl border gp-hairline bg-neutral-900/30 px-1.5 py-1">
        {data.items.map((item, index) => {
          if (hidden.has(index)) return null
          const nextDepth = data.items[index + 1]?.depth
          const hasChildren = nextDepth !== undefined && nextDepth > item.depth
          return (
            <div key={item.id} className="group/outline flex h-7 items-center gap-1" style={{ paddingLeft: Math.min(item.depth, 5) * 14 }}>
              {hasChildren ? (
                <SmallAction label={item.collapsed ? 'Expand branch' : 'Collapse branch'} onClick={() => setItem(item.id, { collapsed: !item.collapsed })}>
                  {item.collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                </SmallAction>
              ) : (
                <span className="mx-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/50" />
              )}
              <input
                value={item.text}
                placeholder="Outline item…"
                onChange={(event) => setItem(item.id, { text: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addAfter(index)
                  } else if (event.key === 'Tab') {
                    event.preventDefault()
                    setItem(item.id, { depth: clamp(item.depth + (event.shiftKey ? -1 : 1), 0, 5) })
                  }
                }}
                className={`${inputClass} flex-1`}
              />
              <div className="hidden items-center group-hover/outline:flex">
                <SmallAction label="Outdent" disabled={item.depth === 0} onClick={() => setItem(item.id, { depth: Math.max(0, item.depth - 1) })}>
                  <ChevronLeft size={9} />
                </SmallAction>
                <SmallAction label="Indent" disabled={item.depth >= 5 || index === 0} onClick={() => setItem(item.id, { depth: Math.min(5, item.depth + 1) })}>
                  <ChevronRight size={9} />
                </SmallAction>
                <SmallAction label="Remove item" danger onClick={() => remove(item.id)}><X size={9} /></SmallAction>
              </div>
            </div>
          )
        })}
      </div>
      <div data-island="controls" data-island-size="width" className="mt-1 flex items-center justify-between">
        <AddButton label="Add item" onClick={() => addAfter(data.items.length - 1)} />
        <span className="font-mono text-[8px] text-neutral-700">Enter add · Tab indent</span>
      </div>
    </div>
  )
}

function formFieldFilled(field: FormField): boolean {
  if (field.type === 'checkbox') return field.value === true
  return String(field.value).trim().length > 0
}

function defaultFormValue(type: FormFieldType): FormField['value'] {
  if (type === 'checkbox') return false
  if (type === 'number') return 0
  return ''
}

export function FormWidget({
  data,
  onChange,
}: {
  data: FormWidgetData
  onChange: (data: FormWidgetData) => void
}) {
  const filledRef = useFieldAnchor<HTMLDivElement>('filled_count')
  const completeRef = useFieldAnchor<HTMLDivElement>('complete')
  const firstRef = useFieldAnchor<HTMLDivElement>('first_value')
  const filled = data.fields.filter(formFieldFilled).length
  const complete = data.fields.length > 0 && data.fields.every((field) => !field.required || formFieldFilled(field))
  const setField = (id: string, patch: Partial<FormField>) =>
    onChange({ ...data, fields: data.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)) })
  const removeField = (id: string) => onChange({ ...data, fields: data.fields.filter((field) => field.id !== id) })
  const addField = () =>
    onChange({
      ...data,
      fields: [...data.fields, { id: crypto.randomUUID(), label: 'Question', type: 'text', value: '', required: false }],
    })

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-end">
        <span className={`rounded-full px-2 py-0.5 font-mono text-[8px] uppercase ${complete ? 'bg-emerald-400/10 text-emerald-300' : 'bg-neutral-800 text-neutral-600'}`}>
          {complete ? 'Ready' : 'Incomplete'}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {data.fields.map((field, index) => (
          <div key={field.id} ref={index === 0 ? firstRef : undefined} data-island={field.id} data-island-size="width" className={`${panelClass} group/form px-2.5 py-2`}>
            <div className="mb-1 flex items-center gap-1.5">
              <input
                value={field.label}
                placeholder="Question"
                onChange={(event) => setField(field.id, { label: event.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[10px] font-medium text-neutral-500 outline-none"
              />
              <button
                type="button"
                title="Required"
                onClick={() => setField(field.id, { required: !field.required })}
                className={`font-mono text-[9px] ${field.required ? 'text-rose-400' : 'text-neutral-700'}`}
              >
                *
              </button>
              <select
                value={field.type}
                onChange={(event) => {
                  const type = event.target.value as FormFieldType
                  setField(field.id, { type, value: defaultFormValue(type) })
                }}
                className="bg-transparent font-mono text-[8px] uppercase text-neutral-600 outline-none"
              >
                <option value="text">Text</option><option value="number">Number</option><option value="checkbox">Check</option>
              </select>
              <SmallAction label="Remove field" danger onClick={() => removeField(field.id)}><X size={9} /></SmallAction>
            </div>
            {field.type === 'checkbox' ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={field.value === true}
                onClick={() => setField(field.id, { value: field.value !== true })}
                className={`flex h-7 w-full items-center gap-2 rounded-lg border px-2 text-[11px] transition-colors ${field.value === true ? 'border-teal-400/40 bg-teal-400/10 text-teal-300' : 'gp-hairline text-neutral-600'}`}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-current">{field.value === true && <Check size={9} />}</span>
                Confirm
              </button>
            ) : (
              <input
                type={field.type}
                value={field.value as string | number}
                placeholder="Answer…"
                onChange={(event) => setField(field.id, { value: field.type === 'number' ? Number(event.target.value) : event.target.value })}
                className={`${inputClass} h-7 rounded-lg border gp-hairline bg-neutral-950/30 px-2`}
              />
            )}
          </div>
        ))}
      </div>
      <div data-island="summary" data-island-size="fixed" className="flex items-end justify-between border-t gp-hairline pt-1.5">
        <AddButton label="Add field" onClick={addField} />
        <div className="flex gap-1.5">
          <Stat anchor={filledRef} label="Filled" value={`${filled}/${data.fields.length}`} />
          <Stat anchor={completeRef} label="Complete" value={complete ? 'Yes' : 'No'} accent={complete ? 'text-emerald-300' : 'text-neutral-500'} />
        </div>
      </div>
    </div>
  )
}

export function DailyAgendaWidget({
  data,
  onChange,
}: {
  data: DailyAgendaData
  onChange: (data: DailyAgendaData) => void
}) {
  const doneRef = useFieldAnchor<HTMLDivElement>('done_count')
  const allDoneRef = useFieldAnchor<HTMLDivElement>('all_done')
  const nextRef = useFieldAnchor<HTMLDivElement>('next_item')
  const done = data.items.filter((item) => item.done).length
  const allDone = data.items.length > 0 && done === data.items.length
  const next = [...data.items].sort((a, b) => a.time.localeCompare(b.time)).find((item) => !item.done)
  const setItem = (id: string, patch: Partial<DailyAgendaData['items'][number]>) =>
    onChange({ ...data, items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const remove = (id: string) => onChange({ ...data, items: data.items.filter((item) => item.id !== id) })
  const add = () => onChange({ ...data, items: [...data.items, { id: crypto.randomUUID(), time: '09:00', title: '', done: false }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <input type="date" value={data.date} onChange={(event) => onChange({ ...data, date: event.target.value })} className="bg-transparent font-mono text-[11px] text-sky-300 outline-none [color-scheme:dark]" />
        <span className="font-mono text-[9px] text-neutral-600">{done}/{data.items.length} complete</span>
      </div>
      <ProgressBar value={data.items.length ? (done / data.items.length) * 100 : 0} color="#38bdf8" />
      <div data-island="agenda" data-island-size="free" data-island-min-h="96" className="min-h-0 flex-1 overflow-y-auto rounded-xl border gp-hairline bg-neutral-900/25 px-2 py-1">
        {[...data.items].sort((a, b) => a.time.localeCompare(b.time)).map((item) => (
          <div key={item.id} className="group/agenda flex h-8 items-center gap-2 border-b gp-hairline last:border-0">
            <button type="button" role="checkbox" aria-checked={item.done} onClick={() => setItem(item.id, { done: !item.done })} className={`flex h-4 w-4 items-center justify-center rounded-full border ${item.done ? 'border-sky-400 bg-sky-400 text-neutral-950' : 'border-neutral-700 text-transparent'}`}><Check size={9} /></button>
            <input type="time" value={item.time} onChange={(event) => setItem(item.id, { time: event.target.value })} className="w-[62px] bg-transparent font-mono text-[9px] text-neutral-500 outline-none [color-scheme:dark]" />
            <input value={item.title} placeholder="Agenda item…" onChange={(event) => setItem(item.id, { title: event.target.value })} className={`${inputClass} flex-1 ${item.done ? 'text-neutral-600 line-through' : ''}`} />
            <SmallAction label="Remove item" danger onClick={() => remove(item.id)}><X size={9} /></SmallAction>
          </div>
        ))}
      </div>
      <div data-island="summary" data-island-size="fixed" className="flex items-end justify-between">
        <AddButton label="Add item" onClick={add} />
        <div className="grid grid-cols-3 gap-1">
          <Stat anchor={doneRef} label="Done" value={done} />
          <Stat anchor={allDoneRef} label="All done" value={allDone ? 'Yes' : 'No'} accent={allDone ? 'text-emerald-300' : 'text-neutral-500'} />
          <Stat anchor={nextRef} label="Next" value={next?.title || '—'} accent="text-sky-300" />
        </div>
      </div>
    </div>
  )
}

const PROCESS_META: Record<ProcessStepStatus, { label: string; color: string }> = {
  todo: { label: 'Queued', color: '#737373' },
  active: { label: 'Active', color: '#38bdf8' },
  done: { label: 'Done', color: '#34d399' },
}

export function ProcessWidget({
  data,
  onChange,
}: {
  data: ProcessData
  onChange: (data: ProcessData) => void
}) {
  const progressRef = useFieldAnchor<HTMLDivElement>('progress')
  const completeRef = useFieldAnchor<HTMLDivElement>('complete')
  const currentRef = useFieldAnchor<HTMLDivElement>('current_step')
  const done = data.steps.filter((step) => step.status === 'done').length
  const progress = data.steps.length ? Math.round((done / data.steps.length) * 100) : 0
  const complete = data.steps.length > 0 && done === data.steps.length
  const current = data.steps.find((step) => step.status === 'active')
  const setStep = (id: string, patch: Partial<ProcessData['steps'][number]>) => onChange({ steps: data.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)) })
  const setActive = (id: string) => onChange({ steps: data.steps.map((step) => ({ ...step, status: step.id === id ? 'active' : step.status === 'active' ? 'todo' : step.status })) })
  const advance = () => {
    const index = data.steps.findIndex((step) => step.status === 'active')
    if (index < 0) return
    onChange({ steps: data.steps.map((step, i) => i === index ? { ...step, status: 'done' } : i === index + 1 ? { ...step, status: 'active' } : step) })
  }
  const add = () => onChange({ steps: [...data.steps, { id: crypto.randomUUID(), label: '', status: data.steps.some((step) => step.status === 'active') ? 'todo' : 'active' }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="progress" data-island-size="width" className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-lime-300/70">Procedure</span>
        <div className="flex-1"><ProgressBar value={progress} color="#a3e635" /></div>
        <span className="font-mono text-[9px] text-neutral-500">{progress}%</span>
      </div>
      <div data-island="steps" data-island-size="free" data-island-min-h="96" className="min-h-0 flex-1">
        {data.steps.map((step, index) => {
          const meta = PROCESS_META[step.status]
          return (
            <div key={step.id} className="group/process relative flex h-8 items-center gap-2">
              {index < data.steps.length - 1 && <span className="absolute left-[7px] top-6 h-4 w-px bg-neutral-800" />}
              <button type="button" title="Make active" onClick={() => setActive(step.id)} className="relative z-10 h-3.5 w-3.5 rounded-full border-2 bg-neutral-950 transition-transform hover:scale-125" style={{ borderColor: meta.color }} />
              <span className="w-4 font-mono text-[8px] text-neutral-700">{String(index + 1).padStart(2, '0')}</span>
              <input value={step.label} placeholder="Process step…" onChange={(event) => setStep(step.id, { label: event.target.value })} className={`${inputClass} flex-1 ${step.status === 'done' ? 'text-neutral-600 line-through' : ''}`} />
              <span className="font-mono text-[8px] uppercase" style={{ color: meta.color }}>{meta.label}</span>
              <SmallAction label="Remove step" danger onClick={() => onChange({ steps: data.steps.filter((item) => item.id !== step.id) })}><X size={9} /></SmallAction>
            </div>
          )
        })}
      </div>
      <div data-island="summary" data-island-size="fixed" className="flex items-end justify-between border-t gp-hairline pt-1">
        <div className="flex items-center gap-1"><AddButton label="Add step" onClick={add} /><button type="button" disabled={!current} onClick={advance} className="rounded-lg bg-lime-400/10 px-2 py-1.5 text-[10px] font-medium text-lime-300 disabled:opacity-30">Advance</button></div>
        <div className="grid grid-cols-3 gap-1">
          <Stat anchor={progressRef} label="Progress" value={`${progress}%`} />
          <Stat anchor={completeRef} label="Complete" value={complete ? 'Yes' : 'No'} accent={complete ? 'text-emerald-300' : 'text-neutral-500'} />
          <Stat anchor={currentRef} label="Current" value={current?.label || '—'} accent="text-lime-300" />
        </div>
      </div>
    </div>
  )
}

function riskScore(likelihood: number, impact: number): number {
  return clamp(likelihood, 1, 5) * clamp(impact, 1, 5)
}

export function RiskRegisterWidget({
  data,
  onChange,
}: {
  data: RiskRegisterData
  onChange: (data: RiskRegisterData) => void
}) {
  const openRef = useFieldAnchor<HTMLDivElement>('open_count')
  const highRef = useFieldAnchor<HTMLDivElement>('highest_score')
  const resolvedRef = useFieldAnchor<HTMLDivElement>('all_resolved')
  const open = data.items.filter((item) => item.status === 'open')
  const highest = open.reduce((max, item) => Math.max(max, riskScore(item.likelihood, item.impact)), 0)
  const allResolved = data.items.length > 0 && open.length === 0
  const setItem = (id: string, patch: Partial<RiskRegisterData['items'][number]>) => onChange({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const sorted = [...data.items].sort((a, b) => riskScore(b.likelihood, b.impact) - riskScore(a.likelihood, a.impact))
  const add = () => onChange({ items: [...data.items, { id: crypto.randomUUID(), risk: '', likelihood: 3, impact: 3, mitigation: '', status: 'open' }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-3 gap-2">
        <Stat anchor={openRef} label="Open" value={open.length} accent={open.length ? 'text-rose-300' : 'text-emerald-300'} />
        <Stat anchor={highRef} label="Highest score" value={highest} accent={highest >= 15 ? 'text-rose-300' : highest >= 8 ? 'text-amber-300' : 'text-neutral-300'} />
        <Stat anchor={resolvedRef} label="All resolved" value={allResolved ? 'Yes' : 'No'} accent={allResolved ? 'text-emerald-300' : 'text-neutral-500'} />
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {sorted.map((item) => {
          const score = riskScore(item.likelihood, item.impact)
          const scoreColor = score >= 15 ? 'text-rose-300 bg-rose-400/10' : score >= 8 ? 'text-amber-300 bg-amber-400/10' : 'text-emerald-300 bg-emerald-400/10'
          return (
            <div key={item.id} data-island={item.id} data-island-size="width" className={`${panelClass} group/risk px-2.5 py-2 ${item.status === 'resolved' ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${scoreColor}`}>{score}</span>
                <input value={item.risk} placeholder="Describe the risk…" onChange={(event) => setItem(item.id, { risk: event.target.value })} className={`${inputClass} flex-1 font-medium ${item.status === 'resolved' ? 'line-through' : ''}`} />
                {(['likelihood', 'impact'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1 font-mono text-[8px] uppercase text-neutral-700">
                    {key === 'likelihood' ? 'L' : 'I'}
                    <select value={item[key]} onChange={(event) => setItem(item.id, { [key]: Number(event.target.value) as RiskLevel })} className="rounded border gp-hairline bg-neutral-900 px-1 py-0.5 text-[9px] text-neutral-400 outline-none">
                      {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </label>
                ))}
                <button type="button" onClick={() => setItem(item.id, { status: item.status === 'open' ? 'resolved' : 'open' })} className={`rounded-md px-1.5 py-1 font-mono text-[8px] uppercase ${item.status === 'resolved' ? 'text-emerald-300' : 'text-neutral-600 hover:text-neutral-300'}`}>{item.status === 'resolved' ? 'Resolved' : 'Resolve'}</button>
                <SmallAction label="Remove risk" danger onClick={() => onChange({ items: data.items.filter((risk) => risk.id !== item.id) })}><X size={9} /></SmallAction>
              </div>
              <input value={item.mitigation} placeholder="Mitigation / response…" onChange={(event) => setItem(item.id, { mitigation: event.target.value })} className="mt-1 w-full bg-transparent pl-9 text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700" />
            </div>
          )
        })}
      </div>
      <AddButton label="Add risk" onClick={add} />
    </div>
  )
}

function decisionScore(data: DecisionMatrixData, optionIndex: number): number {
  const option = data.options[optionIndex]
  if (!option) return 0
  return data.criteria.reduce((sum, criterion, index) => sum + finite(criterion.weight, 1) * finite(option.scores[index] ?? 0), 0)
}

export function DecisionMatrixWidget({
  data,
  onChange,
}: {
  data: DecisionMatrixData
  onChange: (data: DecisionMatrixData) => void
}) {
  const winnerRef = useFieldAnchor<HTMLDivElement>('winner')
  const scoreRef = useFieldAnchor<HTMLDivElement>('winner_score')
  const scores = data.options.map((_, index) => decisionScore(data, index))
  const winnerIndex = scores.length ? scores.reduce((best, score, index) => score > scores[best]! ? index : best, 0) : -1
  const winner = data.options[winnerIndex]
  const setCriterion = (index: number, patch: Partial<DecisionMatrixData['criteria'][number]>) => onChange({ ...data, criteria: data.criteria.map((criterion, i) => i === index ? { ...criterion, ...patch } : criterion) })
  const setOption = (index: number, patch: Partial<DecisionMatrixData['options'][number]>) => onChange({ ...data, options: data.options.map((option, i) => i === index ? { ...option, ...patch } : option) })
  const addCriterion = () => onChange({ criteria: [...data.criteria, { id: crypto.randomUUID(), label: 'Criterion', weight: 1 }], options: data.options.map((option) => ({ ...option, scores: [...option.scores, 3] })) })
  const removeCriterion = (index: number) => onChange({ criteria: data.criteria.filter((_, i) => i !== index), options: data.options.map((option) => ({ ...option, scores: option.scores.filter((_, i) => i !== index) })) })
  const addOption = () => onChange({ ...data, options: [...data.options, { id: crypto.randomUUID(), label: `Option ${String.fromCharCode(65 + data.options.length)}`, scores: data.criteria.map(() => 3) }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-2 gap-2">
        <Stat anchor={winnerRef} label="Leading option" value={winner?.label || '—'} accent="text-violet-300" />
        <Stat anchor={scoreRef} label="Weighted score" value={winnerIndex >= 0 ? Math.round(scores[winnerIndex]! * 100) / 100 : 0} accent="text-violet-300" />
      </div>
      <div data-island="matrix" data-island-size="free" data-island-min-w="240" data-island-min-h="96" className="min-h-0 flex-1 overflow-auto rounded-xl border gp-hairline">
        <table className="w-full min-w-[360px] border-collapse text-[10px]">
          <thead className="sticky top-0 z-10 bg-neutral-900/95">
            <tr>
              <th className="w-28 border-b border-r gp-hairline px-2 py-1.5 text-left font-medium text-neutral-600">Option</th>
              {data.criteria.map((criterion, index) => (
                <th key={criterion.id} className="group/criterion min-w-20 border-b border-r gp-hairline px-1 py-1">
                  <div className="flex items-center gap-1">
                    <input value={criterion.label} onChange={(event) => setCriterion(index, { label: event.target.value })} className="min-w-0 flex-1 bg-transparent text-center text-[9px] text-neutral-400 outline-none" />
                    <SmallAction label="Remove criterion" danger onClick={() => removeCriterion(index)}><X size={8} /></SmallAction>
                  </div>
                  <label className="font-mono text-[8px] text-neutral-700">w <input type="number" min={0} step={0.1} value={criterion.weight} onChange={(event) => setCriterion(index, { weight: Number(event.target.value) })} className={`${numericClass} w-8 text-center text-[8px] text-neutral-600`} /></label>
                </th>
              ))}
              <th className="border-b gp-hairline px-2 text-violet-400/70">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.options.map((option, optionIndex) => (
              <tr key={option.id} className={winnerIndex === optionIndex ? 'bg-violet-400/[0.06]' : ''}>
                <td className="border-b border-r gp-hairline px-2 py-1.5"><input value={option.label} onChange={(event) => setOption(optionIndex, { label: event.target.value })} className={`${inputClass} font-medium ${winnerIndex === optionIndex ? 'text-violet-300' : ''}`} /></td>
                {data.criteria.map((criterion, criterionIndex) => (
                  <td key={criterion.id} className="border-b border-r gp-hairline text-center">
                    <input type="number" min={0} max={5} step={1} value={option.scores[criterionIndex] ?? 0} onChange={(event) => setOption(optionIndex, { scores: option.scores.map((score, i) => i === criterionIndex ? clamp(Number(event.target.value), 0, 5) : score) })} className={`${numericClass} w-10 text-center text-[10px]`} />
                  </td>
                ))}
                <td className="border-b gp-hairline px-2 text-center font-mono font-bold text-violet-300">{Math.round(scores[optionIndex]! * 10) / 10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div data-island="actions" data-island-size="width" className="flex items-center justify-between"><AddButton label="Add option" onClick={addOption} /><AddButton label="Add criterion" onClick={addCriterion} /></div>
    </div>
  )
}

type SwotKey = keyof SwotData
const SWOT_META: Array<{ key: SwotKey; label: string; color: string }> = [
  { key: 'strengths', label: 'Strengths', color: '#34d399' },
  { key: 'weaknesses', label: 'Weaknesses', color: '#fb7185' },
  { key: 'opportunities', label: 'Opportunities', color: '#38bdf8' },
  { key: 'threats', label: 'Threats', color: '#f59e0b' },
]

function SwotQuadrant({
  label,
  color,
  items,
  onChange,
  anchor,
}: {
  label: string
  color: string
  items: string[]
  onChange: (items: string[]) => void
  anchor: ReturnType<typeof useFieldAnchor<HTMLDivElement>>
}) {
  return (
    <WidgetPanel ref={anchor} grip={false} island={label.toLowerCase()} sizing="fixed" className="group/swot flex min-h-0 flex-col p-3">
      <div className="mb-1 flex items-center justify-between"><span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color }}>{label}</span><span className="font-mono text-[8px] text-neutral-700">{items.filter((item) => item.trim()).length}</span></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((item, index) => (
          <div key={index} className="group/swot-row flex h-6 items-center gap-1">
            <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <input value={item} placeholder="Add insight…" onChange={(event) => onChange(items.map((value, i) => i === index ? event.target.value : value))} className={`${inputClass} flex-1 text-[10px]`} />
            <button type="button" aria-label="Remove insight" onClick={() => onChange(items.filter((_, i) => i !== index))} className="text-neutral-800 opacity-0 hover:text-red-400 group-hover/swot-row:opacity-100"><X size={8} /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...items, ''])} className="mt-1 flex h-5 items-center gap-1 text-[9px] text-neutral-700 opacity-0 transition-opacity hover:text-neutral-400 group-hover/swot:opacity-100"><Plus size={8} /> Add</button>
    </WidgetPanel>
  )
}

export function SwotWidget({ data, onChange }: { data: SwotData; onChange: (data: SwotData) => void }) {
  const strengthRef = useFieldAnchor<HTMLDivElement>('strength_count')
  const weaknessRef = useFieldAnchor<HTMLDivElement>('weakness_count')
  const opportunityRef = useFieldAnchor<HTMLDivElement>('opportunity_count')
  const threatRef = useFieldAnchor<HTMLDivElement>('threat_count')
  const anchors = [strengthRef, weaknessRef, opportunityRef, threatRef]
  return (
    <div className="grid h-full grid-cols-2 grid-rows-2 gap-2">
      {SWOT_META.map((meta, index) => (
        <SwotQuadrant key={meta.key} label={meta.label} color={meta.color} items={data[meta.key]} anchor={anchors[index]!} onChange={(items) => onChange({ ...data, [meta.key]: items })} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tracking and lightweight visualization
// ---------------------------------------------------------------------------

export function TimesheetWidget({
  data,
  onChange,
}: {
  data: TimesheetData
  onChange: (data: TimesheetData) => void
}) {
  const totalRef = useFieldAnchor<HTMLDivElement>('total_hours')
  const billableRef = useFieldAnchor<HTMLDivElement>('billable_hours')
  const amountRef = useFieldAnchor<HTMLDivElement>('amount')
  const total = data.entries.reduce((sum, entry) => sum + Math.max(0, finite(entry.hours)), 0)
  const billable = data.entries.reduce((sum, entry) => sum + (entry.billable ? Math.max(0, finite(entry.hours)) : 0), 0)
  const amount = billable * Math.max(0, finite(data.hourlyRate))
  const setEntry = (id: string, patch: Partial<TimesheetData['entries'][number]>) =>
    onChange({ ...data, entries: data.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) })
  const add = () => onChange({ ...data, entries: [...data.entries, { id: crypto.randomUUID(), date: todayISO(), label: '', hours: 1, billable: true }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-3 gap-2">
        <Stat anchor={totalRef} label="Total hours" value={Math.round(total * 100) / 100} accent="text-cyan-300" />
        <Stat anchor={billableRef} label="Billable" value={Math.round(billable * 100) / 100} accent="text-emerald-300" />
        <Stat anchor={amountRef} label="Amount" value={`${data.currency}${Math.round(amount * 100) / 100}`} accent="text-amber-300" />
      </div>
      <div data-island="billing" data-island-size="width" className="flex items-center justify-end gap-2 font-mono text-[8px] uppercase text-neutral-700">
        <label>Currency <input value={data.currency} onChange={(event) => onChange({ ...data, currency: event.target.value.slice(0, 3) })} className="w-8 bg-transparent text-center text-[10px] text-neutral-400 outline-none" /></label>
        <label>Rate <input type="number" min={0} value={data.hourlyRate} onChange={(event) => onChange({ ...data, hourlyRate: Math.max(0, Number(event.target.value)) })} className={`${numericClass} w-14 text-right text-[10px] text-neutral-400`} /></label>
      </div>
      <div data-island="entries" data-island-size="free" data-island-min-h="96" className="min-h-0 flex-1 overflow-y-auto rounded-xl border gp-hairline bg-neutral-900/25 px-2">
        {data.entries.map((entry) => (
          <div key={entry.id} className="group/time flex h-10 items-center gap-2 border-b gp-hairline last:border-0">
            <input type="date" value={entry.date} onChange={(event) => setEntry(entry.id, { date: event.target.value })} className="w-[88px] bg-transparent font-mono text-[8px] text-neutral-600 outline-none [color-scheme:dark]" />
            <input value={entry.label} placeholder="Work item…" onChange={(event) => setEntry(entry.id, { label: event.target.value })} className={`${inputClass} flex-1`} />
            <label className="flex items-center gap-1"><input type="number" min={0} step={0.25} value={entry.hours} onChange={(event) => setEntry(entry.id, { hours: Math.max(0, Number(event.target.value)) })} className={`${numericClass} w-11 text-right text-[11px]`} /><span className="text-[8px] text-neutral-700">h</span></label>
            <button type="button" title="Toggle billable" onClick={() => setEntry(entry.id, { billable: !entry.billable })} className={`rounded px-1 py-0.5 font-mono text-[8px] uppercase ${entry.billable ? 'bg-emerald-400/10 text-emerald-300' : 'text-neutral-700'}`}>Bill</button>
            <SmallAction label="Remove entry" danger onClick={() => onChange({ ...data, entries: data.entries.filter((item) => item.id !== entry.id) })}><X size={9} /></SmallAction>
          </div>
        ))}
      </div>
      <AddButton label="Add time entry" onClick={add} />
    </div>
  )
}

export function InventoryWidget({
  data,
  onChange,
}: {
  data: InventoryData
  onChange: (data: InventoryData) => void
}) {
  const totalRef = useFieldAnchor<HTMLDivElement>('total_units')
  const lowRef = useFieldAnchor<HTMLDivElement>('low_stock_count')
  const stockedRef = useFieldAnchor<HTMLDivElement>('all_stocked')
  const total = data.items.reduce((sum, item) => sum + Math.max(0, finite(item.quantity)), 0)
  const low = data.items.filter((item) => item.quantity <= item.minimum)
  const allStocked = data.items.length > 0 && low.length === 0
  const setItem = (id: string, patch: Partial<InventoryData['items'][number]>) =>
    onChange({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const add = () => onChange({ items: [...data.items, { id: crypto.randomUUID(), name: '', quantity: 0, minimum: 0, unit: 'pcs' }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-3 gap-2">
        <Stat anchor={totalRef} label="Total units" value={Math.round(total * 100) / 100} />
        <Stat anchor={lowRef} label="Low stock" value={low.length} accent={low.length ? 'text-amber-300' : 'text-emerald-300'} />
        <Stat anchor={stockedRef} label="All stocked" value={allStocked ? 'Yes' : 'No'} accent={allStocked ? 'text-emerald-300' : 'text-neutral-500'} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_88px_64px_24px] gap-2 px-2 font-mono text-[8px] uppercase tracking-wider text-neutral-700">
        <span>Item</span><span className="text-center">Quantity</span><span className="text-center">Minimum</span><span />
      </div>
      <div data-island="inventory" data-island-size="free" data-island-min-h="96" className="min-h-0 flex-1 overflow-y-auto rounded-xl border gp-hairline bg-neutral-900/25 px-2">
        {data.items.map((item) => {
          const isLow = item.quantity <= item.minimum
          return (
            <div key={item.id} className={`group/inventory grid min-h-[62px] grid-cols-[minmax(0,1fr)_88px_64px_24px] items-center gap-2 border-b gp-hairline py-1 last:border-0 ${isLow ? 'bg-amber-400/[0.035]' : ''}`}>
              <div className="gp-well min-w-0 px-1 py-0.5"><input value={item.name} placeholder="Item…" onChange={(event) => setItem(item.id, { name: event.target.value })} className="gp-input--bare w-full min-w-0 font-medium text-neutral-200 outline-none" /><input value={item.unit} placeholder="unit" onChange={(event) => setItem(item.id, { unit: event.target.value })} className="gp-input--bare w-full min-w-0 font-mono text-[9px] text-neutral-600 outline-none" /></div>
              <div className="gp-well flex items-center justify-between px-1"><button type="button" onClick={() => setItem(item.id, { quantity: Math.max(0, item.quantity - 1) })} className="text-neutral-700 hover:text-neutral-300"><Minus size={9} /></button><input type="number" min={0} value={item.quantity} onChange={(event) => setItem(item.id, { quantity: Math.max(0, Number(event.target.value)) })} className={`gp-input--bare ${numericClass} w-10 text-center text-[11px] ${isLow ? 'text-amber-300' : ''}`} /><button type="button" onClick={() => setItem(item.id, { quantity: item.quantity + 1 })} className="text-neutral-700 hover:text-neutral-300"><Plus size={9} /></button></div>
              <input type="number" min={0} value={item.minimum} onChange={(event) => setItem(item.id, { minimum: Math.max(0, Number(event.target.value)) })} className={`gp-input--compact ${numericClass} w-full text-center text-[10px] text-neutral-500`} />
              <SmallAction label="Remove item" danger onClick={() => onChange({ items: data.items.filter((entry) => entry.id !== item.id) })}><X size={9} /></SmallAction>
            </div>
          )
        })}
      </div>
      <AddButton label="Add inventory item" onClick={add} />
    </div>
  )
}

const LOG_LEVELS = ['note', 'info', 'warning'] as const
const LOG_COLORS = { note: '#94a3b8', info: '#38bdf8', warning: '#f59e0b' } as const

export function LogbookWidget({
  data,
  onChange,
}: {
  data: LogbookData
  onChange: (data: LogbookData) => void
}) {
  const countRef = useFieldAnchor<HTMLDivElement>('entry_count')
  const latestRef = useFieldAnchor<HTMLDivElement>('latest')
  const latest = [...data.entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  const setEntry = (id: string, patch: Partial<LogbookData['entries'][number]>) =>
    onChange({ entries: data.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) })
  const add = () => onChange({ entries: [...data.entries, { id: crypto.randomUUID(), timestamp: new Date().toISOString(), text: '', level: 'note' }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-[90px_1fr] gap-2"><Stat anchor={countRef} label="Entries" value={data.entries.length} /><Stat anchor={latestRef} label="Latest" value={latest?.text || '—'} accent="text-slate-300" /></div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {[...data.entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((entry) => {
          const levelIndex = LOG_LEVELS.indexOf(entry.level)
          const color = LOG_COLORS[entry.level]
          return (
            <div key={entry.id} data-island={entry.id} data-island-size="width" className={`${panelClass} group/log flex items-start gap-2 px-2.5 py-2`}>
              <button type="button" title="Change level" onClick={() => setEntry(entry.id, { level: LOG_LEVELS[(levelIndex + 1) % LOG_LEVELS.length]! })} className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}55` }} />
              <div className="min-w-0 flex-1"><textarea value={entry.text} placeholder="Log what happened…" rows={1} onChange={(event) => setEntry(entry.id, { text: event.target.value })} className={`${inputClass} resize-none leading-relaxed`} /><p className="mt-0.5 font-mono text-[8px] text-neutral-700">{new Date(entry.timestamp).toLocaleString()} · {entry.level}</p></div>
              <SmallAction label="Remove entry" danger onClick={() => onChange({ entries: data.entries.filter((item) => item.id !== entry.id) })}><X size={9} /></SmallAction>
            </div>
          )
        })}
      </div>
      <AddButton label="Append entry" onClick={add} />
    </div>
  )
}

export function LineChartWidget({
  data,
  onChange,
}: {
  data: LineChartData
  onChange: (data: LineChartData) => void
}) {
  const latestRef = useFieldAnchor<HTMLDivElement>('latest')
  const averageRef = useFieldAnchor<HTMLDivElement>('average')
  const maxRef = useFieldAnchor<HTMLDivElement>('max')
  const values = data.points.map((point) => finite(point.value))
  const latest = values[values.length - 1] ?? 0
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  const maximum = values.length ? Math.max(...values) : 0
  const chart = (() => {
    if (values.length === 0) return [] as Array<{ x: number; y: number }>
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    return values.map((value, index) => ({ x: 10 + (index / Math.max(1, values.length - 1)) * 280, y: 84 - ((value - min) / range) * 68 }))
  })()
  const add = () => onChange({ ...data, points: [...data.points, { id: crypto.randomUUID(), label: String.fromCharCode(65 + data.points.length), value: latest }] })
  const addAt = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect=event.currentTarget.getBoundingClientRect()
    const ratio=Math.max(0,Math.min(1,1-(event.clientY-rect.top)/rect.height))
    const min=values.length?Math.min(...values):0;const max=values.length?Math.max(...values):100
    const value=Math.round((min+ratio*(max-min||100))*100)/100
    onChange({...data,points:[...data.points,{id:crypto.randomUUID(),label:String.fromCharCode(65+data.points.length),value}]})
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-end"><input value={data.unit} placeholder="unit" onChange={(event) => onChange({ ...data, unit: event.target.value })} className="w-12 bg-transparent text-right font-mono text-[9px] text-neutral-600 outline-none" /></div>
      <div role="button" tabIndex={0} aria-label="Oscilloscope. Click to add a point" data-island="scope" data-island-size="free" data-island-min-h="96" onClick={addAt} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();add()}}} className="relative h-32 shrink-0 cursor-crosshair overflow-hidden rounded-xl border border-emerald-300/15 bg-[linear-gradient(rgba(74,222,128,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(74,222,128,.07)_1px,transparent_1px)] bg-[length:24px_24px] outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/50">
        <svg viewBox="0 0 300 96" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Line chart">
          {chart.length > 1 && <polyline points={chart.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          {chart.map((point, index) => <circle key={data.points[index]?.id ?? index} cx={point.x} cy={point.y} r="3" fill="#0a0a0a" stroke="#7dd3fc" strokeWidth="1.5"><title>{data.points[index]?.label}: {values[index]}{data.unit}</title></circle>)}
        </svg>
      </div>
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-3 gap-2"><Stat anchor={latestRef} label="Latest" value={`${Math.round(latest * 100) / 100}${data.unit}`} accent="text-sky-300" /><Stat anchor={averageRef} label="Average" value={Math.round(average * 100) / 100} /><Stat anchor={maxRef} label="Maximum" value={Math.round(maximum * 100) / 100} /></div>
      <p className="text-center font-mono text-[8px] tracking-widest text-emerald-200/35">CLICK THE GLASS TO SAMPLE · ENTER ADDS LATEST</p>
    </div>
  )
}

function pieGradient(data: PieChartData): string {
  const total = data.segments.reduce((sum, segment) => sum + Math.max(0, finite(segment.value)), 0)
  if (total <= 0) return 'conic-gradient(#262626 0deg 360deg)'
  let angle = 0
  const stops = data.segments.map((segment) => {
    const start = angle
    angle += (Math.max(0, finite(segment.value)) / total) * 360
    return `${segment.color} ${start}deg ${angle}deg`
  })
  return `conic-gradient(${stops.join(', ')})`
}

export function PieChartWidget({
  data,
  onChange,
}: {
  data: PieChartData
  onChange: (data: PieChartData) => void
}) {
  const totalRef = useFieldAnchor<HTMLDivElement>('total')
  const shareRef = useFieldAnchor<HTMLDivElement>('largest_share')
  const labelRef = useFieldAnchor<HTMLDivElement>('largest_label')
  const total = data.segments.reduce((sum, segment) => sum + Math.max(0, finite(segment.value)), 0)
  const largest = data.segments.reduce<LineChartData['points'][number] | PieChartData['segments'][number] | null>((best, segment) => !best || segment.value > best.value ? segment : best, null)
  const largestShare = total > 0 && largest ? (Math.max(0, largest.value) / total) * 100 : 0
  const setSegment = (id: string, patch: Partial<PieChartData['segments'][number]>) => onChange({ ...data, segments: data.segments.map((segment) => segment.id === id ? { ...segment, ...patch } : segment) })
  const palette = ['#38bdf8', '#a3e635', '#f472b6', '#f59e0b', '#a78bfa', '#34d399']
  const add = () => onChange({ ...data, segments: [...data.segments, { id: crypto.randomUUID(), label: `Segment ${data.segments.length + 1}`, value: 10, color: palette[data.segments.length % palette.length]! }] })

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-end"><button type="button" onClick={() => onChange({ ...data, mode: data.mode === 'donut' ? 'pie' : 'donut' })} className="rounded-md border gp-hairline px-2 py-1 font-mono text-[8px] uppercase text-neutral-500">{data.mode}</button></div>
      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-3">
        {/* A stretched circle is a lie (XVIII.1): the disc scales only proportionally. */}
        <div data-island="disc" data-island-size="aspect" data-island-min-w="96" data-island-min-h="96" data-island-max-w="224" data-island-max-h="224" className="flex w-28 items-center justify-center self-start"><div className="relative aspect-square w-full rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.25)]" style={{ background: pieGradient(data) }}>{data.mode === 'donut' && <div className="absolute inset-[25%] flex flex-col items-center justify-center rounded-full bg-neutral-950 shadow-inner"><span className="font-mono text-[8px] uppercase text-neutral-700">Total</span><strong className="font-mono text-sm text-neutral-200">{Math.round(total * 100) / 100}</strong></div>}</div></div>
        <div data-island="segments" data-island-size="free" data-island-min-w="120" data-island-min-h="96" data-island-max-h="260" className="min-h-0 overflow-y-auto">
          {data.segments.map((segment) => (
            <div key={segment.id} className="group/segment flex h-8 items-center gap-1.5 border-b gp-hairline last:border-0">
              <input type="color" value={segment.color} onChange={(event) => setSegment(segment.id, { color: event.target.value })} className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0" />
              <input value={segment.label} onChange={(event) => setSegment(segment.id, { label: event.target.value })} className={`${inputClass} flex-1 text-[10px]`} />
              <input type="number" min={0} value={segment.value} onChange={(event) => setSegment(segment.id, { value: Math.max(0, Number(event.target.value)) })} className={`${numericClass} w-12 text-right text-[10px]`} />
              <SmallAction label="Remove segment" danger onClick={() => onChange({ ...data, segments: data.segments.filter((item) => item.id !== segment.id) })}><X size={8} /></SmallAction>
            </div>
          ))}
        </div>
      </div>
      <div data-island="summary" data-island-size="fixed" className="grid grid-cols-3 gap-2"><Stat anchor={totalRef} label="Total" value={Math.round(total * 100) / 100} /><Stat anchor={shareRef} label="Largest share" value={`${Math.round(largestShare * 10) / 10}%`} accent="text-pink-300" /><Stat anchor={labelRef} label="Largest" value={largest?.label || '—'} accent="text-pink-300" /></div>
      <AddButton label="Add segment" onClick={add} />
    </div>
  )
}

const LINEAR_UNITS: Record<Exclude<UnitConverterCategory, 'temperature'>, Record<string, number>> = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  mass: { mg: 0.000001, g: 0.001, kg: 1, oz: 0.0283495, lb: 0.453592, t: 1000 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800 },
}
const TEMP_UNITS = ['C', 'F', 'K'] as const
const DEFAULT_UNITS: Record<UnitConverterCategory, [string, string]> = {
  length: ['m', 'ft'], mass: ['kg', 'lb'], temperature: ['C', 'F'], time: ['min', 'h'],
}

function unitsFor(category: UnitConverterCategory): string[] {
  return category === 'temperature' ? [...TEMP_UNITS] : Object.keys(LINEAR_UNITS[category])
}

function convertUnit(data: UnitConverterData): number {
  const value = finite(data.value)
  if (data.category !== 'temperature') {
    const units = LINEAR_UNITS[data.category]
    const from = units[data.from] ?? 1
    const to = units[data.to] ?? 1
    return (value * from) / to
  }
  let celsius = value
  if (data.from === 'F') celsius = (value - 32) * (5 / 9)
  else if (data.from === 'K') celsius = value - 273.15
  if (data.to === 'F') return celsius * (9 / 5) + 32
  if (data.to === 'K') return celsius + 273.15
  return celsius
}

export function UnitConverterWidget({
  data,
  onChange,
}: {
  data: UnitConverterData
  onChange: (data: UnitConverterData) => void
}) {
  const inputRef = useFieldAnchor<HTMLDivElement>('input')
  const outputRef = useFieldAnchor<HTMLDivElement>('output')
  const [copied, showCopied] = useTransientValue(false)
  const output = convertUnit(data)
  const precision = clamp(Math.round(data.precision), 0, 8)
  const formatted = Number.isFinite(output) ? Number(output.toFixed(precision)).toString() : '0'
  const units = unitsFor(data.category)
  const setCategory = (category: UnitConverterCategory) => {
    const [from, to] = DEFAULT_UNITS[category]
    onChange({ ...data, category, from, to })
  }
  const copy = () => {
    void navigator.clipboard?.writeText(formatted)
    showCopied(true, 900)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <select value={data.category} onChange={(event) => setCategory(event.target.value as UnitConverterCategory)} className="mx-auto rounded-full border gp-hairline bg-neutral-900 px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-emerald-300 outline-none">
        <option value="length">Length</option><option value="mass">Mass</option><option value="temperature">Temperature</option><option value="time">Time</option>
      </select>
      <div data-island="conversion" data-island-size="fixed" className="grid grid-cols-[1fr_34px_1fr] items-stretch gap-2">
        <div ref={inputRef} className={`${panelClass} px-3 py-2`}><span className="font-mono text-[8px] uppercase text-neutral-700">Input</span><input type="number" value={data.value} onChange={(event) => onChange({ ...data, value: Number(event.target.value) })} className={`${numericClass} mt-1 w-full text-xl font-bold`} /><select value={data.from} onChange={(event) => onChange({ ...data, from: event.target.value })} className="mt-1 w-full bg-transparent font-mono text-[9px] text-neutral-500 outline-none">{units.map((unit) => <option key={unit}>{unit}</option>)}</select></div>
        <button type="button" aria-label="Swap units" onClick={() => onChange({ ...data, from: data.to, to: data.from })} className="flex items-center justify-center text-neutral-600 transition-transform hover:rotate-180 hover:text-emerald-300"><ArrowLeftRight size={14} /></button>
        <div ref={outputRef} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.055] px-3 py-2"><span className="font-mono text-[8px] uppercase text-emerald-500/50">Output</span><div className="mt-1 flex items-center"><strong className="min-w-0 flex-1 truncate font-mono text-xl text-emerald-200">{formatted}</strong><button type="button" aria-label="Copy output" onClick={copy} className="text-emerald-500/50 hover:text-emerald-300">{copied ? <Check size={11} /> : <Copy size={11} />}</button></div><select value={data.to} onChange={(event) => onChange({ ...data, to: event.target.value })} className="mt-1 w-full bg-transparent font-mono text-[9px] text-emerald-500/60 outline-none">{units.map((unit) => <option key={unit}>{unit}</option>)}</select></div>
      </div>
      <div data-island="precision" data-island-size="width" className="mt-auto flex items-center justify-between border-t gp-hairline pt-2">
        <span className="font-mono text-[9px] text-neutral-700">1 {data.from} = {Number(convertUnit({ ...data, value: 1 }).toFixed(6))} {data.to}</span>
        <label className="font-mono text-[8px] uppercase text-neutral-700">Precision <input type="number" min={0} max={8} value={data.precision} onChange={(event) => onChange({ ...data, precision: clamp(Number(event.target.value), 0, 8) })} className={`${numericClass} w-7 text-right text-[9px] text-neutral-500`} /></label>
      </div>
    </div>
  )
}
