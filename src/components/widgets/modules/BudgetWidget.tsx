import { Plus, X } from 'lucide-react'
import type { BudgetData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface BudgetWidgetProps {
  data: BudgetData
  onChange: (data: BudgetData) => void
}

// A budget line can't sensibly exceed a trillion; clamping keeps totals
// readable and stops `toFixed`/inputs from spilling into scientific notation.
const AMOUNT_LIMIT = 1e12
const formatMoney = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function BudgetWidget({ data, onChange }: BudgetWidgetProps) {
  const total = data.items.reduce((sum, item) => sum + item.amount, 0)
  const totalRowRef = useFieldAnchor('total')
  const maxAmount = Math.max(...data.items.map((i) => Math.abs(i.amount)), 1)

  const setLabel = (id: string, label: string) =>
    onChange({ ...data, items: data.items.map((item) => (item.id === id ? { ...item, label } : item)) })

  const setAmount = (id: string, raw: string) => {
    const parsed = Number.parseFloat(raw)
    const amount = Number.isFinite(parsed)
      ? Math.max(-AMOUNT_LIMIT, Math.min(AMOUNT_LIMIT, parsed))
      : 0
    onChange({ ...data, items: data.items.map((item) => (item.id === id ? { ...item, amount } : item)) })
  }

  const removeItem = (id: string) =>
    onChange({ ...data, items: data.items.filter((item) => item.id !== id) })

  const addItem = () =>
    onChange({
      ...data,
      items: [...data.items, { id: crypto.randomUUID(), label: '', amount: 0 }],
    })

  return (
    <div data-floor-panel="rows" className="flex h-full flex-col">
      {/* Line items — each row is 40px (1 grid cell) */}
      <div className="flex flex-col">
        {data.items.map((item) => {
          const proportion = maxAmount > 0 ? Math.abs(item.amount) / maxAmount : 0
          return (
            <div key={item.id} className="group/row flex h-10 items-center gap-2 px-1">
              {/* Proportion bar — thin left indicator */}
              <div className="h-5 w-0.5 shrink-0 rounded-full bg-neutral-800">
                <div
                  className="rounded-full bg-teal-500/50 transition-[height] duration-200"
                  style={{ height: `${proportion * 100}%` }}
                />
              </div>

              <input
                data-floor-label
                value={item.label}
                placeholder="Line item…"
                onChange={(e) => setLabel(item.id, e.target.value)}
                className="gp-input gp-input--compact min-w-0 flex-1 text-neutral-200 outline-none placeholder:text-neutral-700"
              />

              <div className="flex shrink-0 items-center gap-0.5">
                <span className="font-mono text-[11px] text-neutral-600 select-none">
                  {data.currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={item.amount}
                  aria-label={`Amount for ${item.label || 'line item'}`}
                  onChange={(e) => setAmount(item.id, e.target.value)}
                  className="gp-input gp-input--compact w-[72px] text-right font-mono text-xs text-neutral-300 outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>

              <button
                type="button"
                aria-label="Remove line item"
                onClick={() => removeItem(item.id)}
                className="shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Add item row — 40px */}
      <div className="flex h-10 items-center">
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} />
          Add item
        </button>
      </div>

      {/* Total row — 40px with strong accent. Field wires for `total`
          anchor here, so the wire points at the figure itself. */}
      <div ref={totalRowRef} className="flex h-10 items-center justify-between border-t gp-hairline">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-600">
          Total
        </span>
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${
            total < 0 ? 'text-red-400' : 'text-teal-400'
          }`}
        >
          {data.currency}
          {formatMoney(total)}
        </span>
      </div>
    </div>
  )
}
