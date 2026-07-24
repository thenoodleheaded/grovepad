import { Star } from 'lucide-react'
import type { RatingData } from '../../../types/spatial'

interface RatingWidgetProps {
  data: RatingData
  onChange: (data: RatingData) => void
}

const STARS = [1, 2, 3, 4, 5]

/**
 * Label plus a 5-star rating — click a star to set it, click it again to clear.
 *
 * The whole card is the rating, so the label and stars sit directly on its
 * backplate: a nested island here would be a frame drawn around the only
 * thing the card contains.
 */
export function RatingWidget({ data, onChange }: RatingWidgetProps) {
  const value = Math.min(5, Math.max(0, Math.round(data.value)))
  const setValue = (star: number) => onChange({ ...data, value: star === value ? 0 : star })

  return (
    <div className="gp-bare-field flex h-full flex-col items-center justify-center gap-2.5">
      <input
        value={data.label}
        placeholder="What are you rating?"
        aria-label="Rating label"
        onChange={(e) => onChange({ ...data, label: e.target.value })}
        className="w-full bg-transparent text-center text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
      />
      <div className="flex items-center gap-1.5">
        {STARS.map((star) => {
          const filled = star <= value
          return (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} of 5`}
              aria-pressed={filled}
              onClick={() => setValue(star)}
              className="transition-transform hover:scale-110 active:scale-95"
            >
              <Star
                size={22}
                className={filled ? 'fill-amber-400 text-amber-400' : 'text-neutral-700'}
                strokeWidth={filled ? 0 : 1.5}
                aria-hidden
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
