import { Plus, X } from 'lucide-react'
import type { FormulaSheetData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface FormulaSheetWidgetProps {
  data: FormulaSheetData
  onChange: (data: FormulaSheetData) => void
}

/** A quick-reference list of named formulas — name on top, expression below. */
export function FormulaSheetWidget({ data, onChange }: FormulaSheetWidgetProps) {
  const countRef = useFieldAnchor<HTMLSpanElement>('count')

  const setFormula = (id: string, patch: Partial<FormulaSheetData['formulas'][number]>) =>
    onChange({ formulas: data.formulas.map((f) => (f.id === id ? { ...f, ...patch } : f)) })

  const removeFormula = (id: string) =>
    onChange({ formulas: data.formulas.filter((f) => f.id !== id) })

  const addFormula = () =>
    onChange({ formulas: [...data.formulas, { id: crypto.randomUUID(), name: '', expression: '' }] })

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {data.formulas.map((f) => (
          <div key={f.id} className="group/row flex items-center gap-2 rounded-lg border gp-hairline bg-neutral-900/30 px-2 py-1">
            <div className="min-w-0 flex-1">
              <input
                value={f.name}
                placeholder="Name…"
                aria-label="Formula name"
                onChange={(e) => setFormula(f.id, { name: e.target.value })}
                className="w-full bg-transparent text-[11px] font-medium text-indigo-300 outline-none placeholder:text-neutral-700"
              />
              <input
                value={f.expression}
                placeholder="a² + b² = c²"
                aria-label="Expression"
                onChange={(e) => setFormula(f.id, { expression: e.target.value })}
                className="w-full bg-transparent  text-[12px] text-neutral-200 outline-none placeholder:text-neutral-700"
              />
            </div>
            <button
              type="button"
              aria-label="Remove formula"
              onClick={() => removeFormula(f.id)}
              className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
            >
              <X size={11} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-auto flex h-9 items-center justify-between border-t gp-hairline">
        <button
          type="button"
          onClick={addFormula}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add formula
        </button>
        <span ref={countRef} className=" text-[10px] tabular-nums text-neutral-600">
          {data.formulas.length}
        </span>
      </div>
    </div>
  )
}
