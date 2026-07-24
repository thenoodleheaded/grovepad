import { memo, useEffect, useMemo, useState } from 'react'
import { Check, Star } from 'lucide-react'
import type { CalendarData, MediaData, Widget } from '../../types/spatial'
import { widgetDefinition } from '../../widgets/registry'
import { widgetAccent } from '../../utils/widgetSkins'
import {
  donutSegments,
  sparklineBars,
  sparklinePath,
  type SeriesPoint,
} from '../../utils/sparkline'
import { useWidgetClock } from '../../hooks/useWidgetClock'
import {
  restingFace,
  type RestingFaceModel,
  type RestRow,
} from '../../utils/restingFace'

// ---------------------------------------------------------------------------
// Resting faces: the widget's information drawn as itself, inside the exact
// tile restingFace.ts measured for it (the model and the tile are one
// contract — layout constants live there).
//
// Identity (icon + name) stays in the floating title capsule; the face spends
// every pixel on data. Faces are static (drawn from data, never per frame),
// bounded (a fixed node ceiling regardless of data size), and non-interactive
// — except the media image's resting resize handle, which WidgetCard owns.
// ---------------------------------------------------------------------------

const SPARK_WIDTH = 100
const SPARK_HEIGHT = 40

function chartSeries(data: unknown): SeriesPoint[] {
  const rec = data as {
    bars?: readonly { value?: unknown; color?: unknown }[]
    points?: readonly { value?: unknown; color?: unknown }[]
    segments?: readonly { value?: unknown; color?: unknown }[]
  } | null
  const raw = rec?.bars ?? rec?.points ?? rec?.segments ?? []
  const series: SeriesPoint[] = []
  for (const item of raw) {
    if (typeof item?.value !== 'number' || !Number.isFinite(item.value)) continue
    series.push({ value: item.value, color: typeof item.color === 'string' ? item.color : undefined })
  }
  return series
}

/**
 * A real plot filling the tile's height, with the readouts the plot cannot
 * state exactly stacked down a rail on its right. Bars get a faint baseline
 * and the latest column picked out; a line gets a gradient area beneath it —
 * a resting chart should look like a chart, not like a sparkline ornament.
 */
function ChartFace({ widget, accent, stats }: {
  widget: Widget
  accent: string
  stats: readonly { label: string; value: string }[]
}) {
  const mode = (widget.data as { mode?: string })?.mode ?? 'bar'
  const gradientId = `gp-rest-chart-${widget.id}`

  const face = useMemo(() => {
    const series = chartSeries(widget.data)
    const values = series.map((point) => point.value)
    if (mode === 'donut' || mode === 'pie') {
      return { kind: 'ring' as const, segments: donutSegments(series) }
    }
    if (mode === 'line') {
      return { kind: 'line' as const, path: sparklinePath(values, SPARK_WIDTH, SPARK_HEIGHT) }
    }
    const gap = series.length > 0 ? Math.max(2, (SPARK_WIDTH / series.length) * 0.34) : 2
    return { kind: 'bars' as const, bars: sparklineBars(series, SPARK_WIDTH, SPARK_HEIGHT, gap) }
  }, [mode, widget.data])

  return (
    <div className="flex h-full w-full min-w-0 items-stretch gap-2.5">
      {/* A hair of headroom so the tallest mark does not weld itself to the
          tile's edge — the plot needs to sit in the tile, not fill it. */}
      <div className="flex min-w-0 flex-1 items-stretch py-[3px]">
        {face.kind === 'ring' ? (
          <svg viewBox="0 0 32 32" className="h-full w-auto -rotate-90" aria-hidden>
            {face.segments.map((segment, index) => (
              <circle
                key={index}
                cx="16"
                cy="16"
                r="13"
                fill="none"
                stroke={segment.color ?? accent}
                strokeWidth="6"
                strokeDasharray={`${(segment.fraction * 81.68).toFixed(2)} 81.68`}
                strokeDashoffset={(-segment.offset * 81.68).toFixed(2)}
              />
            ))}
          </svg>
        ) : (
          <svg
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.34" />
                <stop offset="100%" stopColor={accent} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Baseline: without it the marks float and the plot loses its
                sense of zero. */}
            <line
              x1="0"
              y1={SPARK_HEIGHT - 0.5}
              x2={SPARK_WIDTH}
              y2={SPARK_HEIGHT - 0.5}
              stroke="currentColor"
              strokeWidth="1"
              className="text-white/10"
              vectorEffect="non-scaling-stroke"
            />
            {face.kind === 'line' ? (
              <>
                {face.path && (
                  <path
                    d={`${face.path} L ${SPARK_WIDTH} ${SPARK_HEIGHT} L 0 ${SPARK_HEIGHT} Z`}
                    fill={`url(#${gradientId})`}
                    stroke="none"
                  />
                )}
                <path
                  d={face.path}
                  fill="none"
                  stroke={accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : (
              face.bars.map((bar, index) => (
                <rect
                  key={index}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx="1"
                  fill={bar.color ?? accent}
                  // The most recent column is the one being read; older ones
                  // recede so the eye lands on it without a label.
                  opacity={index === face.bars.length - 1 ? 1 : 0.42}
                />
              ))
            )}
          </svg>
        )}
      </div>

      {stats.length > 0 && (
        <div className="flex shrink-0 flex-col justify-center gap-2 border-l border-white/[0.07] pl-2.5">
          {stats.map((stat, index) => (
            <div key={stat.label} className="flex flex-col gap-[1px]">
              <span
                className={`leading-none tabular-nums ${
                  index === 0 ? 'text-[14px] font-semibold text-neutral-100' : 'text-[10px] font-medium text-neutral-400'
                }`}
                style={index === 0 ? { color: accent } : undefined}
              >
                {stat.value}
              </span>
              <span className="text-[7px] font-medium uppercase tracking-[0.12em] text-neutral-600">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Local yyyy-mm-dd, matching how CalendarData stores marked dates. */
function localIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** This week and the next as a 7×2 strip — the calendar's honest resting
 * answer to "what's coming up". Today is the accent cell. */
function CalendarWeekFace({ data, accent }: { data: CalendarData; accent: string }) {
  const cells = useMemo(() => {
    const today = new Date()
    const todayKey = localIso(today)
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const marked = new Set(
      Array.isArray(data.markedDates) ? data.markedDates.slice(0, 200) : [],
    )
    return Array.from({ length: 14 }, (_, index) => {
      const day = new Date(monday)
      day.setDate(monday.getDate() + index)
      const key = localIso(day)
      return {
        key,
        label: day.getDate(),
        isToday: key === todayKey,
        isMarked: marked.has(key),
      }
    })
  }, [data.markedDates])

  return (
    <div className="grid w-full grid-cols-7 gap-1" aria-hidden>
      {cells.map((cell) => (
        <span
          key={cell.key}
          className="flex h-5 min-w-0 items-center justify-center rounded-[5px] text-[9px] font-medium tabular-nums"
          style={
            cell.isToday
              ? { background: accent, color: '#0a0a0a', fontWeight: 700 }
              : cell.isMarked
                ? { background: `${accent}26`, color: accent }
                : { color: 'var(--color-neutral-600, #525252)' }
          }
        >
          {cell.label}
        </span>
      ))}
    </div>
  )
}

/** Real item rows: completion glyph when the item has one, trailing value
 * when the item carries a number. "N items" never appears — the items do. */
function RowsFace({ rows, overflow, accent }: {
  rows: readonly RestRow[]
  overflow: number
  accent: string
}) {
  const completable = rows.filter((row) => row.done !== undefined)
  const done = completable.filter((row) => row.done).length

  return (
    <div className="flex w-full min-w-0 flex-col" aria-hidden>
      {rows.map((row) => (
        <span key={row.key} className="group/rest-row flex h-4 min-w-0 items-center gap-1.5">
          {row.done !== undefined && (
            row.done ? (
              <span
                className="flex h-[9px] w-[9px] shrink-0 items-center justify-center rounded-full"
                style={{ background: `${accent}26` }}
              >
                <Check size={7} strokeWidth={4} style={{ color: accent }} />
              </span>
            ) : (
              <span
                className="h-[8px] w-[8px] shrink-0 rounded-full border"
                style={{ borderColor: 'rgb(255 255 255 / 0.22)' }}
              />
            )
          )}
          <span
            className={`min-w-0 flex-1 truncate text-[10px] leading-4 ${
              row.done ? 'text-neutral-600 line-through decoration-neutral-700' : 'text-neutral-200'
            }`}
          >
            {row.label}
          </span>
          {row.value !== undefined && (
            <span className="shrink-0 text-[10px] font-semibold leading-4 tabular-nums text-neutral-300">
              {row.value}
            </span>
          )}
        </span>
      ))}

      {/* One quiet line closes the list: either how much is left over, or how
          far through a checkable list the user is. Never both. */}
      {overflow > 0 ? (
        <span className="flex h-[14px] items-center gap-1 text-[8px] font-medium leading-[14px] text-neutral-600">
          <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-neutral-700" />
          {overflow} more
        </span>
      ) : completable.length > 1 && (
        <span className="mt-[3px] flex h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <span
            className="h-full rounded-full"
            style={{ width: `${(done / completable.length) * 100}%`, background: accent, opacity: 0.85 }}
          />
        </span>
      )}
    </div>
  )
}

/**
 * The widget's own words, wrapped and clamped — never a count of them. A thin
 * accent rail down the left marks it as written content, the way a pull quote
 * is marked, and gives the block an edge to sit against.
 */
function TextFace({ model, accent }: {
  model: Extract<RestingFaceModel, { kind: 'text' }>
  accent: string
}) {
  return (
    <div className="flex w-full min-w-0 items-stretch gap-2">
      <span
        aria-hidden
        className="w-[2px] shrink-0 rounded-full"
        style={{ background: `linear-gradient(180deg, ${model.tint ?? accent}, transparent)` }}
      />
      <span
        className="line-clamp-6 min-w-0 flex-1 text-[10px] leading-[14px] text-neutral-300"
        style={model.tint ? { color: model.tint } : undefined}
      >
        {model.text}
      </span>
    </div>
  )
}

/**
 * A value and what it means. When the data has an honest range, the tile
 * fills behind the number instead of drawing a separate bar: progress reads
 * at a glance from across the board, and the number keeps the whole width.
 */
function MetricFace({ model, accent }: {
  model: Extract<RestingFaceModel, { kind: 'metric' }>
  accent: string
}) {
  return (
    <div className="relative flex w-full min-w-0 items-center">
      {model.progress !== undefined && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-2 left-[-12px] rounded-l-[10px]"
          style={{
            width: `calc(${Math.max(4, model.progress * 100)}% + 12px)`,
            background: `linear-gradient(90deg, ${accent}22, ${accent}0c)`,
            borderRight: `1.5px solid ${accent}`,
          }}
        />
      )}
      <div className="relative flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate text-[16px] font-semibold leading-none tabular-nums text-neutral-50">
          {model.primary}
        </span>
        <span className="truncate text-[8px] font-medium uppercase tracking-[0.1em] text-neutral-500">
          {model.secondary}
        </span>
      </div>
    </div>
  )
}

/** A switch reads as a switch: the track shows which side it is thrown to,
 * lit and glowing when on, dark and inset when off. */
function BooleanFace({ model, accent }: {
  model: Extract<RestingFaceModel, { kind: 'boolean' }>
  accent: string
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="relative flex h-[15px] w-[26px] shrink-0 items-center rounded-full px-[2px] transition-colors"
        style={model.active
          ? { background: `${accent}30`, boxShadow: `inset 0 0 0 1px ${accent}66` }
          : { background: 'rgb(255 255 255 / 0.05)', boxShadow: 'inset 0 1px 2px rgb(0 0 0 / 0.5)' }}
      >
        <span
          className="h-[11px] w-[11px] rounded-full transition-all"
          style={model.active
            ? { background: accent, marginLeft: 11, boxShadow: `0 0 8px ${accent}` }
            : { background: 'rgb(120 120 120)', marginLeft: 0 }}
        />
      </span>
      <span className={`min-w-0 truncate text-[11px] font-semibold ${model.active ? 'text-neutral-50' : 'text-neutral-500'}`}>
        {model.label}
      </span>
    </div>
  )
}

/** The dial's centre: the marks live on the card's own outline (WidgetCard
 * paints them), so the face is just the readout sitting inside them. */
function ClockFace({ widget }: { widget: Widget }) {
  const clock = useWidgetClock(widget)
  if (!clock) return null
  // The number takes the phase colour only while the clock is actually
  // running — the same rule the expanded card follows, so a card cannot read
  // one way at rest and another when opened. An idle dial stays neutral.
  const ink = clock.urgent
    ? 'oklch(70% 0.2 22)'
    : !clock.running
      ? undefined
      : clock.tone === 'work'
        ? 'oklch(72% 0.17 18)'
        : clock.tone === 'break'
          ? 'oklch(80% 0.15 162)'
          : undefined
  return (
    <div className="flex w-full flex-col items-center justify-center">
      <span
        className="text-[17px] font-semibold leading-none tabular-nums text-neutral-100"
        style={ink ? { color: ink } : undefined}
      >
        {clock.readout}
      </span>
      <span className="mt-[3px] text-[7.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        {clock.caption}
      </span>
    </div>
  )
}

function StarsFace({ value, accent }: { value: number; accent: string }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)))
  return (
    <div className="flex w-full items-center gap-1" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={16}
          fill={index < filled ? accent : 'none'}
          style={{ color: index < filled ? accent : 'var(--color-neutral-700, #404040)' }}
        />
      ))}
    </div>
  )
}

function PaletteFace({ colors }: { colors: readonly string[] }) {
  return (
    <div className="flex h-6 w-full overflow-hidden rounded-[6px] bg-black/20 p-0.5" aria-hidden>
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="h-full min-w-0 flex-1 first:rounded-l-[4px] last:rounded-r-[4px]"
          style={{ background: color }}
        />
      ))}
    </div>
  )
}

/** The image itself — no glass, aspect preserved by cover-fit inside the
 * ratio-locked tile. Object URLs for local blobs are owned and revoked here. */
function ImageFace({ data, alt }: { data: MediaData; alt: string }) {
  const [localUrl, setLocalUrl] = useState('')
  useEffect(() => {
    let objectUrl = ''
    let disposed = false
    if (!data.localBlobKey) { setLocalUrl(''); return }
    void import('../../utils/boardDatabase')
      .then(({ readMediaBlob }) => readMediaBlob(data.localBlobKey!))
      .then((blob) => {
        if (blob && !disposed) { objectUrl = URL.createObjectURL(blob); setLocalUrl(objectUrl) }
      })
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [data.localBlobKey])

  const src = localUrl || data.url
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className="h-full w-full rounded-[12px] object-cover"
    />
  )
}

/**
 * The resting representation of one widget, rendered from the same model that
 * sized the tile. Icon faces render nothing here — the tile itself is the
 * icon (WidgetCard paints it, exactly like the iconified state).
 */
export const WidgetRestingFace = memo(function WidgetRestingFace({ widget }: { widget: Widget }) {
  const def = widgetDefinition(widget.type)
  const accent = widgetAccent(widget, def)
  const { model } = restingFace(widget)

  if (model.kind === 'icon') return null
  if (model.kind === 'image') {
    return (
      <div aria-hidden data-rest-summary="image" className="pointer-events-none absolute inset-0">
        <ImageFace data={widget.data as MediaData} alt="" />
      </div>
    )
  }

  let face: React.ReactNode
  switch (model.kind) {
    case 'chart': face = <ChartFace widget={widget} accent={accent} stats={model.stats} />; break
    case 'week': face = <CalendarWeekFace data={widget.data as CalendarData} accent={accent} />; break
    case 'clock': face = <ClockFace widget={widget} />; break
    case 'stars': face = <StarsFace value={model.value} accent={accent} />; break
    case 'palette': face = <PaletteFace colors={model.colors} />; break
    case 'rows': face = <RowsFace rows={model.rows} overflow={model.overflow} accent={accent} />; break
    case 'text': face = <TextFace model={model} accent={accent} />; break
    case 'boolean': face = <BooleanFace model={model} accent={accent} />; break
    case 'metric': face = <MetricFace model={model} accent={accent} />; break
  }

  return (
    <div
      aria-hidden
      data-rest-summary={model.kind}
      className="pointer-events-none absolute inset-0 flex items-center px-3"
    >
      {face}
    </div>
  )
})
