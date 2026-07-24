import { Plus, X } from 'lucide-react'
import type { PlannerTask, WeeklyPlannerData } from '../../../types/spatial'

interface WeeklyPlannerWidgetProps {
  data: WeeklyPlannerData
  onChange: (data: WeeklyPlannerData) => void
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function normalizeDays(days: PlannerTask[][]): PlannerTask[][] {
  if (days.length === 7) return days
  return [...days, ...Array.from({ length: 7 }, () => [] as PlannerTask[])].slice(0, 7)
}

/** Seven-day planner — a light task slot per day, Monday first. */
export function WeeklyPlannerWidget({ data, onChange }: WeeklyPlannerWidgetProps) {
  const days = normalizeDays(data.days)
  // getDay(): 0=Sun..6=Sat → Monday-first index.
  const todayIndex = (new Date().getDay() + 6) % 7
  const doneCount = days.reduce((sum, tasks) => sum + tasks.filter((t) => t.done).length, 0)
  const setDay = (dayIndex: number, tasks: PlannerTask[]) =>
    onChange({ days: days.map((d, i) => (i === dayIndex ? tasks : d)) })

  const setTask = (dayIndex: number, id: string, patch: Partial<PlannerTask>) =>
    setDay(dayIndex, days[dayIndex]!.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const removeTask = (dayIndex: number, id: string) =>
    setDay(dayIndex, days[dayIndex]!.filter((t) => t.id !== id))

  const addTask = (dayIndex: number) =>
    setDay(dayIndex, [...days[dayIndex]!, { id: crypto.randomUUID(), text: '', done: false }])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-end pb-1">
        <span className=" text-[10px] tabular-nums text-neutral-600">
          {doneCount} done this week
        </span>
      </div>
      {days.map((tasks, dayIndex) => {
        const isToday = dayIndex === todayIndex
        return (
          <div
            key={dayIndex}
            className="group/day flex gap-2 border-b gp-hairline py-1 last:border-0"
          >
            <span
              className={`w-8 shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isToday ? 'text-emerald-400' : 'text-neutral-600'
              }`}
            >
              {DAY_NAMES[dayIndex]}
            </span>
            <div className="min-w-0 flex-1">
              {tasks.map((task) => (
                <div key={task.id} className="group/task flex h-6 items-center gap-1.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={task.done}
                    aria-label={task.text || 'Task'}
                    onClick={() => setTask(dayIndex, task.id, { done: !task.done })}
                    className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border text-[8px] transition-colors ${
                      task.done
                        ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-300'
                        : 'border-neutral-600 text-transparent hover:border-neutral-400'
                    }`}
                  >
                    ✓
                  </button>
                  <input
                    value={task.text}
                    placeholder="Task…"
                    aria-label={`${DAY_NAMES[dayIndex]} task`}
                    onChange={(e) => setTask(dayIndex, task.id, { text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTask(dayIndex)
                      }
                    }}
                    className={`min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-neutral-700 ${
                      task.done ? 'text-neutral-600 line-through' : 'text-neutral-200'
                    }`}
                  />
                  <button
                    type="button"
                    aria-label="Remove task"
                    onClick={() => removeTask(dayIndex, task.id)}
                    className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/task:opacity-100 group-hover/task:pointer-events-auto"
                  >
                    <X size={10} aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                aria-label={`Add task to ${DAY_NAMES[dayIndex]}`}
                onClick={() => addTask(dayIndex)}
                className={`flex h-5 items-center gap-1 text-[10px] text-neutral-700 transition-all hover:text-neutral-400 ${
                  tasks.length === 0 ? '' : 'pointer-events-none opacity-0 group-hover/day:opacity-100 group-hover/day:pointer-events-auto'
                }`}
              >
                <Plus size={9} aria-hidden />
                Add
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
