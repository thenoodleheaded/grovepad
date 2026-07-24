import { memo, useMemo } from 'react'
import { WidgetBoundsOverlay } from './WidgetBoundsOverlay'
import { dialTicks } from '../../utils/squircleTicks'
import type { ClockTone } from '../../utils/widgetClock'

// ---------------------------------------------------------------------------
// The dial a timer wears around its own silhouette.
//
// Built on a watch bezel's logic: twelve hour marks, sixty in total when there
// is room, every one a ray from the face's centre so the ring reads as a clock
// rather than as a decorated border (geometry in squircleTicks.ts).
//
// The bezel itself is neutral. A watch face keeps its marks white and spends
// colour on the parts that move — so here the marks stay white and the accent
// paints only the arc that has already elapsed. An untouched timer is therefore
// a quiet ring, not a wall of alarm-red, and starting one has somewhere to go.
//
// Pure paint: geometry is memoised per size, and ticking only re-colours marks.
// ---------------------------------------------------------------------------

/** A watch bezel prints twelve hour marks, whatever its size. */
const HOUR_MARKS = 12
/** Minute marks need room to stay marks instead of becoming a comb. */
const MINUTE_RING_MIN_EDGE = 112

const TONE_COLOR: Record<ClockTone, string> = {
  work: 'oklch(72% 0.17 18)',
  break: 'oklch(80% 0.15 162)',
  neutral: 'var(--gp-widget-accent, oklch(88% 0.31 136))',
}

/** Mark lengths track the face so a 4×4 card and a 2×2 icon read alike. */
function dialMetrics(width: number, height: number) {
  const edge = Math.min(width, height)
  const hourLength = Math.max(5, Math.min(edge * 0.075, 15))
  return {
    inset: Math.max(3, Math.min(edge * 0.035, 7)),
    hourLength,
    minuteLength: hourLength * 0.45,
    // Below this the minute marks would sit a couple of pixels apart, so the
    // small faces show the twelve hours alone — still unmistakably a clock.
    count: edge >= MINUTE_RING_MIN_EDGE ? HOUR_MARKS * 5 : HOUR_MARKS,
  }
}

interface WidgetClockRingProps {
  width: number
  height: number
  radius: number
  /** Share of the phase still remaining, 0–1. */
  fraction: number
  tone?: ClockTone
  running?: boolean
  urgent?: boolean
}

export const WidgetClockRing = memo(function WidgetClockRing({
  width,
  height,
  radius,
  fraction,
  tone = 'neutral',
  running = false,
  urgent = false,
}: WidgetClockRingProps) {
  const ticks = useMemo(() => {
    const metrics = dialMetrics(width, height)
    return dialTicks(
      width,
      height,
      radius,
      metrics.count,
      metrics.inset,
      metrics.hourLength,
      metrics.minuteLength,
      metrics.count / HOUR_MARKS,
    )
  }, [width, height, radius])
  if (ticks.length === 0) return null

  // Elapsed, not remaining: the coloured arc grows clockwise from twelve as
  // the phase runs down, so a full timer shows a bare bezel.
  const elapsed = Math.round((1 - Math.max(0, Math.min(1, fraction))) * ticks.length)
  const color = urgent ? 'oklch(70% 0.2 22)' : TONE_COLOR[tone]

  return (
    // Drawn in the card's own box space, never in pixels: the card's box
    // glides between sizes and a pixel-sized bezel would hang outside it for
    // the length of every glide (see WidgetBoundsOverlay).
    <WidgetBoundsOverlay
      width={width}
      height={height}
      className="gp-clock-ring"
      data-running={running || undefined}
      data-urgent={urgent || undefined}
    >
      {ticks.map((tick) => {
        const spent = tick.index < elapsed
        return (
          <line
            key={tick.index}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={spent ? color : 'currentColor'}
            strokeWidth={tick.hour ? 2 : 1}
            strokeLinecap="round"
            className={spent ? undefined : tick.hour ? 'text-white/70' : 'text-white/25'}
            opacity={spent ? (tick.hour ? 1 : 0.7) : 1}
          />
        )
      })}
    </WidgetBoundsOverlay>
  )
})
