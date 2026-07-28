import { memo, useEffect, useMemo, useState } from 'react'
import { Check, Star } from 'lucide-react'
import type { MediaData, Widget } from '../../types/spatial'
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
  type RestEyebrow,
  type RestNoteModel,
  type RestingFaceModel,
  type RestRow,
} from '../../utils/restingFace'
import {
  BarsFace,
  ChainFace,
  ChipsFace,
  ColumnsFace,
  EyebrowLine,
  GaugeFace,
  GridFace,
  LinesFace,
  PaperFace,
  SplitFace,
  TimelineFace,
} from './RestingFaceGrammars'

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

/**
 * Two-dimensional grammars fill their tile rather than sitting centred in it:
 * a board's columns, a month's weeks, and a timeline's scale all mean "the
 * whole box", and their measured heights in restingFace.ts already include the
 * 12/10 padding applied here.
 */
const STRETCH_FACES = new Set<RestingFaceModel['kind']>([
  'columns', 'grid', 'bars', 'chips', 'lines', 'chain', 'timeline', 'split',
])

/** Faces that already carry a lattice, a scale, or a ruling of their own. */
const SELF_RULED_FACES = new Set<RestingFaceModel['kind']>([
  'grid', 'columns', 'timeline', 'paper', 'chart', 'bars',
])

/** The presentation dresses that paint a background rather than set type. */
const PAINTED_DRESSES = new Set(['grid', 'matrix', 'map', 'timeline'])

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
function ChartFace({ widget, accent, stats, plotted }: {
  widget: Widget
  accent: string
  stats: readonly { label: string; value: string }[]
  /** Given when the model carries its own readings — a card that keeps a
   * history rather than the Chart family's bars/points/segments. */
  plotted?: readonly number[]
}) {
  // A supplied series is always a line: it is a history, and a history's shape
  // over time is the whole reason to draw it.
  const mode = plotted ? 'line' : (widget.data as { mode?: string })?.mode ?? 'bar'
  const gradientId = `gp-rest-chart-${widget.id}`

  const face = useMemo(() => {
    const series = plotted
      ? plotted.map((value) => ({ value }))
      : chartSeries(widget.data)
    const values = series.map((point) => point.value)
    if (mode === 'donut' || mode === 'pie') {
      return { kind: 'ring' as const, segments: donutSegments(series) }
    }
    if (mode === 'line') {
      return { kind: 'line' as const, path: sparklinePath(values, SPARK_WIDTH, SPARK_HEIGHT) }
    }
    const gap = series.length > 0 ? Math.max(2, (SPARK_WIDTH / series.length) * 0.34) : 2
    return { kind: 'bars' as const, bars: sparklineBars(series, SPARK_WIDTH, SPARK_HEIGHT, gap) }
  }, [mode, plotted, widget.data])

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

const ROW_TONE_INK: Record<string, string> = {
  muted: 'rgb(115 115 115)',
  good: 'oklch(78% 0.15 162)',
  warn: 'oklch(80% 0.15 78)',
  bad: 'oklch(70% 0.19 22)',
}

/** Real item rows: completion glyph when the item has one, trailing value
 * when the item carries a number. "N items" never appears — the items do. */
function RowsFace({ rows, overflow, accent, eyebrow, meter }: {
  rows: readonly RestRow[]
  overflow: number
  accent: string
  eyebrow?: RestEyebrow
  meter?: number
}) {
  const completable = rows.filter((row) => row.done !== undefined)
  const done = completable.filter((row) => row.done).length

  return (
    <div className="flex w-full min-w-0 flex-col" aria-hidden>
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      {meter !== undefined && (
        <span className="mb-[3px] flex h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <span
            className="h-full rounded-full"
            style={{ width: `${Math.round(meter * 100)}%`, background: accent, opacity: 0.85 }}
          />
        </span>
      )}
      {rows.map((row) => (
        <span
          key={row.key}
          className="group/rest-row flex h-4 min-w-0 items-center gap-1.5"
          style={row.indent ? { paddingLeft: row.indent * 9 } : undefined}
        >
          {row.lead !== undefined && (
            <span className="shrink-0 text-[8.5px] font-semibold leading-4 tabular-nums text-neutral-500">
              {row.lead}
            </span>
          )}
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
            <span
              className="shrink-0 text-[10px] font-semibold leading-4 tabular-nums text-neutral-300"
              style={row.tone && row.tone !== 'neutral'
                ? { color: row.tone === 'accent' ? accent : ROW_TONE_INK[row.tone] }
                : undefined}
            >
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

const STICKY_REST_COLORS = {
  yellow: '#fcd34d',
  pink: '#f472b6',
  blue: '#38bdf8',
  green: '#34d399',
  purple: '#a78bfa',
} as const

const CALLOUT_REST_TREATMENTS = {
  info: { label: 'Info', color: '#60a5fa' },
  tip: { label: 'Tip', color: '#34d399' },
  warning: { label: 'Warning', color: '#f59e0b' },
  decision: { label: 'Decision', color: '#a78bfa' },
  important: { label: 'Important', color: '#f472b6' },
} as const

const REST_LOG_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

function restLogDate(raw?: string): string {
  if (!raw) return 'Daily log'
  const parsed = new Date(`${raw}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? 'Daily log' : REST_LOG_DATE_FORMATTER.format(parsed)
}

/**
 * A fixed-ceiling reading of the Note body. The model has already reduced
 * arbitrary writing to five lines, so every branch below has the same small,
 * predictable DOM cost.
 */
function NotePreviewLines({
  model,
  className = '',
}: {
  model: RestNoteModel
  className?: string
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-[2px] ${className}`}>
      {model.lines.map((line, index) => {
        if (line.kind === 'rule') {
          return <span key={index} className="my-[3px] h-px w-full bg-current opacity-15" />
        }
        if (line.kind === 'bullet') {
          return (
            <span key={index} className="flex min-w-0 items-center gap-1.5 text-[9.5px] leading-[12px] text-neutral-300">
              <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-current opacity-65" />
              <span className="truncate">{line.text}</span>
            </span>
          )
        }
        if (line.kind === 'heading') {
          return (
            <strong key={index} className="truncate text-[11.5px] font-semibold leading-[14px] text-neutral-100">
              {line.text}
            </strong>
          )
        }
        if (line.kind === 'quote') {
          return (
            <span key={index} className="truncate border-l border-current pl-1.5 text-[9.5px] italic leading-[13px] text-neutral-400">
              {line.text}
            </span>
          )
        }
        if (line.kind === 'code') {
          return (
            <code key={index} className="truncate rounded-[3px] bg-black/25 px-1 py-px text-[8px] leading-[11px] text-neutral-300">
              {line.text}
            </code>
          )
        }
        return (
          <span key={index} className="truncate text-[10px] leading-[14px] text-neutral-300">
            {line.text}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Eight compact editorial arrangements, each borrowing the same visual
 * grammar as its expanded Note skin. These are intentionally plain DOM and
 * gradients: no textarea, Markdown renderer, layout measurement, animation,
 * or effect is mounted while a card rests.
 */
function NoteFace({ model, accent }: { model: RestNoteModel; accent: string }) {
  if (model.skin === 'sticky') {
    const color = STICKY_REST_COLORS[model.color ?? 'yellow']
    return (
      <div
        data-rest-note-skin="sticky"
        className="relative flex h-full w-full overflow-hidden rounded-[10px] px-3 pb-2 pt-3"
        style={{
          color,
          background: `linear-gradient(145deg, ${color}22, ${color}0a 68%, transparent)`,
          boxShadow: `inset 0 0 0 1px ${color}20`,
        }}
      >
        <span
          aria-hidden
          className="absolute left-1/2 top-[3px] h-[4px] w-9 -translate-x-1/2 rounded-full"
          style={{ background: `${color}55` }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-3 bottom-2 top-4 opacity-25"
          style={{
            backgroundImage: `repeating-linear-gradient(180deg, transparent 0 13px, ${color} 13px 14px)`,
          }}
        />
        <NotePreviewLines model={model} className="relative" />
      </div>
    )
  }

  if (model.skin === 'quote') {
    return (
      <div
        data-rest-note-skin="quote"
        className="relative flex h-full w-full flex-col overflow-hidden px-4 py-2.5 pl-7"
      >
        <span
          aria-hidden
          className="absolute bottom-2.5 left-3 top-6 w-[2px] rounded-full"
          style={{ background: `linear-gradient(${accent}aa, transparent)` }}
        />
        <span
          aria-hidden
          className="absolute left-2 top-0 text-[31px] leading-none opacity-45"
          style={{ color: accent }}
        >
          “
        </span>
        <NotePreviewLines model={model} className="italic" />
        {model.attribution && (
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.09em] text-neutral-500">
            <span aria-hidden className="h-px w-3 shrink-0" style={{ background: `${accent}88` }} />
            <span className="truncate">{model.attribution}</span>
          </span>
        )}
      </div>
    )
  }

  if (model.skin === 'daily_log') {
    return (
      <div data-rest-note-skin="daily_log" className="flex h-full w-full flex-col px-3 py-2.5">
        <div className="flex h-5 items-center gap-1.5 border-b border-white/[0.07] pb-1 text-[8px] font-semibold uppercase tracking-[0.08em]">
          <span aria-hidden className="h-[5px] w-[5px] rounded-full" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
          <span className="truncate" style={{ color: accent }}>{restLogDate(model.date)}</span>
        </div>
        <div className="flex min-h-0 flex-1 gap-2 pt-1.5">
          <span
            aria-hidden
            className="w-px shrink-0 rounded-full"
            style={{ background: `linear-gradient(${accent}99, transparent)` }}
          />
          <NotePreviewLines model={model} />
        </div>
      </div>
    )
  }

  if (model.skin === 'markdown_page') {
    return (
      <div data-rest-note-skin="markdown_page" className="flex h-full w-full flex-col px-3 py-2.5">
        <div className="mb-1.5 flex h-4 items-center justify-between border-b border-white/[0.07] pb-1">
          <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: accent }}>
            Markdown
          </span>
          <span className="rounded-[4px] bg-white/[0.05] px-1.5 py-px text-[7px] text-neutral-500">Read</span>
        </div>
        <NotePreviewLines model={model} />
      </div>
    )
  }

  if (model.skin === 'typewriter') {
    return (
      <div data-rest-note-skin="typewriter" className="flex h-full w-full flex-col px-3 py-2">
        <div className="flex h-4 items-center border-b border-white/[0.07] text-[7.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          Draft
        </div>
        <div className="relative mx-auto flex min-h-0 w-[88%] flex-1 py-1.5">
          <NotePreviewLines model={model} />
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }}
          />
        </div>
      </div>
    )
  }

  if (model.skin === 'callout') {
    const treatment = CALLOUT_REST_TREATMENTS[model.tone ?? 'info']
    return (
      <div
        data-rest-note-skin="callout"
        data-rest-callout-tone={model.tone ?? 'info'}
        className="relative flex h-full w-full flex-col overflow-hidden px-3 py-2.5 pl-4"
        style={{ background: `radial-gradient(85% 90% at 0% 0%, ${treatment.color}18, transparent 72%)` }}
      >
        <span
          aria-hidden
          className="absolute bottom-2 left-2 top-2 w-[2px] rounded-full"
          style={{ background: `linear-gradient(${treatment.color}, ${treatment.color}33)`, boxShadow: `0 0 8px ${treatment.color}66` }}
        />
        <span className="mb-1 text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: treatment.color }}>
          {treatment.label}
        </span>
        <NotePreviewLines model={model} />
      </div>
    )
  }

  if (model.skin === 'versioned_note') {
    return (
      <div data-rest-note-skin="versioned_note" className="flex h-full w-full flex-col px-3 py-2.5">
        <div className="mb-1 flex h-4 items-center justify-between border-b border-white/[0.07] pb-1">
          <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: accent }}>
            Versions
          </span>
          <span aria-hidden className="flex gap-[2px]">
            {[0, 1, 2].map((index) => (
              <span key={index} className="h-[3px] w-[3px] rounded-full" style={{ background: index === 0 ? accent : 'rgb(255 255 255 / 0.12)' }} />
            ))}
          </span>
        </div>
        <NotePreviewLines model={model} />
        {model.versions && model.versions.length > 0 && (
          <div className="mt-1 flex flex-col gap-[2px] border-t border-white/[0.06] pt-1">
            {model.versions.map((version, index) => (
              <span key={`${version}-${index}`} className="flex min-w-0 items-center gap-1.5 text-[7.5px] leading-[11px] text-neutral-500">
                <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full" style={{ background: index === 0 ? accent : 'rgb(255 255 255 / 0.16)' }} />
                <span className="truncate">{version}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      data-rest-note-skin="plain"
      className="relative flex h-full w-full overflow-hidden px-3 py-2.5"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 bottom-2 top-2 opacity-[0.07]"
        style={{ backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 13px, currentColor 13px 14px)' }}
      />
      <NotePreviewLines model={model} className="relative" />
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
  if (model.eyebrow) {
    return (
      <div className="flex h-full w-full min-w-0 flex-col">
        <EyebrowLine eyebrow={model.eyebrow} accent={accent} />
        <div className="flex min-h-0 flex-1 items-center">
          <MetricBody model={model} accent={accent} />
        </div>
      </div>
    )
  }
  return <MetricBody model={model} accent={accent} />
}

function MetricBody({ model, accent }: {
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

/**
 * A boolean reads as the control it is worn as: a switch is thrown to one
 * side, a checkbox is ticked or empty, a power button is lit or dark. The word
 * beside it is the skin's own — "Busy", "To do", "Armed" — so a folded card
 * says what the open one says.
 */
function BooleanFace({ model, accent: cardAccent }: {
  model: Extract<RestingFaceModel, { kind: 'boolean' }>
  accent: string
}) {
  const accent = model.tone && model.tone !== 'accent' && model.tone !== 'neutral'
    ? ROW_TONE_INK[model.tone] ?? cardAccent
    : cardAccent

  if (model.shape === 'checkbox' || model.shape === 'power') {
    const on = model.active
    return (
      <div className="flex w-full min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center ${
            model.shape === 'checkbox' ? 'rounded-[4px]' : 'rounded-full'
          }`}
          style={on
            ? {
              background: `${accent}2e`,
              boxShadow: `inset 0 0 0 1px ${accent}88${model.shape === 'power' ? `, 0 0 8px ${accent}66` : ''}`,
              color: accent,
            }
            : {
              background: 'rgb(255 255 255 / 0.04)',
              boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.14)',
              color: 'rgb(115 115 115)',
            }}
        >
          {model.shape === 'checkbox'
            ? on && <Check size={10} strokeWidth={3.5} />
            : (
              <span
                className="h-[7px] w-[2px] rounded-full"
                style={{ background: 'currentColor', marginTop: -1 }}
              />
            )}
        </span>
        <span className={`min-w-0 truncate text-[11px] font-semibold ${on ? 'text-neutral-50' : 'text-neutral-500'}`}>
          {model.label}
        </span>
      </div>
    )
  }

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

/**
 * The dial's centre: the marks live on the card's own outline (WidgetCard
 * paints them), so the face is just the readout sitting inside them. The
 * non-dial modes keep the same single live readout and hang their own static
 * context — rounds, splits, stages — around it.
 */
function ClockFace({ widget, model, accent }: {
  widget: Widget
  model: Extract<RestingFaceModel, { kind: 'clock' }>
  accent: string
}) {
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
  const readout = (centred: boolean) => (
    <div className={`flex w-full flex-col ${centred ? 'items-center justify-center' : 'items-start'}`}>
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

  if (!model.shape || model.shape === 'dial') return readout(true)

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {model.eyebrow && <EyebrowLine eyebrow={model.eyebrow} accent={accent} />}
      <div className="flex h-[28px] min-w-0 items-center gap-2">
        {model.shape === 'hourglass' && (
          // The falling-sand silhouette, drawn once rather than animated: at
          // rest the shape is the identity, and the number is the reading.
          <span
            aria-hidden
            className="h-[22px] w-[13px] shrink-0"
            style={{
              background: `linear-gradient(180deg, ${accent}66 0 ${Math.round(clock.fraction * 100)}%, transparent ${Math.round(clock.fraction * 100)}%)`,
              clipPath: 'polygon(0 0, 100% 0, 55% 50%, 100% 100%, 0 100%, 45% 50%)',
              boxShadow: `inset 0 0 0 1px ${accent}44`,
            }}
          />
        )}
        {readout(false)}
      </div>
      {model.chips && model.chips.length > 0 && (
        <div className="mt-[4px] flex min-w-0 flex-wrap gap-[4px]">
          {model.chips.map((chip) => (
            <span
              key={chip.key}
              className="flex h-[17px] items-center truncate rounded-full px-[6px] text-[9px] font-medium leading-[17px]"
              style={chip.filled
                ? { background: `${accent}2e`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }
                : { color: 'rgb(115 115 115)', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.1)' }}
            >
              {chip.text}
            </span>
          ))}
        </div>
      )}
      {model.rows && model.rows.length > 0 && (
        <div className="flex min-w-0 flex-col">
          {model.rows.map((row) => (
            <span key={row.key} className="flex h-4 min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[9.5px] leading-4 text-neutral-400">
                {row.label}
              </span>
              {row.value !== undefined && (
                <span
                  className="shrink-0 text-[9.5px] font-semibold leading-4 tabular-nums text-neutral-300"
                  style={row.tone === 'accent' ? { color: accent } : undefined}
                >
                  {row.value}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
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
 * The same ruling the OPEN card wears for this skin, mirrored onto the tile.
 * These are deliberate copies of `08-skin-presentations.css`: graph paper stays
 * squared, a matrix keeps its crosshair, a map keeps its faint contour. Paint
 * only — never layout, so the measured tile is unaffected.
 */
function presentationDress(
  presentation: string | undefined,
  accent: string,
  kind: RestingFaceModel['kind'],
): React.CSSProperties | undefined {
  if (!presentation) return undefined
  // A face that already draws its own lattice must not be ruled a second time:
  // squared paper behind a month grid, or a contour behind a heat map, reads as
  // interference rather than as the card's material.
  if (SELF_RULED_FACES.has(kind) && PAINTED_DRESSES.has(presentation)) return undefined
  const rule = `color-mix(in oklab, ${accent}, transparent 76%)`
  if (presentation === 'grid') {
    return {
      backgroundImage: `linear-gradient(${rule} 1px, transparent 1px), linear-gradient(90deg, ${rule} 1px, transparent 1px)`,
      backgroundSize: '14px 14px',
      backgroundPosition: '-1px -1px',
    }
  }
  if (presentation === 'matrix') {
    return {
      backgroundImage:
        `linear-gradient(90deg, transparent calc(50% - 0.5px), ${rule} 50%, transparent calc(50% + 0.5px)),` +
        `linear-gradient(transparent calc(50% - 0.5px), ${rule} 50%, transparent calc(50% + 0.5px))`,
    }
  }
  if (presentation === 'map') {
    return {
      backgroundImage:
        `radial-gradient(circle at 20% 35%, ${rule} 0 1.5px, transparent 2px),` +
        `radial-gradient(circle at 72% 62%, ${rule} 0 1.5px, transparent 2px),` +
        `linear-gradient(30deg, transparent 48%, ${rule} 49% 51%, transparent 52%)`,
      backgroundSize: '100% 100%, 100% 100%, 24px 24px',
    }
  }
  if (presentation === 'timeline') {
    return {
      backgroundImage: `linear-gradient(transparent, ${accent}, transparent)`,
      backgroundSize: '1px calc(100% - 12px)',
      backgroundPosition: '4px 6px',
      backgroundRepeat: 'no-repeat',
    }
  }
  if (presentation === 'terminal') return { letterSpacing: '-0.015em' }
  if (presentation === 'compact') return { fontSize: '0.94em' }
  if (presentation === 'ledger' || presentation === 'chart' || presentation === 'time') {
    return { fontVariantNumeric: 'tabular-nums' }
  }
  return undefined
}

/**
 * The resting representation of one widget, rendered from the same model that
 * sized the tile. Icon faces render nothing here — the tile itself is the
 * icon (WidgetCard paints it, exactly like the iconified state).
 */
export const WidgetRestingFace = memo(function WidgetRestingFace({ widget }: { widget: Widget }) {
  const def = widgetDefinition(widget.type)
  const accent = widgetAccent(widget, def)
  const { model, presentation } = restingFace(widget)

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
    case 'chart':
      face = <ChartFace widget={widget} accent={accent} stats={model.stats} plotted={model.series} />
      break
    case 'clock': face = <ClockFace widget={widget} model={model} accent={accent} />; break
    case 'stars': face = <StarsFace value={model.value} accent={accent} />; break
    case 'palette': face = <PaletteFace colors={model.colors} />; break
    case 'rows':
      face = (
        <RowsFace
          rows={model.rows}
          overflow={model.overflow}
          accent={accent}
          eyebrow={model.eyebrow}
          meter={model.meter}
        />
      )
      break
    case 'note': face = <NoteFace model={model} accent={accent} />; break
    case 'text': face = <TextFace model={model} accent={accent} />; break
    case 'boolean': face = <BooleanFace model={model} accent={accent} />; break
    case 'metric': face = <MetricFace model={model} accent={accent} />; break
    case 'columns':
      face = <ColumnsFace columns={model.columns} wrap={model.wrap} eyebrow={model.eyebrow} accent={accent} />
      break
    case 'grid':
      face = (
        <GridFace
          cols={model.cols}
          header={model.header}
          cells={model.cells}
          eyebrow={model.eyebrow}
          dense={model.dense}
          accent={accent}
        />
      )
      break
    case 'bars': face = <BarsFace bars={model.bars} eyebrow={model.eyebrow} accent={accent} />; break
    case 'gauge':
      face = (
        <GaugeFace
          progress={model.progress}
          primary={model.primary}
          secondary={model.secondary}
          caption={model.caption}
          tone={model.tone}
          eyebrow={model.eyebrow}
          accent={accent}
        />
      )
      break
    case 'chips':
      face = <ChipsFace chips={model.chips} overflow={model.overflow} eyebrow={model.eyebrow} accent={accent} />
      break
    case 'lines':
      face = (
        <LinesFace
          lines={model.lines}
          eyebrow={model.eyebrow}
          mono={model.mono}
          total={model.total}
          accent={accent}
        />
      )
      break
    case 'chain':
      face = (
        <ChainFace
          nodes={model.nodes}
          shape={model.shape}
          overflow={model.overflow}
          eyebrow={model.eyebrow}
          accent={accent}
        />
      )
      break
    case 'timeline':
      face = <TimelineFace units={model.units} lanes={model.lanes} eyebrow={model.eyebrow} accent={accent} />
      break
    case 'split':
      face = (
        <SplitFace
          left={model.left}
          right={model.right}
          divider={model.divider}
          eyebrow={model.eyebrow}
          accent={accent}
        />
      )
      break
    case 'paper':
      face = (
        <PaperFace
          pattern={model.pattern}
          strokes={model.strokes}
          frames={model.frames}
          eyebrow={model.eyebrow}
          accent={accent}
        />
      )
      break
  }

  return (
    <div
      aria-hidden
      data-rest-summary={model.kind}
      data-rest-presentation={presentation}
      style={presentationDress(presentation, accent, model.kind)}
      className={`pointer-events-none absolute inset-0 flex ${
        model.kind === 'note' || model.kind === 'paper'
          ? 'items-stretch overflow-hidden'
          : STRETCH_FACES.has(model.kind) ||
            ('eyebrow' in model && model.eyebrow !== undefined)
            ? 'items-stretch overflow-hidden px-3 py-[10px]'
            : 'items-center px-3'
      }`}
    >
      {face}
    </div>
  )
})
