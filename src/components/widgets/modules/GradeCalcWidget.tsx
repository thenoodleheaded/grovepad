import { Plus, X } from 'lucide-react'
import type { GradeCalcData } from '../../../types/spatial'

interface GradeCalcWidgetProps {
  data: GradeCalcData
  onChange: (data: GradeCalcData) => void
}

/** Weighted grade: Σ(score × weight) / Σ(weight). */
function computeGrade(components: GradeCalcData['components']): number {
  const totalWeight = components.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0)
  if (totalWeight <= 0) return 0
  const weighted = components.reduce(
    (s, c) => s + (Number.isFinite(c.score) ? c.score : 0) * (Number.isFinite(c.weight) ? c.weight : 0),
    0,
  )
  return weighted / totalWeight
}

export function GradeCalcWidget({ data, onChange }: GradeCalcWidgetProps) {
  const grade = computeGrade(data.components)
  const setComponent = (id: string, patch: Partial<GradeCalcData['components'][number]>) =>
    onChange({ components: data.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  const removeComponent = (id: string) =>
    onChange({ components: data.components.filter((c) => c.id !== id) })

  const addComponent = () =>
    onChange({ components: [...data.components, { id: crypto.randomUUID(), name: '', score: 0, weight: 0 }] })

  const num = (raw: string) => {
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) ? n : 0
  }

  const gradeColor = grade >= 90 ? 'text-emerald-400' : grade >= 60 ? 'text-sky-400' : 'text-red-400'

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-center gap-2 px-0.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-600">
        <span className="flex-1">Component</span>
        <span className="w-12 text-right">Score</span>
        <span className="w-12 text-right">Weight</span>
        <span className="w-4" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {data.components.map((c) => (
          <div key={c.id} className="group/row flex h-8 items-center gap-2">
            <input
              value={c.name}
              placeholder="Name…"
              aria-label="Component name"
              onChange={(e) => setComponent(c.id, { name: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-neutral-200 outline-none placeholder:text-neutral-700"
            />
            <input
              type="number"
              value={c.score}
              aria-label={`${c.name || 'Component'} score`}
              onChange={(e) => setComponent(c.id, { score: num(e.target.value) })}
              className="w-12 bg-transparent text-right  text-[11px] text-neutral-300 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <div className="flex w-12 items-center justify-end gap-0.5">
              <input
                type="number"
                value={c.weight}
                aria-label={`${c.name || 'Component'} weight`}
                onChange={(e) => setComponent(c.id, { weight: num(e.target.value) })}
                className="w-9 bg-transparent text-right  text-[11px] text-neutral-400 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[10px] text-neutral-700">%</span>
            </div>
            <button
              type="button"
              aria-label="Remove component"
              onClick={() => removeComponent(c.id)}
              className="w-4 shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
            >
              <X size={11} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <div className="flex h-8 shrink-0 items-center">
        <button
          type="button"
          onClick={addComponent}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add
        </button>
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between border-t gp-hairline">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-600">Grade</span>
        <span className={` text-lg font-bold tabular-nums ${gradeColor}`}>
          {grade.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
