import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CornerDownLeft, Sparkles } from 'lucide-react'
import { useQuickAddPreviewStore } from '../../store/useQuickAddPreviewStore'
import type { ThoughtPlan } from '../../utils/thoughtInterpreter'
import { layoutThoughtPlan, layoutWidth, type PlanNodeSize } from '../../utils/planLayout'
import { widgetDefinition } from '../../widgets/registry'

/**
 * Blueprint preview — the living tree under the Quick Add bar.
 *
 * Renders the active candidate plan as compact dashed "blueprint" chips in
 * world space, exactly where ⏎ will commit real widgets. Deliberately NOT a
 * clone of real cards: chips are miniature, dashed, and single-toned so the
 * user reads them as a *template being sketched*, never as widgets that
 * appear and vanish. Between plan updates, surviving chips glide to their
 * new spot; new ones bloom in with a depth stagger; removed ones fold away.
 *
 * Pure presentation: pointer-events are disabled and every decision lives
 * in the Quick Add bar. The layer sits inside the canvas world transform,
 * so it pans and zooms with the board.
 */

const CHIP_W = 208
const CHIP_H = 64
const PILL_GAP = 44

interface ChipVisual {
  key: string
  temporaryId: string
  title: string
  widgetType: ThoughtPlan['nodes'][number]['widgetType']
  x: number
  y: number
  depth: number
  siblingIndex: number
}

interface RopeVisual {
  key: string
  d: string
  blocker: boolean
}

interface BandVisual {
  key: string
  x: number
  y: number
  width: number
  height: number
  label?: string
}

interface Scene {
  chips: ChipVisual[]
  ropes: RopeVisual[]
  bands: BandVisual[]
  width: number
  height: number
}

function chipKeys(plan: ThoughtPlan): Map<string, string> {
  const seen = new Map<string, number>()
  const keys = new Map<string, string>()
  for (const node of plan.nodes) {
    const base = `${node.widgetType}|${node.title.trim().toLowerCase()}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    keys.set(node.temporaryId, count === 0 ? base : `${base}#${count}`)
  }
  return keys
}

function buildScene(plan: ThoughtPlan, anchor: { x: number; y: number }): Scene {
  const sizes: Record<string, PlanNodeSize> = {}
  for (const node of plan.nodes) sizes[node.temporaryId] = { width: CHIP_W, height: CHIP_H }
  const positions = layoutThoughtPlan(plan, sizes)
  const width = layoutWidth(positions, sizes)
  const left = anchor.x - width / 2
  const keys = chipKeys(plan)

  const depthOf = new Map<string, number>()
  const parentOf = new Map<string, string>()
  for (const relation of plan.relations) {
    if (relation.type === 'parent' && !parentOf.has(relation.toTemporaryId)) {
      parentOf.set(relation.toTemporaryId, relation.fromTemporaryId)
    }
  }
  const depthFor = (id: string, hops = 0): number => {
    const cached = depthOf.get(id)
    if (cached !== undefined) return cached
    const parent = parentOf.get(id)
    const depth = parent && parent !== id && hops < 12 ? depthFor(parent, hops + 1) + 1 : 0
    depthOf.set(id, depth)
    return depth
  }

  const siblingCounters = new Map<string, number>()
  const chips: ChipVisual[] = plan.nodes.map((node) => {
    const position = positions[node.temporaryId] ?? { x: 0, y: 0 }
    const depth = depthFor(node.temporaryId)
    const parent = parentOf.get(node.temporaryId) ?? '__root__'
    const siblingIndex = siblingCounters.get(parent) ?? 0
    siblingCounters.set(parent, siblingIndex + 1)
    return {
      key: keys.get(node.temporaryId)!,
      temporaryId: node.temporaryId,
      title: node.title,
      widgetType: node.widgetType,
      x: left + position.x,
      y: anchor.y + position.y,
      depth,
      siblingIndex,
    }
  })
  const chipByTempId = new Map(chips.map((chip) => [chip.temporaryId, chip]))

  const ropes: RopeVisual[] = []
  for (const relation of plan.relations) {
    if (relation.type !== 'parent' && relation.type !== 'blocker') continue
    const from = chipByTempId.get(relation.fromTemporaryId)
    const to = chipByTempId.get(relation.toTemporaryId)
    if (!from || !to) continue
    const x1 = from.x + CHIP_W / 2
    const y1 = from.y + CHIP_H
    const x2 = to.x + CHIP_W / 2
    const y2 = to.y
    if (y2 <= y1) continue
    const bend = Math.min(36, (y2 - y1) / 2)
    ropes.push({
      key: `${from.key}->${to.key}`,
      d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
      blocker: relation.type === 'blocker',
    })
  }

  const bands: BandVisual[] = []
  for (const group of plan.groups) {
    const members = group.memberTemporaryIds
      .map((id) => chipByTempId.get(id))
      .filter((chip): chip is ChipVisual => Boolean(chip))
    if (members.length < 2) continue
    const minX = Math.min(...members.map((chip) => chip.x))
    const maxX = Math.max(...members.map((chip) => chip.x + CHIP_W))
    const minY = Math.min(...members.map((chip) => chip.y))
    const maxY = Math.max(...members.map((chip) => chip.y + CHIP_H))
    bands.push({
      key: `band:${members[0]!.key}`,
      x: minX - 14,
      y: minY - 14,
      width: maxX - minX + 28,
      height: maxY - minY + 28,
      ...(group.label ? { label: group.label } : {}),
    })
  }

  let maxY = anchor.y
  for (const chip of chips) maxY = Math.max(maxY, chip.y + CHIP_H)
  return { chips, ropes, bands, width, height: maxY - anchor.y }
}

/** Chips leaving the plan fold away instead of vanishing between frames. */
function useLeavingChips(chips: ChipVisual[]): ChipVisual[] {
  const previousRef = useRef<Map<string, ChipVisual>>(new Map())
  const [leaving, setLeaving] = useState<ChipVisual[]>([])
  const currentKeys = useMemo(() => new Set(chips.map((chip) => chip.key)), [chips])

  useEffect(() => {
    const gone: ChipVisual[] = []
    for (const [key, chip] of previousRef.current) {
      if (!currentKeys.has(key)) gone.push(chip)
    }
    previousRef.current = new Map(chips.map((chip) => [chip.key, chip]))
    if (gone.length === 0) return
    setLeaving((existing) => {
      const keep = existing.filter((chip) => !currentKeys.has(chip.key) && !gone.some((g) => g.key === chip.key))
      return [...keep, ...gone]
    })
    const timer = window.setTimeout(() => {
      setLeaving((existing) => existing.filter((chip) => !gone.some((g) => g.key === chip.key)))
    }, 240)
    return () => window.clearTimeout(timer)
  }, [chips, currentKeys])

  return leaving.filter((chip) => !currentKeys.has(chip.key))
}

export function QuickAddPreviewLayer() {
  const active = useQuickAddPreviewStore((state) => state.active)
  const phase = useQuickAddPreviewStore((state) => state.phase)
  const candidates = useQuickAddPreviewStore((state) => state.candidates)
  const index = useQuickAddPreviewStore((state) => state.index)
  const anchor = useQuickAddPreviewStore((state) => state.anchor)

  const candidate = candidates[index]
  const scene = useMemo(
    () => (candidate && anchor ? buildScene(candidate.plan, anchor) : null),
    [candidate, anchor],
  )
  const leavingChips = useLeavingChips(scene?.chips ?? [])

  if (!active || !candidate || !anchor || !scene) return null

  const busy = phase === 'composing' || phase === 'deepening'
  const nodeCount = candidate.plan.nodes.length

  return (
    <div data-canvas-ui className="pointer-events-none absolute left-0 top-0" aria-hidden>
      {/* Header pill — names the template and how to commit it */}
      <div
        className="gp-bp-pill absolute flex items-center gap-2 whitespace-nowrap rounded-full border border-emerald-300/25 bg-neutral-950/85 py-1.5 pl-3 pr-3.5 text-[11px] text-neutral-300 shadow-xl backdrop-blur-sm"
        style={{ left: anchor.x, top: anchor.y - PILL_GAP, transform: 'translateX(-50%)' }}
      >
        <Sparkles size={11} className={busy ? 'gp-bp-spin text-emerald-300' : 'text-emerald-300/90'} />
        <span className="max-w-64 truncate font-medium text-neutral-100">{candidate.label}</span>
        {candidate.badge === 'ai' && (
          <span className="rounded-full bg-violet-400/15 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wider text-violet-300">AI</span>
        )}
        {candidate.badge === 'starter' && (
          <span className="rounded-full bg-emerald-400/12 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wider text-emerald-300/80">Starter</span>
        )}
        <span className="text-neutral-600">·</span>
        {busy ? (
          <span className="gp-bp-breathe text-emerald-300/90">{phase === 'deepening' ? 'thinking deeper…' : 'refining…'}</span>
        ) : (
          <span className="flex items-center gap-1 text-neutral-500">
            <CornerDownLeft size={10} /> creates {nodeCount === 1 ? '1 card' : `${nodeCount} cards`}
          </span>
        )}
        {candidates.length > 1 && (
          <>
            <span className="text-neutral-600">·</span>
            <span className="flex items-center gap-0.5 text-neutral-500">
              <ChevronLeft size={10} />
              {index + 1}/{candidates.length}
              <ChevronRight size={10} />
            </span>
          </>
        )}
      </div>

      {/* Group bands */}
      {scene.bands.map((band) => (
        <div
          key={band.key}
          className="gp-bp-band absolute rounded-2xl"
          style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
        >
          {band.label && (
            <span className="absolute -top-2.5 left-3 rounded-full bg-neutral-950/90 px-2 text-[9px] font-medium text-emerald-300/70">
              {band.label}
            </span>
          )}
        </div>
      ))}

      {/* Connector ropes */}
      <svg className="absolute overflow-visible" style={{ left: 0, top: 0 }}>
        {scene.ropes.map((rope) => (
          <path
            key={rope.key}
            pathLength={1}
            className={rope.blocker ? 'gp-bp-rope gp-bp-rope--blocker' : 'gp-bp-rope'}
            d={rope.d}
            style={{ d: `path("${rope.d}")` } as React.CSSProperties}
            fill="none"
          />
        ))}
      </svg>

      {/* Blueprint chips */}
      {[...scene.chips, ...leavingChips].map((chip) => {
        const definition = widgetDefinition(chip.widgetType)
        const Icon = definition.icon
        const closing = !scene.chips.includes(chip)
        return (
          <div
            key={chip.key}
            className={`gp-bp-chip absolute flex items-center gap-2.5 rounded-xl px-3 ${closing ? 'gp-bp-chip--closing' : ''} ${busy && !closing ? 'gp-bp-chip--sketch' : ''} ${chip.depth === 0 ? 'gp-bp-chip--root' : ''}`}
            style={{
              left: chip.x,
              top: chip.y,
              width: CHIP_W,
              height: CHIP_H,
              animationDelay: closing ? '0ms' : `${Math.min(560, chip.depth * 90 + chip.siblingIndex * 45)}ms`,
            }}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${definition.accent}1f` }}
            >
              <Icon size={15} style={{ color: definition.accent }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium leading-tight text-neutral-100">{chip.title}</span>
              <span className="block truncate text-[9px] uppercase tracking-[0.14em] text-neutral-500">{definition.label}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
