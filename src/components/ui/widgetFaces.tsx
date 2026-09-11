import type { ReactElement } from 'react'
import type { ModuleType } from '../../types/spatial'
import type { WidgetCategory } from '../../widgets/registry'
import { ATLAS_CATALOG, ATLAS_TYPE_SET, type AtlasType } from '../../widgets/atlasCatalog'

// ---------------------------------------------------------------------------
// Widget faces — the picker's whole visual language.
//
// A widget is drawn as a miniature of its own layout, never as a symbol: three
// ruled lines for Text, ticked boxes for Tasks, a ruled grid for Table, a ring
// for Time. Shape alone says which widget, so the ink can stay neutral and a
// library of a hundred entries reads as one calm page instead of a fruit bowl
// of gradient tiles. Colour is spent once, on the row you are actually on.
//
// Every face is stroked in `currentColor` on a 26x20 field, so a row tints its
// face by setting one colour — no per-face palette to keep in sync.
// ---------------------------------------------------------------------------

/** Two ink weights only. The loud parts carry the shape; the quiet parts are
 *  the filler that makes the shape read as a layout rather than a glyph. */
const DIM = 0.34
const MID = 0.6

function Bar({ x, y, w, o = 1 }: { x: number; y: number; w: number; o?: number }) {
  return <line x1={x} y1={y} x2={x + w} y2={y} opacity={o} />
}

function VBar({ x, y, h, o = 1, w }: { x: number; y: number; h: number; o?: number; w?: number }) {
  return <line x1={x} y1={y} x2={x} y2={y + h} opacity={o} strokeWidth={w} />
}

function Box({
  x, y, w, h, r = 1.8, o = 1, solid,
}: { x: number; y: number; w: number; h: number; r?: number; o?: number; solid?: boolean }) {
  return (
    <rect
      x={x} y={y} width={w} height={h} rx={r} opacity={o}
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
    />
  )
}

function Dot({ x, y, r = 1.3, o = 1 }: { x: number; y: number; r?: number; o?: number }) {
  return <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" opacity={o} />
}

/** Rows of ruled text, the shape most notes-like widgets share. */
function Ruled({ widths, x = 3, top = 6, gap = 4.2 }: { widths: number[]; x?: number; top?: number; gap?: number }) {
  return (
    <>
      {widths.map((w, i) => (
        <Bar key={i} x={x} y={top + i * gap} w={w} o={i === 0 ? 1 : MID} />
      ))}
    </>
  )
}

/** A real five-pointed star, for the one face that should look like a star. */
function star5(cx: number, cy: number, r: number): string {
  const points: string[] = []
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.42
    const angle = (Math.PI / 5) * i - Math.PI / 2
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`)
  }
  return `M${points.join('L')}Z`
}

function star(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`
}

// ---------------------------------------------------------------------------
// The drawings
// ---------------------------------------------------------------------------

const FACES = {
  /** Plain prose. */
  lines: <Ruled widths={[20, 20, 12]} />,

  /** Prose with a speaker gutter — who said it, then what. */
  minutes: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Bar x={3} y={6 + i * 4.2} w={3.4} o={DIM} />
          <Bar x={9} y={6 + i * 4.2} w={14} o={i === 0 ? 1 : MID} />
        </g>
      ))}
    </>
  ),

  /** A dated timeline running down the margin. */
  log: (
    <>
      <VBar x={5} y={3.5} h={13} o={DIM} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Dot x={5} y={6 + i * 4.2} r={1.5} o={i === 0 ? 1 : MID} />
          <Bar x={9.5} y={6 + i * 4.2} w={13} o={i === 0 ? MID : DIM} />
        </g>
      ))}
    </>
  ),

  /** A quotation, and the rule that credits it. */
  cite: (
    <>
      <path
        d="M9.4 3.9c-3.5 0-6.2 2.7-6.2 6 0 2.6 1.9 4.5 4.3 4.5 2.1 0 3.7-1.5 3.7-3.5 0-1.9-1.4-3.3-3.2-3.3-.3 0-.7 0-1 .1.5-1.2 1.6-2.1 3-2.5z"
        fill="currentColor" stroke="none"
      />
      <path
        d="M21 3.9c-3.5 0-6.2 2.7-6.2 6 0 2.6 1.9 4.5 4.3 4.5 2.1 0 3.7-1.5 3.7-3.5 0-1.9-1.4-3.3-3.2-3.3-.3 0-.7 0-1 .1.5-1.2 1.6-2.1 3-2.5z"
        fill="currentColor" stroke="none" opacity={0.5}
      />
      <Bar x={3} y={17.6} w={20} o={DIM} />
    </>
  ),

  bullets: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Dot x={5} y={6 + i * 4.2} r={1.35} o={i === 0 ? 1 : MID} />
          <Bar x={9.5} y={6 + i * 4.2} w={13.5} o={i === 0 ? 1 : MID} />
        </g>
      ))}
    </>
  ),

  /** Levels, each with its own marker — an outline. */
  outline: (
    <>
      <Box x={3} y={4.3} w={3} h={3} r={0.9} solid />
      <Bar x={8.5} y={5.8} w={14.5} />
      <circle cx={9} cy={10} r={1.5} fill="none" opacity={MID} />
      <Bar x={13.5} y={10} w={9.5} o={MID} />
      <Bar x={13.5} y={14.2} w={2} o={DIM} />
      <Bar x={17.5} y={14.2} w={5.5} o={DIM} />
      <VBar x={4.5} y={8} h={6.2} o={DIM} />
    </>
  ),

  checks: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Box x={3} y={3.6 + i * 5.2} w={4.4} h={4.4} r={1.3} o={i === 0 ? 1 : MID} solid={i === 0} />
          <Bar x={10} y={5.8 + i * 5.2} w={13} o={i === 0 ? MID : DIM} />
        </g>
      ))}
    </>
  ),

  /** Numbered steps chained head to tail. */
  steps: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx={5} cy={5.5 + i * 4.6} r={1.9} fill="none" opacity={i === 0 ? 1 : MID} />
          <Bar x={9.5} y={5.5 + i * 4.6} w={13.5} o={i === 0 ? MID : DIM} />
          {i < 2 && <VBar x={5} y={7.6 + i * 4.6} h={2.4} o={DIM} />}
        </g>
      ))}
    </>
  ),

  grid: (
    <>
      <Box x={3} y={4} w={20} h={13} />
      <Bar x={3} y={8.2} w={20} o={MID} />
      <VBar x={9.7} y={8.2} h={8.8} o={DIM} />
      <VBar x={16.4} y={8.2} h={8.8} o={DIM} />
    </>
  ),

  /** A grid with one column already decided. */
  matrix: (
    <>
      <Box x={3} y={4} w={20} h={13} />
      <Bar x={3} y={8.2} w={20} o={MID} />
      <VBar x={9.7} y={8.2} h={8.8} o={DIM} />
      <Box x={16.4} y={8.2} w={6.6} h={8.8} r={0} o={0.9} solid />
    </>
  ),

  /** Rows of stock: a thing, its name, its count. */
  stock: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Box x={3} y={4.6 + i * 4.6} w={3.4} h={3.4} r={1} o={i === 0 ? 1 : MID} solid={i === 0} />
          <Bar x={9} y={6.3 + i * 4.6} w={7.5} o={DIM} />
          <Bar x={19.5} y={6.3 + i * 4.6} w={3.5} o={i === 0 ? 1 : MID} />
        </g>
      ))}
    </>
  ),

  /** Hours booked against days. */
  hours: (
    <>
      <Box x={3} y={4} w={20} h={13} />
      <Bar x={3} y={8.2} w={20} o={MID} />
      {[0, 1].map((i) => (
        <Box key={i} x={16.4} y={8.6 + i * 4.2} w={6.2} h={3.4} r={0} o={i === 0 ? 0.85 : 0.4} solid />
      ))}
    </>
  ),

  /** Vertical bars on a baseline. */
  bars: (
    <>
      <Bar x={3} y={16.5} w={20} o={DIM} />
      {([[5.5, 6], [10, 10.5], [14.5, 7.5], [19, 12.5]] as Array<[number, number]>).map(([x, h], i) => (
        <VBar key={i} x={x} y={16.5 - h} h={h} w={2.6} o={i === 3 ? 1 : MID} />
      ))}
    </>
  ),

  /** Horizontal bars in their tracks — a tally of votes. */
  tally: (
    <>
      {[17, 12, 7].map((w, i) => (
        <g key={i}>
          <Bar x={3} y={6 + i * 4.4} w={20} o={DIM} />
          <Bar x={3} y={6 + i * 4.4} w={w} o={i === 0 ? 1 : MID} />
        </g>
      ))}
    </>
  ),

  /** Big-number stat blocks. */
  stats: (
    <>
      {[3, 10, 17].map((x, i) => (
        <g key={i}>
          <Box x={x} y={5} w={6} h={10} r={1.6} o={i === 0 ? MID : DIM} />
          <Bar x={x + 1.4} y={9} w={3.2} o={i === 0 ? 1 : MID} />
        </g>
      ))}
    </>
  ),

  /** One bar split into where the money went. */
  split: (
    <>
      <Box x={3} y={5} w={9} h={5} r={1.4} solid o={0.9} />
      <Box x={12.6} y={5} w={5.6} h={5} r={1.4} solid o={0.5} />
      <Box x={18.8} y={5} w={4.2} h={5} r={1.4} solid o={0.28} />
      <Bar x={3} y={14} w={7} o={MID} />
      <Bar x={13} y={14} w={10} o={DIM} />
    </>
  ),

  /** A ring, read like a watch face. */
  ring: (
    <>
      <circle cx={13} cy={10} r={6.2} fill="none" opacity={DIM} />
      <path d="M13 3.8A6.2 6.2 0 0 1 19.2 10" opacity={1} />
      <VBar x={13} y={6.4} h={3.6} o={MID} />
    </>
  ),

  /** A ring most of the way round — progress toward a goal. */
  goal: (
    <>
      <circle cx={13} cy={10} r={6.2} fill="none" opacity={DIM} />
      <path d="M13 3.8A6.2 6.2 0 1 1 7.2 12" opacity={1} />
      <Dot x={13} y={10} r={1.6} o={MID} />
    </>
  ),

  /** A dial sweeping from empty to full. */
  gauge: (
    <>
      <path d="M4.5 15.5A8.5 8.5 0 0 1 21.5 15.5" opacity={DIM} />
      <path d="M4.5 15.5A8.5 8.5 0 0 1 10 7.6" opacity={1} />
      <line x1={13} y1={15.5} x2={17.4} y2={9.2} opacity={MID} />
      <Dot x={13} y={15.5} r={1.5} />
    </>
  ),

  /** A month of days, one of them marked. */
  calendar: (
    <>
      <Box x={3} y={5} w={20} h={12} />
      <VBar x={8} y={2.8} h={3.4} o={MID} />
      <VBar x={18} y={2.8} h={3.4} o={MID} />
      <Bar x={3} y={8.6} w={20} o={MID} />
      {[0, 1].map((r) => [0, 1, 2, 3].map((c) => (
        <Dot key={`${r}-${c}`} x={6.4 + c * 4.6} y={11.6 + r * 3.4} r={0.95} o={DIM} />
      )))}
    </>
  ),

  /** One day, singled out. */
  day: (
    <>
      <Box x={3} y={5} w={20} h={12} o={DIM} />
      <VBar x={8} y={2.8} h={3.4} o={DIM} />
      <VBar x={18} y={2.8} h={3.4} o={DIM} />
      <Box x={9.4} y={9.4} w={7.2} h={5.4} r={1.6} solid />
    </>
  ),

  /** A typed field with the caret still in it. */
  field: (
    <>
      <Box x={3} y={6} w={20} h={8} r={2.6} o={MID} />
      <Bar x={6.4} y={10} w={7} />
      <VBar x={15.4} y={7.8} h={4.4} o={1} />
    </>
  ),

  /** A value on a track. */
  slider: (
    <>
      <Bar x={3} y={10} w={20} o={DIM} />
      <Bar x={3} y={10} w={13} o={1} />
      <circle cx={16} cy={10} r={3} fill="currentColor" stroke="none" />
      <Bar x={3} y={15.6} w={5} o={DIM} />
      <Bar x={18} y={15.6} w={5} o={DIM} />
    </>
  ),

  /** Three tracks, each parked somewhere different. */
  sliders: (
    <>
      {([[14, 5], [8, 10], [18, 15]] as Array<[number, number]>).map(([knob, y], i) => (
        <g key={i}>
          <Bar x={3} y={y} w={20} o={DIM} />
          <circle cx={knob} cy={y} r={2.4} fill="currentColor" stroke="none" opacity={i === 0 ? 1 : MID} />
        </g>
      ))}
    </>
  ),

  /** A switch, thrown. */
  toggle: (
    <>
      <Box x={4} y={5.6} w={18} h={8.8} r={4.4} o={MID} />
      <circle cx={17.4} cy={10} r={2.7} fill="currentColor" stroke="none" />
    </>
  ),

  /** Angle brackets. */
  code: (
    <>
      <path d="M8.6 5 4.6 10l4 5" />
      <path d="M17.4 5l4 5-4 5" />
      <line x1={14.6} y1={5.6} x2={11.4} y2={14.4} opacity={DIM} />
    </>
  ),

  /** Two operands, an operation, a result. */
  formula: (
    <>
      <Bar x={3} y={6} w={6} o={MID} />
      <Bar x={3} y={14} w={6} o={MID} />
      <path d="M14.4 6.6l3.2 3.4-3.2 3.4-3.2-3.4z" />
      <Bar x={19.4} y={10} w={3.6} o={DIM} />
    </>
  ),

  /** A page of equations. */
  equations: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Bar x={3} y={6 + i * 4.2} w={5.5} o={i === 0 ? 1 : MID} />
          <Bar x={10} y={5} w={2.6} o={DIM} />
          <Bar x={10} y={7} w={2.6} o={DIM} />
          <Bar x={14.5} y={6 + i * 4.2} w={8.5} o={DIM} />
        </g>
      ))}
    </>
  ),

  /** A readout over a keypad — square keys, so it never reads as a month. */
  keypad: (
    <>
      <Box x={3.5} y={3} w={19} h={4.6} r={1.4} o={MID} />
      <Bar x={16} y={5.3} w={4} />
      {[0, 1].map((r) => [0, 1, 2].map((c) => (
        <Box
          key={`${r}-${c}`} x={3.5 + c * 6.6} y={9.4 + r * 4.4} w={4.4} h={3.4} r={1}
          solid={r === 0 && c === 0} o={r === 0 && c === 0 ? 1 : MID}
        />
      )))}
    </>
  ),

  /** Two quantities, exchanged. */
  convert: (
    <>
      <Box x={3} y={5.6} w={8} h={8.8} r={2} o={MID} />
      <Box x={15} y={5.6} w={8} h={8.8} r={2} o={MID} />
      <path d="M11.8 8.2h2.4M13 7.2l1.4 1-1.4 1" opacity={1} />
      <path d="M14.2 12.2h-2.4M13 11.2l-1.4 1 1.4 1" opacity={DIM} />
    </>
  ),

  /** A labelled question and the box you answer it in. */
  form: (
    <>
      <Bar x={3} y={4} w={7} o={MID} />
      <Box x={3} y={6.2} w={20} h={4.4} r={1.4} o={DIM} />
      <Bar x={3} y={13.4} w={5.5} o={MID} />
      <Box x={3} y={15.6} w={20} h={4.4} r={1.4} o={DIM} />
    </>
  ),

  /** Framed picture. */
  frame: (
    <>
      <Box x={3} y={4} w={20} h={13} o={MID} />
      <path d="M4.6 15.2l4.6-5 3.4 3.6 3-2.6 6.4 5" opacity={1} />
      <Dot x={8.6} y={8.2} r={1.4} />
    </>
  ),

  /** Swatches. */
  swatches: (
    <>
      {[3, 8.4, 13.8, 19.2].map((x, i) => (
        <Box key={x} x={x} y={5.6} w={4} h={8.8} r={1.3} solid={i < 2} o={i === 0 ? 1 : i === 1 ? 0.6 : i === 2 ? 0.5 : 0.3} />
      ))}
    </>
  ),

  /** Pips, some earned. */
  pips: (
    <>
      {[4, 8.5, 13, 17.5, 22].map((x, i) => (
        <circle key={x} cx={x} cy={10} r={1.9} fill={i < 3 ? 'currentColor' : 'none'} opacity={i < 3 ? 1 : DIM} />
      ))}
    </>
  ),

  /** Freehand ink. */
  ink: (
    <>
      <path d="M3.5 14.6c2.4-7.6 4.6 1.6 7.2-3.2s4.4-6.2 7-2.2 2.6 4.4 4.8 2.6" />
      <Dot x={22.5} y={11.4} r={1.3} o={MID} />
    </>
  ),

  /** A back-and-forth. */
  bubbles: (
    <>
      <Box x={3} y={3.6} w={13} h={6.8} r={2.6} />
      <Box x={9.4} y={12} w={13} h={6.8} r={2.6} o={DIM} />
    </>
  ),

  /** Sparks. */
  spark: (
    <>
      <path d={star(9.5, 8.5, 5)} opacity={1} />
      <path d={star(18.5, 13.5, 3.4)} opacity={MID} />
      <path d={star(19, 5, 2.2)} opacity={DIM} />
    </>
  ),

  /** A trend with the latest point called out. */
  trend: (
    <>
      <path d="M3.5 14.6l4.8-4.4 4.4 3 4.6-6.4 4.7 3.4" />
      <Dot x={17.3} y={6.8} r={1.8} />
      <Bar x={3} y={17.6} w={20} o={DIM} />
    </>
  ),

  /** A dot for every day. */
  streak: (
    <>
      {[0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5].map((c) => (
        <Box
          key={`${r}-${c}`} x={3 + c * 3.5} y={5.4 + r * 4.4} w={2.6} h={2.6} r={0.8} solid
          o={(c + r) % 3 === 0 ? 1 : (c + r) % 3 === 1 ? 0.45 : 0.2}
        />
      )))}
    </>
  ),

  /** Down one, up one. */
  counter: (
    <>
      <Box x={3} y={5} w={20} h={10} r={2.4} o={DIM} />
      <Bar x={6} y={10} w={3.6} />
      <Bar x={16.4} y={10} w={3.6} />
      <VBar x={18.2} y={8.2} h={3.6} />
      <Dot x={13} y={10} r={1.6} o={MID} />
    </>
  ),

  /** A person. */
  person: (
    <>
      <circle cx={13} cy={7} r={3.2} fill="none" />
      <path d="M6.4 17.4c0-3.6 2.9-5.8 6.6-5.8s6.6 2.2 6.6 5.8" opacity={MID} />
    </>
  ),

  /** Somewhere on a map. */
  pin: (
    <>
      <path d="M13 3.4c2.7 0 4.8 2.1 4.8 4.7 0 3.2-4.8 7.7-4.8 7.7s-4.8-4.5-4.8-7.7c0-2.6 2.1-4.7 4.8-4.7z" />
      <Dot x={13} y={8.1} r={1.5} o={MID} />
      <Bar x={3} y={18} w={20} o={DIM} />
    </>
  ),

  /** Stops along a route. */
  route: (
    <>
      <path d="M4 15.4c4.4 0 3.8-10.4 9-10.4s4.6 10.4 9 10.4" opacity={DIM} strokeDasharray="2.4 2.4" />
      <Dot x={4} y={15.4} r={1.7} />
      <Dot x={13} y={5} r={1.7} o={MID} />
      <Dot x={22} y={15.4} r={1.7} o={DIM} />
    </>
  ),

  /** A deck you turn over — the back card peeks past the front one. */
  cards: (
    <>
      <Box x={9.5} y={2.6} w={13.5} h={10} r={2.2} o={DIM} />
      <Box x={3} y={7.4} w={13.5} h={10} r={2.2} />
      <Bar x={6} y={11.2} w={7.5} o={MID} />
      <Bar x={6} y={14.2} w={4.5} o={DIM} />
    </>
  ),

  /** Spines on a shelf. */
  shelf: (
    <>
      <Box x={3.5} y={3.6} w={4.4} h={12} r={1.2} />
      <Box x={9.6} y={5.6} w={4.4} h={10} r={1.2} o={MID} />
      <Box x={15.7} y={2.8} w={4.4} h={12.8} r={1.2} o={DIM} />
      <Bar x={3} y={17.6} w={20} o={MID} />
    </>
  ),

  /** Rows that point somewhere else. */
  links: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Bar x={3} y={6 + i * 4.2} w={13} o={i === 0 ? 1 : MID} />
          <path
            d={`M18.4 ${8 + i * 4.2}l3.4-3.4M19.2 ${4.6 + i * 4.2}h2.6v2.6`}
            opacity={i === 0 ? 1 : DIM}
          />
        </g>
      ))}
    </>
  ),

  /** For and against. */
  columns: (
    <>
      <VBar x={13} y={3.6} h={13} o={DIM} />
      <Bar x={3.4} y={5.6} w={3.6} />
      <VBar x={5.2} y={3.8} h={3.6} />
      <Bar x={3.4} y={11} w={7.4} o={MID} />
      <Bar x={3.4} y={14.6} w={5.4} o={DIM} />
      <Bar x={15.2} y={5.6} w={3.6} />
      <Bar x={15.2} y={11} w={7.4} o={MID} />
      <Bar x={15.2} y={14.6} w={5.4} o={DIM} />
    </>
  ),

  /** Four quadrants. */
  quads: (
    <>
      <Box x={3} y={4} w={9.2} h={5.8} r={1.4} />
      <Box x={13.8} y={4} w={9.2} h={5.8} r={1.4} o={MID} />
      <Box x={3} y={11.2} w={9.2} h={5.8} r={1.4} o={MID} />
      <Box x={13.8} y={11.2} w={9.2} h={5.8} r={1.4} o={DIM} />
    </>
  ),

  /** A board inside a board. */
  nested: (
    <>
      <Box x={3} y={3.6} w={20} h={13.6} r={3} o={MID} />
      <Box x={6.8} y={7.4} w={12.4} h={6} r={2} />
    </>
  ),

  /** One path in, two out. */
  fork: (
    <>
      <Bar x={3.4} y={10} w={5} o={MID} />
      <path d="M8.4 10c3.4 0 2.6-5.4 6-5.4h4" />
      <path d="M8.4 10c3.4 0 2.6 5.4 6 5.4h4" opacity={DIM} />
      <Dot x={18.8} y={4.6} r={1.6} />
      <Dot x={18.8} y={15.4} r={1.6} o={DIM} />
    </>
  ),

  /** Held shut. */
  lock: (
    <>
      <Box x={6.4} y={9} w={13.2} h={8.4} r={2.2} />
      <path d="M9.4 9V7.2a3.6 3.6 0 0 1 7.2 0V9" opacity={MID} />
      <Dot x={13} y={13.2} r={1.5} o={MID} />
    </>
  ),

  /** Things waiting their turn. */
  queue: (
    <>
      {[0, 1, 2].map((i) => (
        <Box key={i} x={3 + i * 0.6} y={4.4 + i * 4.6} w={15 - i * 1.2} h={3.4} r={1.1} solid o={i === 0 ? 1 : i === 1 ? 0.5 : 0.25} />
      ))}
      <path d="M21 8.4l2 1.6-2 1.6" opacity={MID} />
    </>
  ),

  /** States and the moves between them. */
  machine: (
    <>
      <circle cx={5.6} cy={6.4} r={2.6} fill="none" />
      <circle cx={20.4} cy={6.4} r={2.6} fill="none" opacity={MID} />
      <circle cx={13} cy={15.6} r={2.6} fill="none" opacity={DIM} />
      <path d="M8.2 6.4h9.6" opacity={DIM} />
      <path d="M18.6 8.6l-3.8 5.2" opacity={DIM} />
      <path d="M10.4 13.8L7.2 8.8" opacity={DIM} />
    </>
  ),

  /** Something sent over the wire. */
  wire: (
    <>
      <VBar x={13} y={3} h={14} o={DIM} />
      <Bar x={3} y={7} w={8} o={MID} />
      <path d="M15 7h8M20.4 4.8L23 7l-2.6 2.2" />
      <Bar x={15} y={14} w={8} o={DIM} />
      <path d="M11 14H3M5.6 11.8L3 14l2.6 2.2" opacity={DIM} />
    </>
  ),

  /** A stamped state. */
  badge: (
    <>
      <Box x={3.6} y={6.6} w={18.8} h={6.8} r={3.4} o={MID} />
      <Dot x={8} y={10} r={2} />
      <Bar x={12} y={10} w={6.6} o={DIM} />
    </>
  ),

  /** Flagged rows. */
  flags: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <path d={`M5 ${8.4 + i * 4.6}L3.2 ${11.4 + i * 4.6}h3.6z`} opacity={i === 0 ? 1 : i === 1 ? MID : DIM} />
          <Bar x={9.5} y={10.2 + i * 4.6 - 2.4} w={13.5} o={i === 0 ? MID : DIM} />
        </g>
      ))}
    </>
  ),

  /** Sound. */
  wave: (
    <>
      {([[4, 4.4], [7.5, 9.6], [11, 13.6], [14.5, 7.2], [18, 11.4], [21.5, 5]] as Array<[number, number]>).map(([x, h], i) => (
        <VBar key={x} x={x} y={10 - h / 2} h={h} w={1.8} o={i % 2 === 0 ? MID : 1} />
      ))}
    </>
  ),

  /** Learning. */
  cap: (
    <>
      <path d="M13 4.2L23 8l-10 3.8L3 8z" />
      <path d="M7.6 10v4.2c0 1.8 10.8 1.8 10.8 0V10" opacity={MID} />
    </>
  ),

  // -------------------------------------------------------------------------
  // Atlas drawings
  //
  // Every Atlas widget already names the shape it wants — `visual` in
  // atlasCatalog.ts, hand-picked per card. These are those shapes. Without
  // them fifty widgets fell back to their category's drawing, so a whole
  // shelf of study cards wore the same graduation cap.
  // -------------------------------------------------------------------------

  /** A hand of savers taking turns. */
  circleDots: (
    <>
      {[[19.6, 10], [17.6, 14.6], [13, 16.6], [8.4, 14.6], [6.4, 10], [8.4, 5.4], [13, 3.4], [17.6, 5.4]].map(
        ([x, y], i) => <Dot key={i} x={x!} y={y!} r={i === 0 ? 1.9 : 1.35} o={i === 0 ? 1 : i < 4 ? MID : DIM} />,
      )}
    </>
  ),

  /** A crescent, and the coin given under it. */
  crescent: (
    <>
      <path d="M15.6 3.6a7.2 7.2 0 1 0 0 12.8 8.6 8.6 0 0 1 0-12.8z" />
      <circle cx={19.6} cy={13.4} r={2.6} fill="none" opacity={MID} />
      <Dot x={19.6} y={13.4} r={0.9} o={MID} />
    </>
  ),

  /** Money arcing from one place to another. */
  transfer: (
    <>
      <path d="M4.4 14.4Q13 2.6 21.6 14.4" opacity={MID} strokeDasharray="2.6 2.4" />
      <Dot x={4.4} y={14.4} r={2} />
      <circle cx={21.6} cy={14.4} r={2.4} fill="none" />
      <path d="M19.4 9.6l2.4 1.2 1.2-2.4" opacity={1} />
    </>
  ),

  /** Names on the left, prices on the right. */
  ledger: (
    <>
      <VBar x={16} y={3.6} h={13.4} o={DIM} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Bar x={3} y={5.6 + i * 4.6} w={10.5} o={i === 0 ? MID : DIM} />
          <Bar x={18.5} y={5.6 + i * 4.6} w={4.5} o={i === 0 ? 1 : MID} />
        </g>
      ))}
    </>
  ),

  /** A tank, part full. */
  vessel: (
    <>
      <path d="M7 3.4h12v10.2a6 6 0 0 1-12 0z" />
      <path d="M7 10.6c1.6 0 1.6 1.4 3 1.4s1.4-1.4 3-1.4 1.6 1.4 3 1.4 1.4-1.4 3-1.4" opacity={MID} />
      <path d="M7 12.4v1.2a6 6 0 0 0 12 0v-1.2z" fill="currentColor" stroke="none" opacity={0.22} />
    </>
  ),

  /** A dial swept round past its ticks. */
  speedo: (
    <>
      <path d="M5.6 16.4a9 9 0 1 1 14.8 0" opacity={DIM} />
      <path d="M5.6 16.4A9 9 0 0 1 8.4 3.9" opacity={1} />
      <line x1={13} y1={11.4} x2={17.6} y2={6.2} opacity={MID} />
      <Dot x={13} y={11.4} r={1.7} />
    </>
  ),

  /** Several inflows, one pocket. */
  streams: (
    <>
      <path d="M3 4.6c7 0 8 5.4 16 5.4" opacity={MID} />
      <path d="M3 10h16" opacity={1} />
      <path d="M3 15.4c7 0 8-5.4 16-5.4" opacity={DIM} />
      <Dot x={21} y={10} r={2} />
    </>
  ),

  /** Something put on ice. */
  frost: (
    <>
      <line x1={4.6} y1={10} x2={21.4} y2={10} />
      <line x1={8.8} y1={2.7} x2={17.2} y2={17.3} opacity={MID} />
      <line x1={17.2} y1={2.7} x2={8.8} y2={17.3} opacity={MID} />
      <path d="M6.6 8.2 4.6 10l2 1.8M19.4 8.2 21.4 10l-2 1.8" opacity={DIM} />
    </>
  ),

  /** A trace on a screen. */
  monitor: (
    <>
      <Box x={3} y={4.4} w={20} h={11.2} r={2.4} o={MID} />
      <path d="M5.6 11h2.8l1.6-3.4 2.4 6 1.8-2.6h6.2" opacity={1} />
    </>
  ),

  /** A body coming back round to where it started. */
  orbit: (
    <g transform="rotate(-22 13 10)">
      <ellipse cx={13} cy={10} rx={9.4} ry={5.2} fill="none" opacity={MID} />
      <Dot x={13} y={10} r={2.2} />
      <Dot x={22.4} y={10} r={1.6} o={1} />
    </g>
  ),

  /** A disc half in shadow. */
  eclipse: (
    <>
      <circle cx={13} cy={10} r={6.4} fill="none" opacity={MID} />
      <path d="M13 3.6a6.4 6.4 0 0 1 0 12.8z" fill="currentColor" stroke="none" />
      <path d="M13 3.6v12.8" opacity={DIM} />
    </>
  ),

  /** Night. */
  moon: (
    <>
      <path d="M16.4 3.4a7 7 0 1 0 0 13.2 8.6 8.6 0 0 1 0-13.2z" />
      <path d={star(21.2, 5.6, 2)} opacity={MID} />
      <path d={star(19.4, 11.4, 1.4)} opacity={DIM} />
    </>
  ),

  /** A fanned hand of cards. */
  fan: (
    <>
      <g transform="rotate(-16 13 16)">
        <Box x={8.6} y={4} w={8.8} h={12} r={1.6} o={DIM} />
      </g>
      <g transform="rotate(16 13 16)">
        <Box x={8.6} y={4} w={8.8} h={12} r={1.6} o={DIM} />
      </g>
      <Box x={8.6} y={3.2} w={8.8} h={12} r={1.6} />
    </>
  ),

  /** The sun crossing a marked day. */
  horizon: (
    <>
      <path d="M7 13.6a6 6 0 0 1 12 0" />
      <Bar x={3} y={13.6} w={20} o={MID} />
      {[5.5, 10, 16, 20.5].map((x, i) => (
        <VBar key={x} x={x} y={15.4} h={2.4} o={i === 1 ? 1 : DIM} />
      ))}
    </>
  ),

  /** An open book. */
  book: (
    <>
      <path d="M13 6.2C10.8 4.4 7.4 4 3.6 4.4v10.4c3.8-.4 7.2 0 9.4 1.8" />
      <path d="M13 6.2c2.2-1.8 5.6-2.2 9.4-1.8v10.4c-3.8-.4-7.2 0-9.4 1.8" opacity={MID} />
      <VBar x={13} y={6.2} h={10.4} o={DIM} />
    </>
  ),

  /** Notes dropped in a jar. */
  jar: (
    <>
      <Bar x={7} y={4.4} w={12} o={MID} />
      <path d="M8 6.6h10v8.2a2.6 2.6 0 0 1-2.6 2.6h-4.8A2.6 2.6 0 0 1 8 14.8z" />
      <Dot x={11} y={12.4} r={1.2} o={MID} />
      <Dot x={15} y={13.6} r={1.2} o={DIM} />
      <Dot x={14.4} y={10} r={1.2} o={MID} />
    </>
  ),

  /** Points joined into a figure. */
  constellation: (
    <>
      <path d="M4.4 15.4 8.6 6.4l5.4 5 5-5.6 3.6 9.4" opacity={MID} />
      <Dot x={4.4} y={15.4} r={1.7} o={MID} />
      <Dot x={8.6} y={6.4} r={2.3} />
      <Dot x={14} y={11.4} r={1.7} o={MID} />
      <Dot x={19} y={5.8} r={2.3} />
      <Dot x={22.6} y={15.2} r={1.5} o={DIM} />
    </>
  ),

  /** Hours that are on, and hours that are not. */
  schedule: (
    <>
      <Box x={3} y={7.2} w={20} h={5.6} r={2.8} o={DIM} />
      <Box x={4} y={8.2} w={5.4} h={3.6} r={1.8} solid />
      <Box x={11.6} y={8.2} w={3.6} h={3.6} r={1.8} solid o={0.5} />
      <Box x={17.4} y={8.2} w={4.6} h={3.6} r={1.8} solid o={0.28} />
      <VBar x={13} y={4.4} h={2} o={MID} />
    </>
  ),

  /** Things lent out, each with a tag. */
  tags: (
    <>
      <path d="M9.8 3.8h6.6a1.8 1.8 0 0 1 1.8 1.8v6.6l-5.6 5.6a1.6 1.6 0 0 1-2.2 0l-6-6a1.6 1.6 0 0 1 0-2.2z" />
      <Dot x={14.6} y={7.4} r={1.5} o={MID} />
      <path d="M20.4 6.4l1.8 1.8a1.6 1.6 0 0 1 0 2.2l-4.6 4.6" opacity={DIM} />
    </>
  ),

  /** A plant on a shelf. */
  plant: (
    <>
      <path d="M9 12.4h8l-1 5.2h-6z" />
      <VBar x={13} y={5} h={7.4} o={MID} />
      <path d="M13 8.6C10.4 8.6 8.8 7 8.8 4.6c2.6 0 4.2 1.6 4.2 4z" opacity={MID} />
      <path d="M13 10.6c2.6 0 4.2-1.6 4.2-4-2.6 0-4.2 1.6-4.2 4z" opacity={DIM} />
    </>
  ),

  /** A packed bag by the door. */
  bag: (
    <>
      <path d="M9.6 7.4V6a3.4 3.4 0 0 1 6.8 0v1.4" opacity={MID} />
      <Box x={5} y={7.4} w={16} h={10} r={3.2} />
      <Box x={9.2} y={12} w={7.6} h={5.4} r={1.4} o={DIM} />
    </>
  ),

  /** Which bin goes out. */
  bins: (
    <>
      <Bar x={3.4} y={6.4} w={7.6} o={MID} />
      <path d="M4.2 7.6h6l-.7 9.4H4.9z" />
      <Bar x={15} y={6.4} w={7.6} o={DIM} />
      <path d="M15.8 7.6h6l-.7 9.4h-4.6z" opacity={DIM} />
    </>
  ),

  /** How much sun the window gets. */
  dome: (
    <>
      <path d="M4 15.6a9 9 0 0 1 18 0z" fill="currentColor" stroke="none" opacity={0.2} />
      <path d="M4 15.6a9 9 0 0 1 18 0" />
      <Bar x={2.6} y={15.6} w={20.8} o={MID} />
      <Dot x={9.4} y={9.6} r={1.6} o={MID} />
    </>
  ),

  /** Boxes, taped and stacked. */
  boxes: (
    <>
      <Box x={8.4} y={2.6} w={9.2} h={5.8} r={1.2} o={DIM} />
      <VBar x={13} y={2.6} h={5.8} o={DIM} />
      <Box x={3} y={9.6} w={9.2} h={7.4} r={1.2} />
      <VBar x={7.6} y={9.6} h={7.4} o={MID} />
      <Box x={13.8} y={9.6} w={9.2} h={7.4} r={1.2} o={MID} />
      <VBar x={18.4} y={9.6} h={7.4} o={DIM} />
    </>
  ),

  /** A cost climbing while you sit there. */
  meter: (
    <>
      <Box x={3} y={7.4} w={20} h={5.4} r={2.7} o={DIM} />
      <Box x={3.9} y={8.3} w={10.4} h={3.6} r={1.8} solid />
      <VBar x={17.6} y={5} h={10.2} o={MID} />
      <Dot x={17.6} y={3.6} r={1.2} />
    </>
  ),

  /** Waiting. */
  hourglass: (
    <>
      <Bar x={6.4} y={3.4} w={13.2} />
      <Bar x={6.4} y={16.6} w={13.2} />
      <path d="M8 3.4c0 3.6 5 5.2 5 6.6s-5 3-5 6.6M18 3.4c0 3.6-5 5.2-5 6.6s5 3 5 6.6" opacity={MID} />
      <path d="M9.6 16.6c0-2 6.8-2 6.8 0z" fill="currentColor" stroke="none" opacity={0.55} />
    </>
  ),

  /** Two calendars, and the hours they share. */
  overlap: (
    <>
      <Bar x={3} y={6.4} w={20} o={DIM} />
      <Box x={5.4} y={5.2} w={9.6} h={2.6} r={1.3} solid o={0.55} />
      <Bar x={3} y={13.6} w={20} o={DIM} />
      <Box x={10.4} y={12.4} w={9.6} h={2.6} r={1.3} solid o={0.55} />
      <Box x={10.4} y={3.4} w={4.6} h={13.2} r={1.4} o={1} />
    </>
  ),

  /** Scope pushing at the wall. */
  pressure: (
    <>
      <path d="M4 6l3.2 4L4 14" opacity={DIM} />
      <path d="M9.2 6l3.2 4-3.2 4" opacity={MID} />
      <path d="M14.4 6l3.2 4-3.2 4" opacity={1} />
      <VBar x={21} y={3.6} h={12.8} o={1} w={2.4} />
    </>
  ),

  /** A handover, clipped. */
  clipboard: (
    <>
      <Box x={4.6} y={4.6} w={16.8} h={13} r={2.4} />
      <Box x={9.6} y={2.6} w={6.8} h={3.4} r={1.4} solid />
      <Bar x={8} y={10.4} w={10} o={MID} />
      <Bar x={8} y={13.8} w={6.5} o={DIM} />
    </>
  ),

  /** Work waiting to be stamped. */
  stamps: (
    <>
      <Box x={3} y={6.6} w={6} h={6.8} r={1.3} />
      <path d="M4.6 10l1.4 1.6 2.2-3" opacity={1} />
      <Box x={10.6} y={6.6} w={6} h={6.8} r={1.3} o={MID} />
      <Box x={18.2} y={6.6} w={4.8} h={6.8} r={1.3} o={DIM} />
      <Bar x={3} y={16.4} w={20} o={DIM} />
    </>
  ),

  /** Whoever is carrying the pager. */
  pager: (
    <>
      <Box x={4.4} y={5.4} w={14.6} h={11.2} r={2.4} />
      <Bar x={7.4} y={9.4} w={8.6} o={MID} />
      <Bar x={7.4} y={12.6} w={5.4} o={DIM} />
      <path d="M20.6 6.4a4 4 0 0 1 0 5.6" opacity={MID} />
      <path d="M22.6 4a7 7 0 0 1 0 10.4" opacity={DIM} />
    </>
  ),

  /** A quote, torn off. */
  receipt: (
    <>
      <path d="M6 3.4h14v13.2l-2.4-1.4-2.3 1.4-2.3-1.4-2.4 1.4-2.3-1.4L6 16.6z" />
      <Bar x={8.6} y={7.4} w={8.8} o={MID} />
      <Bar x={8.6} y={11} w={5.6} o={DIM} />
    </>
  ),

  /** Papers, one already marked. */
  sheets: (
    <>
      <Box x={3} y={3.4} w={8.6} h={6.6} r={1.3} />
      <path d="M5.2 6.6l1.6 1.8 2.6-3.4" opacity={1} />
      <Box x={14.4} y={3.4} w={8.6} h={6.6} r={1.3} o={MID} />
      <Box x={3} y={11.8} w={8.6} h={6.6} r={1.3} o={MID} />
      <Box x={14.4} y={11.8} w={8.6} h={6.6} r={1.3} o={DIM} />
    </>
  ),

  /** Rungs you climb as it sticks. */
  ladder: (
    <>
      <VBar x={8} y={2.8} h={14.4} o={MID} />
      <VBar x={18} y={2.8} h={14.4} o={MID} />
      <Bar x={8} y={6.2} w={10} o={DIM} />
      <Bar x={8} y={10} w={10} o={MID} />
      <Bar x={8} y={13.8} w={10} o={1} />
    </>
  ),

  /** Trials in dishes. */
  dishes: (
    <>
      <circle cx={7.4} cy={6.8} r={3.6} fill="none" />
      <Dot x={7.4} y={6.8} r={1.2} o={MID} />
      <circle cx={18.2} cy={6.8} r={3.6} fill="none" opacity={MID} />
      <Dot x={18.2} y={6.8} r={0.9} o={DIM} />
      <circle cx={12.8} cy={14.6} r={3.6} fill="none" opacity={DIM} />
    </>
  ),

  /** What the mistakes get locked into. */
  vault: (
    <>
      <Box x={2.8} y={2.8} w={20.4} h={14.4} r={2.8} />
      <circle cx={11} cy={10} r={4.6} fill="none" />
      <circle cx={11} cy={10} r={1.5} fill="currentColor" stroke="none" opacity={MID} />
      <path d="M11 3.6v2.2M11 14.2v2.2M4.4 10h2.2M15.4 10h2.2" opacity={DIM} />
      <VBar x={19.4} y={7.2} h={5.6} o={MID} />
      <Bar x={17.4} y={10} w={2} o={MID} />
    </>
  ),

  /** A day strung like beads. */
  beads: (
    <>
      <path d="M3.4 13.6c4-7.2 15.2-7.2 19.2 0" opacity={DIM} />
      <Dot x={4.6} y={11.2} r={1.6} o={MID} />
      <Dot x={8.8} y={7.8} r={1.8} />
      <Dot x={13.4} y={6.8} r={1.8} />
      <Dot x={17.8} y={7.8} r={1.6} o={MID} />
      <Dot x={21.6} y={11.2} r={1.4} o={DIM} />
    </>
  ),

  /** Given against received. */
  balance: (
    <>
      <VBar x={13} y={4.4} h={11.4} o={MID} />
      <Bar x={4.4} y={6.6} w={17.2} />
      <Dot x={13} y={4.4} r={1.3} />
      <path d="M6.6 6.6 4 11.8h5.2z" opacity={1} />
      <path d="M19.4 6.6 16.8 11.8H22z" opacity={DIM} />
      <Bar x={9} y={16.6} w={8} o={MID} />
    </>
  ),

  /** Applause, peaking. */
  vu: (
    <>
      <Bar x={3} y={17} w={20} o={DIM} />
      {[[5, 5], [8.6, 8.5], [12.2, 12], [15.8, 7], [19.4, 4]].map(([x, h], i) => (
        <g key={i}>
          <VBar x={x!} y={17 - h!} h={h!} w={2.4} o={i === 2 ? 1 : MID} />
          <VBar x={x!} y={15.2 - h! - 1.4} h={0.1} w={2.4} o={i === 2 ? 1 : DIM} />
        </g>
      ))}
    </>
  ),

  /** Dishes claimed, and the gap left. */
  plates: (
    <>
      <circle cx={6.4} cy={10} r={4} fill="none" />
      <circle cx={6.4} cy={10} r={1.8} fill="none" opacity={MID} />
      <circle cx={13} cy={10} r={4} fill="none" opacity={MID} />
      <circle cx={13} cy={10} r={1.8} fill="none" opacity={DIM} />
      <circle cx={19.6} cy={10} r={4} fill="none" opacity={DIM} strokeDasharray="2.2 2.2" />
    </>
  ),

  /** Stars earned. */
  stars: (
    <>
      {[5.4, 13, 20.6].map((x, i) => (
        <path key={x} d={star5(x, 10, 4.6)} fill={i < 2 ? 'currentColor' : 'none'} stroke={i < 2 ? 'none' : 'currentColor'} opacity={i === 0 ? 1 : i === 1 ? 0.6 : DIM} />
      ))}
    </>
  ),

  /** A paw. */
  paw: (
    <>
      <ellipse cx={7.6} cy={7.4} rx={2} ry={2.6} fill="currentColor" stroke="none" opacity={MID} />
      <ellipse cx={12} cy={5.4} rx={2} ry={2.8} fill="currentColor" stroke="none" />
      <ellipse cx={16.6} cy={6.4} rx={2} ry={2.7} fill="currentColor" stroke="none" opacity={MID} />
      <ellipse cx={20.2} cy={9.8} rx={1.9} ry={2.4} fill="currentColor" stroke="none" opacity={DIM} />
      <path d="M13.4 10.4c3.4 0 5.6 2.4 5.6 4.6s-2.4 2.8-5.6 2.8-5.8-.6-5.8-2.8 2.4-4.6 5.8-4.6z" />
    </>
  ),

  /** Days left on the stamp. */
  passport: (
    <>
      <Box x={5.6} y={2.8} w={14.8} h={14.4} r={2.2} />
      <VBar x={8.2} y={2.8} h={14.4} o={DIM} />
      <circle cx={14.6} cy={8.4} r={2.8} fill="none" opacity={MID} />
      <Bar x={11} y={13.8} w={7.4} o={DIM} />
    </>
  ),

  /** Packed, latched. */
  suitcase: (
    <>
      <path d="M10.4 7V5.6h5.2V7" opacity={MID} />
      <Box x={3.6} y={7} w={18.8} h={10.2} r={2.4} />
      <VBar x={13} y={7} h={10.2} o={DIM} />
      <Dot x={9.4} y={12.1} r={1} o={MID} />
      <Dot x={16.6} y={12.1} r={1} o={MID} />
    </>
  ),

  /** Two places, two times. */
  clocks: (
    <>
      <circle cx={7.6} cy={10} r={4.6} fill="none" />
      <path d="M7.6 6.8V10h2.6" opacity={MID} />
      <circle cx={18.4} cy={10} r={4.6} fill="none" opacity={MID} />
      <path d="M18.4 6.8V10h-2.6" opacity={DIM} />
    </>
  ),

  /** Cash, in pockets. */
  wallet: (
    <>
      <Box x={12.4} y={2.8} w={9} h={5.4} r={1.4} o={DIM} />
      <Box x={3.4} y={6} w={19.2} h={10.6} r={2.6} />
      <Dot x={18.8} y={11.3} r={1.6} o={MID} />
      <Bar x={3.4} y={9.4} w={19.2} o={DIM} />
    </>
  ),

  /** Commissions on their easels. */
  easel: (
    <>
      <Box x={6.6} y={2.8} w={12.8} h={9.4} r={1.4} />
      <path d="M8.2 12.2 5.4 17.4M17.8 12.2l2.8 5.2M13 12.2v5.2" opacity={MID} />
      <Bar x={8} y={15} w={10} o={DIM} />
    </>
  ),

  /** A pipeline of frames. */
  film: (
    <>
      <Box x={3} y={4.6} w={20} h={10.8} r={1.6} />
      <VBar x={9.6} y={4.6} h={10.8} o={DIM} />
      <VBar x={16.4} y={4.6} h={10.8} o={DIM} />
      {[5.2, 9.6, 14, 18.4].map((x) => (
        <g key={x}>
          <Dot x={x} y={2.9} r={0.85} o={DIM} />
          <Dot x={x} y={17.1} r={0.85} o={DIM} />
        </g>
      ))}
    </>
  ),
} satisfies Record<string, ReactElement>

type FaceName = keyof typeof FACES

/** Widgets whose own layout is worth drawing exactly. */
const FACE_BY_TYPE: Partial<Record<ModuleType, FaceName>> = {
  // Notes & content
  text: 'lines',
  meeting_notes: 'minutes',
  logbook: 'log',
  citation: 'cite',
  bullets: 'bullets',
  outline: 'outline',
  code: 'code',
  flashcards: 'cards',
  // Tasks & planning
  checklist: 'checks',
  process: 'steps',
  calendar: 'calendar',
  date_picker: 'day',
  pros_cons: 'columns',
  swot: 'quads',
  decision: 'fork',
  decision_matrix: 'matrix',
  risk_register: 'flags',
  poll: 'tally',
  // Data & views
  table: 'grid',
  bar_chart: 'bars',
  metrics: 'stats',
  budget: 'split',
  calculator: 'keypad',
  formula: 'formula',
  unit_converter: 'convert',
  form: 'form',
  rating: 'pips',
  text_input: 'field',
  number_input: 'slider',
  toggle: 'toggle',
  location: 'pin',
  // Media & creative
  media: 'frame',
  sketchpad: 'ink',
  dialog: 'bubbles',
  ai_generator: 'spark',
  color_palette: 'swatches',
  // Tracking
  timekeeper: 'ring',
  goal_tracker: 'goal',
  habit: 'streak',
  mood_tracker: 'trend',
  counter: 'counter',
  contact: 'person',
  links: 'links',
  reading_list: 'shelf',
  status: 'badge',
  inventory: 'stock',
  timesheet: 'hours',
  // Study
  canvas_lms: 'cap',
  grade_calc: 'gauge',
  formula_sheet: 'equations',
  // Structure, life, specialist
  canvas_node: 'nested',
  branch_gate: 'fork',
  trip_itinerary: 'route',
  game_tuner: 'sliders',
  audio_player: 'wave',
  // Automation cores
  workflow_lock: 'lock',
  mutex: 'lock',
  approval_gate: 'fork',
  queue: 'queue',
  stack_store: 'queue',
  set_store: 'queue',
  state_machine: 'machine',
  idempotency_store: 'lock',
  http_request: 'wire',
  webhook_sender: 'wire',
  widget_creator: 'nested',
}

/**
 * Atlas widgets already say what they should look like. Every entry in
 * atlasCatalog.ts carries a hand-picked `visual` — 'ladder', 'vault',
 * 'dishes' — which is exactly the drawing this table needs, so the fifty
 * Atlas cards get fifty considered faces instead of one shared category
 * fallback. A visual with no drawing yet still falls through to its family.
 */
const FACE_BY_ATLAS_VISUAL: Partial<Record<(typeof ATLAS_CATALOG)[AtlasType]['visual'], FaceName>> = {
  ring: 'circleDots',
  crescent: 'crescent',
  arc: 'transfer',
  ledger: 'ledger',
  vessel: 'vessel',
  gauge: 'speedo',
  streams: 'streams',
  frost: 'frost',
  monitor: 'monitor',
  orbit: 'orbit',
  eclipse: 'eclipse',
  moon: 'moon',
  deck: 'fan',
  horizon: 'horizon',
  book: 'book',
  jar: 'jar',
  constellation: 'constellation',
  schedule: 'schedule',
  tags: 'tags',
  plant: 'plant',
  bag: 'bag',
  bins: 'bins',
  dome: 'dome',
  boxes: 'boxes',
  meter: 'meter',
  hourglass: 'hourglass',
  combs: 'overlap',
  pressure: 'pressure',
  clipboard: 'clipboard',
  stamps: 'stamps',
  pager: 'pager',
  receipt: 'receipt',
  grid: 'sheets',
  ladder: 'ladder',
  dishes: 'dishes',
  vault: 'vault',
  beads: 'beads',
  balance: 'balance',
  vu: 'vu',
  plates: 'plates',
  stars: 'stars',
  pet: 'paw',
  passport: 'passport',
  suitcase: 'suitcase',
  clocks: 'clocks',
  wallet: 'wallet',
  easels: 'easel',
  film: 'film',
}

/** Anything without its own drawing still reads as its family. */
const FACE_BY_CATEGORY: Record<WidgetCategory, FaceName> = {
  structure: 'nested',
  notes: 'lines',
  planning: 'checks',
  study: 'cap',
  data: 'grid',
  media: 'frame',
  tracking: 'trend',
  automation: 'fork',
  life: 'route',
  specialist: 'sliders',
}

/**
 * Which drawing a widget wears, most specific first: its own, then the shape
 * its Atlas entry asked for, then its family's.
 */
function faceFor(type: ModuleType, category: WidgetCategory): FaceName {
  const own = FACE_BY_TYPE[type]
  if (own) return own
  if (ATLAS_TYPE_SET.has(type)) {
    const visual = FACE_BY_ATLAS_VISUAL[ATLAS_CATALOG[type as AtlasType].visual]
    if (visual) return visual
  }
  return FACE_BY_CATEGORY[category]
}

/**
 * The miniature a widget wears in the picker. Stroked in `currentColor`, so the
 * row decides the ink and the face never carries a palette of its own, and
 * sized by its box rather than by attributes, so the drawing grows with the row
 * instead of rattling around inside it.
 */
export function WidgetFace({ type, category }: { type: ModuleType; category: WidgetCategory }) {
  return (
    <svg
      className="gp-facet-face"
      viewBox="0 0 26 20"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.45}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {FACES[faceFor(type, category)]}
    </svg>
  )
}
