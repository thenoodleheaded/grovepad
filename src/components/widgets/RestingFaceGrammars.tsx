import type {
  RestBar,
  RestCell,
  RestChip,
  RestColumn,
  RestEyebrow,
  RestLane,
  RestLine,
  RestNode,
  RestReadout,
  RestTone,
} from '../../utils/restingFaceModel'

// ---------------------------------------------------------------------------
// The resting-face grammars: one component per shape in restingFaceModel.ts,
// drawn to the exact measurements restingFace.ts used to size the tile (the
// constants are paired by name — change them together).
//
// These are the shapes a folded card borrows from its own open form: a board
// stays a board, a month stays a month, a tape stays a tape. Every one of them
// is static DOM built from an already-bounded model — no hooks, no timers, no
// measurement, no interactivity. The whole point is that a hundred folded
// cards on screen cost about as much as a hundred plain divs.
// ---------------------------------------------------------------------------

const TONE_INK: Record<Exclude<RestTone, 'accent'>, string> = {
  neutral: 'rgb(212 212 212)',
  muted: 'rgb(115 115 115)',
  good: 'oklch(78% 0.15 162)',
  warn: 'oklch(80% 0.15 78)',
  bad: 'oklch(70% 0.19 22)',
}

/** One place resolves a semantic tone into ink, so `accent` always means the
 * card's own accent and never a second palette. */
function ink(tone: RestTone | undefined, accent: string): string {
  if (!tone || tone === 'neutral') return TONE_INK.neutral
  if (tone === 'accent') return accent
  return TONE_INK[tone]
}

/** Alpha-suffixed hex works for the `#rrggbb` accents the registry ships; for
 * anything else (oklch, named) we fall back to a plain colour so a skin can
 * never render an invalid `background`. */
function wash(color: string, alpha: string): string {
  return color.startsWith('#') && (color.length === 7 || color.length === 4)
    ? `${color}${alpha}`
    : color
}

export function EyebrowLine({ eyebrow, accent }: { eyebrow: RestEyebrow; accent: string }) {
  return (
    <div className="flex h-[14px] shrink-0 items-center justify-between gap-2 overflow-hidden">
      <span
        className="truncate text-[8px] font-bold uppercase tracking-[0.11em]"
        style={{ color: ink(eyebrow.tone ?? 'accent', accent) }}
      >
        {eyebrow.label}
      </span>
      {eyebrow.note && (
        <span className="shrink-0 text-[8.5px] font-medium tabular-nums text-neutral-500">
          {eyebrow.note}
        </span>
      )}
    </div>
  )
}

/**
 * Lanes of cards. The expanded board's column header — name on the left, its
 * one reading on the right, a tinted rule under both — is exactly what a
 * folded board keeps, because that header IS the board's information.
 */
export function ColumnsFace({ columns, wrap, eyebrow, accent }: {
  columns: readonly RestColumn[]
  wrap?: number
  eyebrow?: RestEyebrow
  accent: string
}) {
  const perRow = Math.max(1, Math.min(wrap ?? columns.length, Math.max(1, columns.length)))
  const bands: RestColumn[][] = []
  for (let index = 0; index < columns.length; index += perRow) {
    bands.push(columns.slice(index, index + perRow))
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-[6px]">
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      {bands.map((band, bandIndex) => (
      <div key={bandIndex} className="flex min-h-0 min-w-0 flex-1 gap-[6px]">
        {band.map((column) => {
          const tint = ink(column.tone ?? 'accent', accent)
          return (
            <section key={column.key} className="flex min-w-0 flex-1 flex-col">
              <header
                className="flex h-[13px] min-w-0 items-center justify-between gap-1 border-b pb-[2px]"
                style={{ borderColor: wash(tint, '3d') }}
              >
                <span
                  className="truncate text-[7.5px] font-bold uppercase tracking-[0.07em]"
                  style={{ color: tint }}
                >
                  {column.label}
                </span>
                {column.note && (
                  <span className="shrink-0 text-[7.5px] font-semibold tabular-nums text-neutral-500">
                    {column.note}
                  </span>
                )}
              </header>
              <div className="flex min-h-0 min-w-0 flex-col gap-[2px] pt-[2px]">
                {column.items.map((item) => (
                  <span
                    key={item.key}
                    className={`flex h-[11px] min-w-0 items-center gap-1 rounded-[3px] px-1 text-[8.5px] leading-[11px] ${
                      item.done ? 'text-neutral-600 line-through decoration-neutral-700' : 'text-neutral-300'
                    }`}
                    style={{ background: 'rgb(255 255 255 / 0.045)' }}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.value && (
                      <span className="shrink-0 text-[7.5px] font-semibold tabular-nums" style={{ color: tint }}>
                        {item.value}
                      </span>
                    )}
                  </span>
                ))}
                {column.overflow > 0 && (
                  <span className="text-[7px] font-medium leading-[10px] text-neutral-600">
                    +{column.overflow}
                  </span>
                )}
              </div>
            </section>
          )
        })}
      </div>
      ))}
    </div>
  )
}

/**
 * A lattice. `dense` is the calendar/heatmap shape — equal square cells whose
 * fill carries the reading; otherwise it is a table, where the first column
 * takes the extra width the way a record's name does on the open card.
 */
export function GridFace({ cols, header, cells, eyebrow, dense, accent }: {
  cols: number
  header?: readonly string[]
  cells: readonly RestCell[]
  eyebrow?: RestEyebrow
  dense?: boolean
  accent: string
}) {
  const template = dense
    ? `repeat(${cols}, minmax(0, 1fr))`
    : `1.5fr ${Array.from({ length: Math.max(0, cols - 1) }, () => '1fr').join(' ')}`

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      {header && header.length > 0 && (
        <div
          className={`grid min-w-0 ${dense ? 'gap-[2px]' : 'gap-x-2'}`}
          style={{ gridTemplateColumns: template }}
        >
          {header.slice(0, cols).map((text, index) => (
            <span
              key={index}
              className={`truncate text-[7.5px] font-bold uppercase tracking-[0.07em] text-neutral-500 ${
                dense ? 'flex h-[15px] items-center justify-center' : 'leading-[14px]'
              }`}
            >
              {text}
            </span>
          ))}
        </div>
      )}
      <div
        className={`grid min-w-0 ${dense ? 'gap-[2px]' : 'gap-x-2'}`}
        style={{ gridTemplateColumns: template }}
      >
        {cells.map((cell) => {
          const tint = ink(cell.tone ?? 'accent', accent)
          if (dense) {
            const filled = cell.fill !== undefined && cell.fill > 0
            return (
              <span
                key={cell.key}
                className="flex h-[15px] min-w-0 items-center justify-center rounded-[4px] text-[8.5px] font-medium tabular-nums"
                style={
                  cell.current
                    ? { background: tint, color: '#0a0a0a', fontWeight: 700 }
                    : filled
                      ? { background: wash(tint, '00'), backgroundColor: tint, opacity: 0.22 + cell.fill! * 0.7, color: '#0a0a0a' }
                      : cell.tone === 'muted'
                        ? { color: 'rgb(82 82 82)' }
                        : { background: 'rgb(255 255 255 / 0.045)', color: ink(cell.tone, accent) }
                }
              >
                {cell.text}
              </span>
            )
          }
          return (
            <span
              key={cell.key}
              className="truncate text-[9.5px] leading-[14px] tabular-nums"
              style={{ color: cell.tone ? tint : 'rgb(212 212 212)' }}
            >
              {cell.text}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Labelled tracks. The bar is the row's own background, so the label keeps
 * the full width instead of being squeezed beside a separate meter. */
export function BarsFace({ bars, eyebrow, accent }: {
  bars: readonly RestBar[]
  eyebrow?: RestEyebrow
  accent: string
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      <div className="flex min-w-0 flex-col justify-center gap-[2px]">
        {bars.map((bar) => {
          const tint = ink(bar.tone ?? 'accent', accent)
          return (
            <span
              key={bar.key}
              className="relative flex h-[14px] min-w-0 items-center overflow-hidden rounded-[4px] px-1.5"
              style={{ background: 'rgb(255 255 255 / 0.05)' }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-[4px]"
                style={{
                  width: `${Math.max(2, bar.fraction * 100)}%`,
                  background: tint,
                  opacity: 0.3,
                }}
              />
              <span className="relative min-w-0 flex-1 truncate text-[9px] leading-[14px] text-neutral-200">
                {bar.label}
              </span>
              <span
                className="relative shrink-0 pl-1.5 text-[9px] font-semibold leading-[14px] tabular-nums"
                style={{ color: tint }}
              >
                {bar.value}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** A dial. The ring states the proportion, the text states the exact reading —
 * the same division of labour the open card's hero uses. */
export function GaugeFace({ progress, primary, secondary, caption, tone, eyebrow, accent }: {
  progress: number
  primary: string
  secondary: string
  caption?: string
  tone?: RestTone
  eyebrow?: RestEyebrow
  accent: string
}) {
  const tint = ink(tone ?? 'accent', accent)
  const circumference = 2 * Math.PI * 19
  const dial = (
    <div className="flex w-full min-w-0 items-center gap-2.5">
      <svg width="46" height="46" viewBox="0 0 46 46" className="shrink-0 -rotate-90" aria-hidden>
        <circle cx="23" cy="23" r="19" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="5" />
        <circle
          cx="23"
          cy="23"
          r="19"
          fill="none"
          stroke={tint}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(progress * circumference).toFixed(2)} ${circumference.toFixed(2)}`}
        />
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate text-[15px] font-semibold leading-none tabular-nums text-neutral-50">
          {primary}
        </span>
        <span className="truncate text-[8px] font-medium uppercase tracking-[0.1em] text-neutral-500">
          {secondary}
        </span>
        {caption && (
          <span className="truncate text-[8.5px] leading-none" style={{ color: tint }}>
            {caption}
          </span>
        )}
      </div>
    </div>
  )

  if (!eyebrow) return dial
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <EyebrowLine eyebrow={eyebrow} accent={accent} />
      <div className="flex min-h-0 flex-1 items-center">{dial}</div>
    </div>
  )
}

/** Pills. Filled ones are the chosen/active values, outlined ones the rest —
 * the same reading a segmented control or a tag row gives when open. */
export function ChipsFace({ chips, overflow, eyebrow, accent }: {
  chips: readonly RestChip[]
  overflow: number
  eyebrow?: RestEyebrow
  accent: string
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      <div className="flex min-w-0 flex-1 flex-wrap content-center gap-[4px]">
        {chips.map((chip) => {
          const tint = ink(chip.tone ?? 'accent', accent)
          return (
            <span
              key={chip.key}
              className="flex h-[17px] max-w-full items-center truncate rounded-full px-[6px] text-[9px] font-medium leading-[17px]"
              style={chip.filled
                ? { background: wash(tint, '2e'), color: tint, boxShadow: `inset 0 0 0 1px ${wash(tint, '55')}` }
                : { color: 'rgb(163 163 163)', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.1)' }}
            >
              {chip.text}
            </span>
          )
        })}
        {overflow > 0 && (
          <span className="flex h-[17px] items-center text-[8px] font-medium text-neutral-600">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  )
}

/** A ledger: entry on the left, its value right-aligned, an optional ruled
 * total underneath. Calculator tapes, terminals, and histories all read this
 * way, and the right-alignment is what makes the column of numbers scannable. */
export function LinesFace({ lines, eyebrow, total, accent }: {
  lines: readonly RestLine[]
  eyebrow?: RestEyebrow
  mono?: boolean
  total?: RestLine
  accent: string
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {lines.map((line) => (
          <span key={line.key} className="flex h-[13px] min-w-0 items-center gap-3">
            <span
              className={`min-w-0 flex-1 truncate text-[9.5px] leading-[13px] ${line.dim ? 'text-neutral-600' : ''}`}
              style={line.dim ? undefined : { color: ink(line.tone, accent) }}
            >
              {line.left}
            </span>
            {line.right !== undefined && (
              <span
                className="shrink-0 text-[9.5px] font-semibold leading-[13px] tabular-nums"
                style={{ color: line.tone ? ink(line.tone, accent) : 'rgb(229 229 229)' }}
              >
                {line.right}
              </span>
            )}
          </span>
        ))}
      </div>
      {total && (
        <span className="mt-[4px] flex h-[13px] min-w-0 items-center gap-3 border-t border-white/[0.09] pt-[4px]">
          <span className="min-w-0 flex-1 truncate text-[8px] font-bold uppercase tracking-[0.09em] text-neutral-500">
            {total.left}
          </span>
          <span
            className="shrink-0 text-[11px] font-semibold leading-none tabular-nums"
            style={{ color: ink(total.tone ?? 'accent', accent) }}
          >
            {total.right}
          </span>
        </span>
      )}
    </div>
  )
}

/** Connected nodes. The connector carries the meaning: one arrow for a
 * forward link, two for a doubly-linked one, a returning arrow for a ring. */
export function ChainFace({ nodes, shape, overflow, eyebrow, accent }: {
  nodes: readonly RestNode[]
  shape: 'linear' | 'doubly' | 'circular' | 'stack'
  overflow: number
  eyebrow?: RestEyebrow
  accent: string
}) {
  if (shape === 'stack') {
    return (
      <div className="flex h-full w-full min-w-0 flex-col">
        {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {nodes.map((node, index) => (
            <span key={node.key} className="flex h-4 min-w-0 items-center gap-1.5">
              <span aria-hidden className="relative flex h-4 w-[8px] shrink-0 items-center justify-center">
                <span
                  className="h-[5px] w-[5px] rounded-full"
                  style={{ background: node.current ? accent : 'rgb(255 255 255 / 0.28)' }}
                />
                {index < nodes.length - 1 && (
                  <span
                    className="absolute left-1/2 top-[11px] h-[5px] w-px -translate-x-1/2"
                    style={{ background: 'rgb(255 255 255 / 0.16)' }}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] leading-4 text-neutral-200">
                {node.label}
              </span>
              {node.caption && (
                <span className="shrink-0 text-[8.5px] leading-4 tabular-nums text-neutral-500">
                  {node.caption}
                </span>
              )}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[8px] font-medium leading-[14px] text-neutral-600">
              +{overflow} more
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      <div className="relative flex min-h-0 flex-1 items-center">
        {nodes.map((node, index) => (
          <span key={node.key} className="flex shrink-0 items-center">
            {index > 0 && (
              <span
                aria-hidden
                className="flex w-[12px] shrink-0 items-center justify-center text-[8px] leading-none"
                style={{ color: 'rgb(255 255 255 / 0.32)' }}
              >
                {shape === 'doubly' ? '⇄' : '→'}
              </span>
            )}
            <span
              className="flex h-[30px] w-[46px] shrink-0 flex-col justify-center gap-[1px] overflow-hidden rounded-[5px] px-1"
              style={{
                background: 'rgb(255 255 255 / 0.045)',
                boxShadow: node.current
                  ? `inset 0 0 0 1px ${wash(accent, '77')}`
                  : 'inset 0 0 0 1px rgb(255 255 255 / 0.07)',
              }}
            >
              <span className="truncate text-[9px] font-medium leading-[11px] text-neutral-200">
                {node.label}
              </span>
              {node.caption && (
                <span className="truncate text-[7px] uppercase leading-[9px] tracking-[0.06em] text-neutral-500">
                  {node.caption}
                </span>
              )}
            </span>
          </span>
        ))}
        {overflow > 0 && (
          <span className="flex shrink-0 items-center pl-[12px] text-[8px] font-medium text-neutral-600">
            +{overflow}
          </span>
        )}
        {shape === 'circular' && (
          <span
            aria-hidden
            className="absolute inset-x-2 bottom-[-6px] h-[6px] rounded-b-[5px] border-b border-l border-r border-dashed"
            style={{ borderColor: wash(accent, '55') }}
          />
        )}
      </div>
    </div>
  )
}

/** Spans on a shared scale. The bar's position is the information — a phase
 * that starts late must look late, not merely say so. */
export function TimelineFace({ units, lanes, eyebrow, accent }: {
  units: number
  lanes: readonly RestLane[]
  eyebrow?: RestEyebrow
  accent: string
}) {
  const total = Math.max(1, units)
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      <div className="flex h-[10px] min-w-0 items-end gap-2 pl-[calc(34%+8px)]">
        <span
          aria-hidden
          className="flex h-[4px] w-full"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, rgb(255 255 255 / 0.14) 0 1px, transparent 1px ${(100 / total).toFixed(3)}%)`,
          }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {lanes.map((lane) => {
          const tint = ink(lane.tone ?? 'accent', accent)
          return (
            <span key={lane.key} className="flex h-[15px] min-w-0 items-center gap-2">
              <span
                className={`w-[34%] shrink-0 truncate text-[9px] leading-[15px] ${
                  lane.done ? 'text-neutral-600 line-through decoration-neutral-700' : 'text-neutral-300'
                }`}
              >
                {lane.label}
              </span>
              <span className="relative h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                <span
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${Math.min(97, (lane.start / total) * 100)}%`,
                    width: `${Math.max(3, Math.min(100 - (lane.start / total) * 100, (lane.span / total) * 100))}%`,
                    background: tint,
                    opacity: lane.done ? 0.42 : 0.9,
                  }}
                />
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Two readings that only mean something beside each other: a before and an
 * after, two players' clocks, the two sides of a ratio. */
export function SplitFace({ left, right, divider, eyebrow, accent }: {
  left: RestReadout
  right: RestReadout
  divider?: string
  eyebrow?: RestEyebrow
  accent: string
}) {
  const side = (readout: RestReadout, align: string) => (
    <div className={`flex min-w-0 flex-1 flex-col gap-[2px] ${align}`}>
      <span
        className="truncate text-[15px] font-semibold leading-none tabular-nums"
        style={{ color: readout.tone ? ink(readout.tone, accent) : 'rgb(250 250 250)' }}
      >
        {readout.primary}
      </span>
      <span className="truncate text-[8px] font-medium uppercase tracking-[0.1em] text-neutral-500">
        {readout.secondary}
      </span>
    </div>
  )
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center">
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {side(left, 'items-start text-left')}
        <span className="shrink-0 text-[10px] font-medium leading-none text-neutral-600">
          {divider ?? '·'}
        </span>
        {side(right, 'items-end text-right')}
      </div>
    </div>
  )
}

const PAPER_PATTERNS: Record<string, string | undefined> = {
  plain: undefined,
  grid: 'linear-gradient(rgb(255 255 255 / 0.055) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.055) 1px, transparent 1px)',
  dots: 'radial-gradient(rgb(255 255 255 / 0.13) 1px, transparent 1px)',
  board: undefined,
  frames: undefined,
}

/** A drawing surface keeps its own ruling — squared paper stays squared — with
 * a bounded, already-simplified ink preview laid over it. Never the live
 * canvas: a folded sketch mounts no drawing surface at all. */
export function PaperFace({ pattern, strokes, frames, eyebrow, accent }: {
  pattern: 'plain' | 'grid' | 'dots' | 'board' | 'frames'
  strokes: readonly string[]
  frames?: number
  eyebrow?: RestEyebrow
  accent: string
}) {
  const board = pattern === 'board'
  const ruled = PAPER_PATTERNS[pattern]
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[10px] px-2 py-1.5"
      style={{ background: board ? 'rgb(245 245 245 / 0.055)' : 'rgb(0 0 0 / 0.16)' }}
    >
      {eyebrow && <EyebrowLine eyebrow={eyebrow} accent={accent} />}
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[6px]"
        style={ruled ? { backgroundImage: ruled, backgroundSize: pattern === 'dots' ? '9px 9px' : '11px 11px' } : undefined}
      >
        {pattern === 'frames' && (
          <span aria-hidden className="absolute inset-0 flex gap-[3px]">
            {Array.from({ length: Math.max(1, Math.min(4, frames ?? 3)) }, (_, index) => (
              <span
                key={index}
                className="h-full min-w-0 flex-1 rounded-[4px]"
                style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.1)' }}
              />
            ))}
          </span>
        )}
        {strokes.length > 0 && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            {strokes.map((path, index) => (
              <path
                key={index}
                d={path}
                fill="none"
                stroke={board ? 'rgb(38 38 38)' : accent}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={board ? 0.85 : 0.9 - index * 0.08}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}
