import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { CounterData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { COUNTER_STEP_LIMIT, safeCounterStep } from '../../../utils/widgetValueValidation'

interface CounterWidgetProps {
  data: CounterData
  onChange: (data: CounterData) => void
}

function safeCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(Number.MIN_SAFE_INTEGER, Math.round(value)))
}

/** A tally counter — one label, one number, step-adjustable ± buttons. */
export function CounterWidget({ data, onChange }: CounterWidgetProps) {
  const step = safeCounterStep(data.step)
  // Field wires for `count` anchor to the number row, not the card edge slot.
  const countRowRef = useFieldAnchor('count')

  const nudge = (delta: number) => onChange({ ...data, count: safeCount(data.count + delta) })
  const reset = () => onChange({ ...data, count: 0 })

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <input
        value={data.label}
        placeholder="What are you counting?"
        aria-label="Counter label"
        onChange={(e) => onChange({ ...data, label: e.target.value })}
        className="gp-input--bare w-full text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
      />

      <div ref={countRowRef} className="flex flex-1 items-center justify-center gap-4">
        <button
          type="button"
          aria-label={`Decrease by ${step}`}
          onClick={() => nudge(-step)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border gp-hairline bg-neutral-800/40 text-neutral-400 transition-all hover:scale-110 hover:border-neutral-500 hover:text-neutral-200 active:scale-95"
        >
          <Minus size={15} aria-hidden />
        </button>
        <span key={data.count} className="gp-pop gp-hero min-w-[3ch] text-center ">{data.count}</span>
        <button
          type="button"
          aria-label={`Increase by ${step}`}
          onClick={() => nudge(step)}
          className="flex h-10 w-10 shrink-0 items-center justify-center !rounded-full border transition-all hover:scale-110 active:scale-95"
          style={{
            borderColor: 'color-mix(in oklab, var(--gp-widget-accent), transparent 70%)',
            background: 'color-mix(in oklab, var(--gp-widget-accent), transparent 88%)',
            color: 'var(--gp-widget-accent)',
          }}
        >
          <Plus size={15} aria-hidden />
        </button>
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between gap-2 text-[11px] text-neutral-600">
        <label className="flex items-center gap-1.5">
          Step
          <input
            type="number"
            min={1}
            max={COUNTER_STEP_LIMIT}
            step={1}
            value={data.step}
            aria-label="Step size"
            onChange={(e) => onChange({ ...data, step: safeCounterStep(Number(e.target.value)) })}
            className="gp-input--bare w-24  text-neutral-300 outline-none"
          />
        </label>
        <button
          type="button"
          aria-label="Reset counter"
          onClick={reset}
          className="flex items-center gap-1 transition-colors hover:text-neutral-300"
        >
          <RotateCcw size={10} aria-hidden />
          Reset
        </button>
      </div>
    </div>
  )
}
