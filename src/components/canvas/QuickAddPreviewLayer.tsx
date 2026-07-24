import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CornerDownLeft, Sparkles } from 'lucide-react'
import { useQuickAddPreviewStore } from '../../store/useQuickAddPreviewStore'
import { widgetDefinition } from '../../widgets/registry'
import {
  buildPreviewScene,
  PREVIEW_CHIP_HEIGHT,
  PREVIEW_CHIP_WIDTH,
  PREVIEW_PILL_GAP,
  type PreviewChip,
  type PreviewScene,
} from './quickAddPreviewScene'

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

/** Chips leaving the plan fold away instead of vanishing between frames. */
function useLeavingChips(chips: PreviewChip[]): PreviewChip[] {
  const previousRef = useRef<Map<string, PreviewChip>>(new Map())
  const [leaving, setLeaving] = useState<PreviewChip[]>([])
  const currentKeys = useMemo(() => new Set(chips.map((chip) => chip.key)), [chips])

  useEffect(() => {
    const gone: PreviewChip[] = []
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
    () => (candidate && anchor ? buildPreviewScene(candidate.plan, anchor) : null),
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
        style={{ left: anchor.x, top: anchor.y - PREVIEW_PILL_GAP, transform: 'translateX(-50%)' }}
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

      <BlueprintSceneView scene={scene} leavingChips={leavingChips} busy={busy} />
    </div>
  )
}

/** Shared blueprint paint: connector ropes and dashed chips. Quick Add and
 * the MCP connector preview both render proposed trees through this one
 * component so ghost trees look identical regardless of source. */
export function BlueprintSceneView({ scene, leavingChips = [], busy = false }: {
  scene: PreviewScene
  leavingChips?: PreviewChip[]
  busy?: boolean
}) {
  return (
    <>
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
              width: PREVIEW_CHIP_WIDTH,
              height: PREVIEW_CHIP_HEIGHT,
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
    </>
  )
}
