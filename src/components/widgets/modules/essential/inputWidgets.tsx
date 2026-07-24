import { Copy, Minus, Plus } from 'lucide-react'
import type {
  BranchGateData,
  FormulaData,
  FormulaOperator,
  NumberInputData,
  TextInputData,
  ToggleData,
} from '../../../../types/spatial'
import { WidgetPanel } from '../../WidgetPanel'
import { SmallAction } from './shared'
import { inputClass, numericClass, panelClass, finite, clamp } from './sharedPrimitives'

/** Input and logic widgets: TextInput, NumberInput, Toggle, BranchGate, Formula. Extracted verbatim from EssentialWidgets.tsx. */
export function TextInputWidget({
  data,
  onChange,
}: {
  data: TextInputData
  onChange: (data: TextInputData) => void
}) {
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
      <div className="gp-text-input-header flex items-center gap-2">
        <input
          value={data.label}
          placeholder="Label"
          onChange={(event) => onChange({ ...data, label: event.target.value })}
          className="gp-input--bare min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 outline-none"
        />
        <button
          type="button"
          onClick={() => onChange({ ...data, multiline: !data.multiline })}
          className="rounded-md border gp-hairline px-1.5 py-0.5  text-[8px] uppercase text-neutral-600 hover:text-neutral-300"
        >
          {data.multiline ? 'Wrap' : 'Single'}
        </button>
        <span

          title={data.value.trim() ? 'Has a value' : 'Empty'}
          className={`h-1.5 w-1.5 rounded-full ${data.value.trim() ? 'bg-emerald-400' : 'bg-neutral-700'}`}
        />
      </div>
      <div data-island="value" className={`${panelClass} flex min-h-0 flex-1 px-3 py-2`}>
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
  const low = Math.min(finite(data.min), finite(data.max, 100))
  const high = Math.max(finite(data.min), finite(data.max, 100))
  const step = Math.max(0.0001, Math.abs(finite(data.step, 1)))
  const setValue = (value: number) => onChange({ ...data, value: clamp(value, low, high) })

  return (
    <div className="flex h-full flex-col gap-2">
      <input
        aria-label="Number label"
        value={data.label}
        placeholder="Value label"
        onChange={(event) => onChange({ ...data, label: event.target.value })}
        className="gp-input--bare gp-label w-full outline-none"
      />
      <div data-island="value" className={`${panelClass} space-y-2 px-2 py-2`}>
      <div className="flex items-center gap-2">
        <SmallAction label="Decrease" onClick={() => setValue(data.value - step)}>
          <Minus size={12} />
        </SmallAction>
        <input
          aria-label="Number value"
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
        aria-label="Number value slider"
        type="range"
        min={low}
        max={high}
        step={step}
        value={clamp(data.value, low, high)}
        onChange={(event) => setValue(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-sky-400"
      />
      </div>
      <div data-island="bounds" className="gp-number-bounds mt-auto grid grid-cols-3 gap-2 border-t gp-hairline pt-2">
        {(['min', 'max', 'step'] as const).map((key) => (
          <label key={key} className="flex items-center gap-1">
            <span className=" text-[8px] uppercase text-neutral-700">{key}</span>
            <input
              aria-label={`${key[0]?.toUpperCase()}${key.slice(1)} value`}
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
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <input
        aria-label="Toggle label"
        value={data.label}
        placeholder="Condition"
        onChange={(event) => onChange({ ...data, label: event.target.value })}
        className={`${inputClass} text-center text-[14px] font-medium`}
      />
      <div data-island="switch" className={`${panelClass} flex flex-col gap-2 px-3 py-2`}>
      <button

        type="button"
        role="switch"
        aria-label={data.label || 'Toggle value'}
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
        className={`text-center  text-[9px] uppercase tracking-widest ${data.value ? '' : 'text-neutral-600'}`}
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
 * the only title (the old question line is gone). Both outcomes always keep
 * the same geometry; the card switches from columns to a vertical pair when
 * the two-column tier no longer has enough room for functional text.
 */
export function BranchGateWidget({
  data,
  onChange,
}: {
  data: BranchGateData
  onChange: (data: BranchGateData) => void
}) {
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
      // Paired outcomes are pixel-identical siblings forever (the glass
      // symmetry rule): a True button bigger than its False twin is a thumb
      // on the scale, so neither side may be scaled at all.
      <WidgetPanel grip={false} floor="rigid" className="relative min-w-[112px]">
        <button
          type="button"
          aria-pressed={active}
          onClick={() => onChange({ ...data, value: isTrue })}
          className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[inherit] px-1.5 py-1 transition-all ${tone}`}
        >
          <span className=" text-[8px] font-bold uppercase tracking-widest">
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
            className="gp-note-area mt-1 min-h-12 w-full resize-none bg-transparent text-center text-[10px] leading-relaxed text-neutral-400 outline-none placeholder:text-neutral-700"
          />
        </button>
      </WidgetPanel>
    )
  }

  return (
    <div className="gp-branch-gate grid grid-cols-2 gap-2">
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
  const result = formulaResult(data)
  return (
    <div className="flex h-full flex-col gap-3">
      <input
        aria-label="Formula label"
        value={data.label}
        onChange={(event) => onChange({ ...data, label: event.target.value })}
        className="bg-transparent text-center text-[11px] font-medium text-neutral-500 outline-none"
      />
      <div data-island="operands" className="gp-formula-operands grid grid-cols-[1fr_52px_1fr] items-center gap-2">
        {/* Operands are visually equal alternatives — fixed by the symmetry rule. */}
        <label className={`${panelClass} px-2 py-2 text-center`}>
          <span className="block  text-[8px] uppercase text-neutral-700">A</span>
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
        <label className={`${panelClass} px-2 py-2 text-center`}>
          <span className="block  text-[8px] uppercase text-neutral-700">B</span>
          <input
            type="number"
            value={finite(data.b)}
            onChange={(event) => onChange({ ...data, b: Number(event.target.value) })}
            className={`${numericClass} w-full text-center text-lg font-semibold`}
          />
        </label>
      </div>
      <div data-island="result" className="gp-well flex flex-1 items-center justify-between gap-2 px-4 py-2">
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
