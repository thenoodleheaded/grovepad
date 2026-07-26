import { Minus, Plus } from 'lucide-react'
import type {
  BranchGateData,
  NumberInputData,
} from '../../../../types/spatial'
import { WidgetPanel } from '../../WidgetPanel'
import { SmallAction } from './shared'
import { numericClass, panelClass, finite, clamp } from './sharedPrimitives'

/**
 * Input and logic widgets: NumberInput and BranchGate. Extracted verbatim from
 * EssentialWidgets.tsx. Text Input and Formula each moved to their own module
 * when they grew a skin family — see TextInputWidget.tsx and FormulaWidget.tsx.
 */
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
