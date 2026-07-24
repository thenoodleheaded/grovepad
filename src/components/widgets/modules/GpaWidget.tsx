import { Plus, X } from 'lucide-react'
import type { GpaData } from '../../../types/spatial'

interface GpaWidgetProps {
  data: GpaData
  onChange: (data: GpaData) => void
}

/** GPA: Σ(credits × points) / Σ(credits). */
function computeGpa(courses: GpaData['courses']): number {
  const totalCredits = courses.reduce((s, c) => s + (Number.isFinite(c.credits) ? c.credits : 0), 0)
  if (totalCredits <= 0) return 0
  const weighted = courses.reduce(
    (s, c) => s + (Number.isFinite(c.credits) ? c.credits : 0) * (Number.isFinite(c.points) ? c.points : 0),
    0,
  )
  return weighted / totalCredits
}

export function GpaWidget({ data, onChange }: GpaWidgetProps) {
  const gpa = computeGpa(data.courses)
  const setCourse = (id: string, patch: Partial<GpaData['courses'][number]>) =>
    onChange({ courses: data.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  const removeCourse = (id: string) =>
    onChange({ courses: data.courses.filter((c) => c.id !== id) })

  const addCourse = () =>
    onChange({ courses: [...data.courses, { id: crypto.randomUUID(), name: '', credits: 3, points: 4 }] })

  const num = (raw: string) => {
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) ? n : 0
  }

  const gpaColor = gpa >= 3.5 ? 'text-emerald-400' : gpa >= 2 ? 'text-sky-400' : 'text-red-400'

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-center gap-2 px-0.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-600">
        <span className="flex-1">Course</span>
        <span className="w-12 text-right">Credits</span>
        <span className="w-12 text-right">Points</span>
        <span className="w-4" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {data.courses.map((c) => (
          <div key={c.id} className="group/row flex h-8 items-center gap-2">
            <input
              value={c.name}
              placeholder="Course…"
              aria-label="Course name"
              onChange={(e) => setCourse(c.id, { name: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-neutral-200 outline-none placeholder:text-neutral-700"
            />
            <input
              type="number"
              value={c.credits}
              aria-label={`${c.name || 'Course'} credits`}
              onChange={(e) => setCourse(c.id, { credits: num(e.target.value) })}
              className="w-12 bg-transparent text-right  text-[11px] text-neutral-300 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <input
              type="number"
              step="0.1"
              value={c.points}
              aria-label={`${c.name || 'Course'} grade points`}
              onChange={(e) => setCourse(c.id, { points: num(e.target.value) })}
              className="w-12 bg-transparent text-right  text-[11px] text-neutral-400 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              aria-label="Remove course"
              onClick={() => removeCourse(c.id)}
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
          onClick={addCourse}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} aria-hidden />
          Add course
        </button>
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between border-t gp-hairline">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-600">GPA</span>
        <span className={` text-lg font-bold tabular-nums ${gpaColor}`}>
          {gpa.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
