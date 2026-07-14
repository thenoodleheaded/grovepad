import type { MoodTrackerData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface MoodTrackerWidgetProps {
  data: MoodTrackerData
  onChange: (data: MoodTrackerData) => void
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MOODS = ['☀️', '🌤️', '☁️', '🌧️', '⛈️']
const MOOD_RING = [
  'border-emerald-400/60 bg-emerald-400/15',
  'border-lime-400/60 bg-lime-400/15',
  'border-neutral-500/60 bg-neutral-500/15',
  'border-orange-400/60 bg-orange-400/15',
  'border-red-400/60 bg-red-400/15',
]

/** One week of moods — tap a day to cycle through the mood scale. */
export function MoodTrackerWidget({ data, onChange }: MoodTrackerWidgetProps) {
  const days = data.days.length === 7 ? data.days : [...data.days, ...Array(7).fill(null)].slice(0, 7)
  const loggedCount = days.filter((d) => d !== null).length
  const loggedCountRef = useFieldAnchor<HTMLSpanElement>('logged_count')
  const latestMood = [...days].reverse().find((mood) => mood !== null) ?? 2

  const cycleDay = (index: number) => {
    const current = days[index]
    const next = current === null ? 0 : current >= MOODS.length - 1 ? null : current + 1
    onChange({ days: days.map((d, i) => (i === index ? next : d)) })
  }

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-neutral-300">How’s the weather inside?</span>
        <span
          ref={loggedCountRef}
          className="shrink-0 rounded-full border gp-hairline px-2 py-0.5 font-mono text-[10px] tabular-nums text-neutral-500"
        >
          {loggedCount}/7 logged
        </span>
      </div>

      <div className="relative flex min-h-24 items-end justify-center pb-1">
        <div key={latestMood} className="gp-pop absolute left-1/2 top-2 -translate-x-1/2 text-4xl drop-shadow-[0_0_12px_rgba(255,200,90,.2)]">{MOODS[latestMood]}</div>
        <div className="flex w-full items-end justify-between gap-1">
        {days.map((mood, index) => (
          <button
            key={index}
            type="button"
            aria-label={`${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][index]}${mood !== null ? `: ${MOODS[mood]}` : ''}`}
            onClick={() => cycleDay(index)}
            className="flex flex-1 flex-col items-center gap-1"
            style={{transform:`translateY(${Math.abs(3-index)*2}px)`}}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-[14px] transition-all duration-200 ${
                mood !== null
                  ? `scale-105 ${MOOD_RING[mood]}`
                  : 'border-neutral-700 text-neutral-700 hover:border-neutral-500'
              }`}
            >
              {mood !== null ? MOODS[mood] : ''}
            </span>
            <span className="text-[9px] text-neutral-600">{DAY_LABELS[index]}</span>
          </button>
        ))}
        </div>
      </div>
    </div>
  )
}
