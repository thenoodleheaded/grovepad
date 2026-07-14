import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface CalendarWidgetProps {
  data: CalendarData
  onChange: (data: CalendarData) => void
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/** Days shown for a Monday-first month grid, including lead-in/lead-out blanks. */
function buildGrid(year: number, month: number): Array<{ day: number; inMonth: boolean; iso: string }> {
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  // getDay(): 0=Sun..6=Sat → shift so Monday is 0.
  const leadIn = (firstOfMonth.getDay() + 6) % 7

  const cells: Array<{ day: number; inMonth: boolean; iso: string }> = []
  for (let i = leadIn - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    cells.push({ day, inMonth: false, iso: isoDate(y, m, day) })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, inMonth: true, iso: isoDate(year, month, day) })
  }
  let nextDay = 1
  const m = month === 11 ? 0 : month + 1
  const y = month === 11 ? year + 1 : year
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay, inMonth: false, iso: isoDate(y, m, nextDay) })
    nextDay++
  }
  return cells
}

/** A month-view mini calendar — click a day to mark it. */
export function CalendarWidget({ data, onChange }: CalendarWidgetProps) {
  const painting=useRef<boolean|null>(null)
  const markedCountRef = useFieldAnchor('marked_count')
  const today = new Date()
  const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate())
  const marked = new Set(data.markedDates)
  const cells = buildGrid(data.year, data.month)

  const shiftMonth = (delta: number) => {
    let month = data.month + delta
    let year = data.year
    if (month < 0) {
      month = 11
      year -= 1
    } else if (month > 11) {
      month = 0
      year += 1
    }
    onChange({ ...data, month, year })
  }

  const toggleDay = (iso: string) => {
    const next = marked.has(iso) ? data.markedDates.filter((d) => d !== iso) : [...data.markedDates, iso]
    onChange({ ...data, markedDates: next })
  }
  const paintDay=(iso:string,value:boolean)=>{const exists=marked.has(iso);if(exists===value)return;onChange({...data,markedDates:value?[...data.markedDates,iso]:data.markedDates.filter(date=>date!==iso)})}

  return (
    <div onPointerUp={()=>{painting.current=null}} onPointerLeave={()=>{painting.current=null}} className="flex h-full flex-col gap-1.5 select-none">
      <div ref={markedCountRef} className="flex shrink-0 items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <ChevronLeft size={13} aria-hidden />
        </button>
        <span className="text-[12px] font-medium text-neutral-200">
          {MONTH_NAMES[data.month]} {data.year}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <ChevronRight size={13} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {DAY_LABELS.map((label, i) => (
          <span key={i} className="text-[9px] font-medium uppercase text-neutral-600">
            {label}
          </span>
        ))}
        {cells.map((cell, i) => {
          const isToday = cell.iso === todayIso
          const isMarked = marked.has(cell.iso)
          return (
            <button
              key={i}
              type="button"
              aria-label={cell.iso}
              aria-pressed={isMarked}
              onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleDay(cell.iso)}}}
              onPointerDown={(event)=>{event.preventDefault();painting.current=!marked.has(cell.iso);paintDay(cell.iso,painting.current)}}
              onPointerEnter={()=>{if(painting.current!==null)paintDay(cell.iso,painting.current)}}
              className="flex items-center justify-center py-0.5"
            >
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] tabular-nums transition-colors ${
                  isMarked
                    ? 'bg-emerald-400/90 font-semibold text-neutral-950'
                    : isToday
                      ? 'border border-emerald-400/60 text-emerald-300'
                      : cell.inMonth
                        ? 'text-neutral-300 hover:bg-neutral-800'
                        : 'text-neutral-700 hover:bg-neutral-800/60'
                }`}
              >
                {cell.day}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
