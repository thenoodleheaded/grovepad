import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Blocks, Check, Search, X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  orderedDefinitions,
  type WidgetCategory,
  type WidgetDefinition,
} from '../../widgets/registry'
import { DOMAIN_PACKS, DOMAIN_PACK_LABELS, snapToGrid } from '../../types/spatial'
import type { DomainPack, ModuleType, Vector2D } from '../../types/spatial'
import { ATLAS_CATALOG, ATLAS_TYPE_SET, type AtlasType } from '../../widgets/atlasCatalog'
import { AUTOMATION_CORE_CATALOG, AUTOMATION_CORE_SET, type AutomationCoreType } from '../../widgets/automationCoreCatalog'

interface AddWidgetModalProps {
  worldPos: Vector2D
  onClose: () => void
}

/** Pack blurbs shown on the pack cards — what enabling each one unlocks. */
const PACK_BLURBS: Partial<Record<DomainPack, string>> = {
  life: 'Life Systems — trackers, planners, recipe scale and habit tools',
  education: 'Education & Academics — study goals, GPA, assignments, Cornell notes, past papers',
  project_management: 'Project Management — timelines, SWOT, risk register, process flows, meeting meters',
  finance_analytics: 'Finance & Analytics — budgets, converter, timesheets, inventory, estimates',
  data_science: 'Data & Analytics — trend charting, experiment loops, metric reporting',
  software_eng: 'Software & Systems — 50+ automation gates, triggers, variables, webhooks, synthesizers',
  creative_writing: 'Creative Writing — script writing templates, dialogue boards, commission pipeline',
  ux_design: 'UX & UI Design — color palettes, asset generators, layout tools',
  game_dev: 'Game Mechanics Tuner — sliders for tuning grip, drift, and feel',
  music_production: 'Synthesizer & Audio Player — BPM, key, and signal chain',
}

/** Grid column count must mirror the responsive grid classes below so
 *  arrow-key navigation moves where the eye expects. */
function columnsForViewport(): number {
  if (window.innerWidth >= 1024) return 3
  if (window.innerWidth >= 640) return 2
  return 1
}

// ---------------------------------------------------------------------------
// Widget tile — big icon, name and description beside it
// ---------------------------------------------------------------------------

function WidgetTile({
  def,
  active,
  onSpawn,
  onHover,
}: {
  def: WidgetDefinition
  active: boolean
  onSpawn: () => void
  onHover: () => void
}) {
  const Icon = def.icon
  const ref = useRef<HTMLButtonElement>(null)

  // Keep the keyboard-highlighted tile in view while arrowing through.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <button
      ref={ref}
      type="button"
      data-active={active || undefined}
      onClick={onSpawn}
      onPointerEnter={onHover}
      className="gp-picker-row group/tile flex items-center gap-3.5 rounded-2xl border p-3 text-left"
      style={
        {
          '--gp-tile-accent': def.accent,
          ...(active
            ? {
                borderColor: `${def.accent}59`,
                background: `linear-gradient(120deg, ${def.accent}17 0%, ${def.accent}08 55%, transparent 100%)`,
                boxShadow: `0 6px 24px ${def.accent}14, inset 0 1px 0 ${def.accent}14`,
              }
            : undefined),
        } as React.CSSProperties
      }
    >
      <span
        className="gp-picker-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
        style={{
          color: def.accent,
          background: `linear-gradient(145deg, ${def.accent}2b 0%, ${def.accent}0d 100%)`,
          boxShadow: active
            ? `inset 0 0 0 1px ${def.accent}59, 0 4px 16px ${def.accent}30`
            : `inset 0 0 0 1px ${def.accent}24`,
        }}
      >
        <Icon size={22} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-neutral-200">
          {def.label}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-neutral-500">
          {def.description}
        </span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Packs view — specialist libraries, toggled per workspace
// ---------------------------------------------------------------------------

function PacksView({ onBack }: { onBack: () => void }) {
  const activePacks = useWidgetStore((state) => state.activePacks)
  const togglePack = useWidgetStore((state) => state.togglePack)
  const allDefs = orderedDefinitions()
  // Only show packs that actually ship widgets — toggling an empty pack
  // would be a no-op, so don't advertise it as a choice yet.
  const availablePacks = DOMAIN_PACKS.filter((pack) => allDefs.some((d) => d.pack === pack))

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 pb-1">
        <button
          data-packs-back
          type="button"
          onClick={onBack}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <ArrowLeft size={13} aria-hidden />
          Widgets
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-100">Domain Packs</h2>
        </div>
      </div>
      <p className="shrink-0 pb-4 text-[12px] text-neutral-500">
        Specialist toolkits for one kind of work. Enabling a pack adds its widgets to the
        picker — disabling it tucks them away again.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {availablePacks.map((pack, index) => {
            const isActive = activePacks.includes(pack)
            const packWidgets = allDefs.filter((d) => d.pack === pack)
            return (
              <button
                key={pack}
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => togglePack(pack)}
                className={`gp-rise flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors duration-150 ${
                  isActive
                    ? 'border-emerald-400/40 bg-emerald-400/[0.07]'
                    : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-800/40'
                }`}
                style={{ animationDelay: `${Math.min(index * 25, 250)}ms` }}
              >
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] font-medium transition-colors ${
                      isActive ? 'text-emerald-300' : 'text-neutral-200'
                    }`}
                  >
                    {DOMAIN_PACK_LABELS[pack]}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                    {PACK_BLURBS[pack] ?? packWidgets.map((d) => d.label).join(' · ')}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                    isActive
                      ? 'border-emerald-400 bg-emerald-400 text-neutral-950'
                      : 'border-neutral-700 text-transparent'
                  }`}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main picker — a full-screen library, no framing panel
// ---------------------------------------------------------------------------

/**
 * The widget library. Fills the screen over a blurred scrim — no boxed panel.
 * Arrow keys walk the grid, Enter places the highlighted widget, Esc closes.
 * The Packs button swaps in the domain-pack library in place.
 */
export function AddWidgetModal({ worldPos, onClose }: AddWidgetModalProps) {
  const activePacks = useWidgetStore((state) => state.activePacks)
  const initialView = useWidgetStore((state) => state.addWidgetView)
  const [view, setView] = useState<'widgets' | 'packs'>(initialView)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useOverlayLifecycle(true)
  useFocusTrap(true, dialogRef, searchRef)

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (view === 'widgets') searchRef.current?.focus()
      else dialogRef.current?.querySelector<HTMLButtonElement>('[data-packs-back]')?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [view])

  const groups = useMemo(() => {
    const q = query.toLowerCase().trim()
    const visible = orderedDefinitions().filter((def) => {
      if (def.pack && !activePacks.includes(def.pack)) return false
      if (!q) return true
      return (
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        CATEGORY_LABELS[def.category].toLowerCase().includes(q) ||
        (ATLAS_TYPE_SET.has(def.type) && ATLAS_CATALOG[def.type as AtlasType].aliases.some((alias) => alias.toLowerCase().includes(q))) ||
        (AUTOMATION_CORE_SET.has(def.type) && AUTOMATION_CORE_CATALOG[def.type as AutomationCoreType].aliases.some((alias) => alias.toLowerCase().includes(q)))
      )
    })
    const byCategory = new Map<WidgetCategory, WidgetDefinition[]>()
    for (const def of visible) {
      const list = byCategory.get(def.category)
      if (list) list.push(def)
      else byCategory.set(def.category, [def])
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
      category: c,
      defs: byCategory.get(c)!,
    }))
  }, [query, activePacks])

  /** All visible tiles in reading order — the keyboard walks this list. */
  const flat = useMemo(() => groups.flatMap((g) => g.defs), [groups])
  const clampedActive = Math.min(activeIndex, Math.max(0, flat.length - 1))

  const spawn = (type: ModuleType) => {
    const snapped = { x: snapToGrid(worldPos.x), y: snapToGrid(worldPos.y) }
    const def = orderedDefinitions().find((d) => d.type === type)
    const id = useWidgetStore.getState().createWidget(def?.label ?? 'Widget', snapped, type)
    useWidgetStore.getState().selectWidget(id, false)
    useWidgetStore.getState().startRenaming(id)
    onClose()
  }

  // One window-level key handler covers Esc everywhere plus grid navigation.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (view === 'packs') setView('widgets')
        else onClose()
        return
      }
      if (view !== 'widgets') return
      // Buttons retain native keyboard activation. Without this guard, Enter
      // on Close, Packs, or a focused tile also spawned the unrelated
      // highlighted tile through this window-level shortcut handler.
      if (e.target instanceof HTMLButtonElement) return
      const cols = columnsForViewport()
      const move = (delta: number) => {
        e.preventDefault()
        setActiveIndex((i) => {
          const next = Math.min(Math.max(0, i + delta), Math.max(0, flat.length - 1))
          return next
        })
      }
      // While the search field holds text, ←/→ belong to the caret.
      const editingQuery =
        document.activeElement === searchRef.current && query.length > 0
      switch (e.key) {
        case 'ArrowDown':
          move(cols)
          break
        case 'ArrowUp':
          move(-cols)
          break
        case 'ArrowRight':
          if (!editingQuery) move(1)
          break
        case 'ArrowLeft':
          if (!editingQuery) move(-1)
          break
        case 'Enter': {
          const def = flat[Math.min(activeIndex, flat.length - 1)]
          if (def) {
            e.preventDefault()
            spawn(def.type)
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, flat, activeIndex, query, onClose])

  // Flat index offset of each group's first tile, for active-state mapping.
  const groupOffsets = useMemo(() => {
    const offsets: number[] = []
    let acc = 0
    for (const g of groups) {
      offsets.push(acc)
      acc += g.defs.length
    }
    return offsets
  }, [groups])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add widget"
      className="fixed inset-0 z-[200]"
    >
      {/* Scrim — the canvas glows through a single cheap blur layer */}
      <div
        role="presentation"
        className="gp-fade absolute inset-0 gp-picker-scrim"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col px-6 outline-none sm:px-10"
      >
        {view === 'packs' ? (
          <div className="flex min-h-0 flex-1 flex-col pt-10">
            <PacksView onBack={() => setView('widgets')} />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 pt-10 pb-1">
              <div className="min-w-0">
                <h2 className="bg-gradient-to-r from-neutral-100 via-emerald-300 to-neutral-100 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
                  Widget Library
                </h2>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  Pick a card — it lands right where you clicked.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setView('packs')}
                  className="flex h-8 items-center gap-1.5 rounded-lg border gp-hairline px-3 text-[12px] font-medium text-neutral-300 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
                >
                  <Blocks size={13} aria-hidden />
                  Packs
                </button>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                >
                  <X size={15} aria-hidden />
                </button>
              </div>
            </div>

            {/* Search — a glowing glass pill under the title */}
            <div className="gp-picker-search mt-3 flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5">
              <Search size={17} className="shrink-0 text-neutral-600" aria-hidden />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder="Search widgets…"
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveIndex(0)
                }}
                className="w-full bg-transparent text-[16px] text-neutral-100 outline-none placeholder:text-neutral-600"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('')
                    setActiveIndex(0)
                    searchRef.current?.focus()
                  }}
                  className="shrink-0 text-neutral-600 transition-colors hover:text-neutral-300"
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>

            {/* Library */}
            <div className="min-h-0 flex-1 overflow-y-auto py-5">
              {groups.length === 0 && (
                <p className="py-16 text-center text-[13px] text-neutral-600">
                  No widgets match “{query}”
                </p>
              )}
              <div className="flex flex-col gap-6">
                {groups.map(({ category, defs }, groupIndex) => (
                  <section
                    key={category}
                    className="gp-rise"
                    style={{ animationDelay: `${Math.min(groupIndex * 40, 200)}ms` }}
                  >
                    <div className="flex items-center gap-2.5 pb-2">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: defs[0]!.accent,
                          boxShadow: `0 0 8px ${defs[0]!.accent}90`,
                        }}
                      />
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                        {CATEGORY_LABELS[category]}
                      </h3>
                      <span
                        aria-hidden
                        className="h-px flex-1"
                        style={{
                          background: `linear-gradient(90deg, ${defs[0]!.accent}46, transparent)`,
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {defs.map((def, defIndex) => {
                        const flatIndex = groupOffsets[groupIndex]! + defIndex
                        return (
                          <WidgetTile
                            key={def.type}
                            def={def}
                            active={flatIndex === clampedActive}
                            onSpawn={() => spawn(def.type)}
                            onHover={() => setActiveIndex(flatIndex)}
                          />
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            {/* Foot hints */}
            <div className="flex h-11 shrink-0 items-center justify-between border-t gp-hairline text-[11px] text-neutral-600">
              <span>
                <kbd className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">↑↓←→</kbd>{' '}
                navigate ·{' '}
                <kbd className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">↵</kbd>{' '}
                place ·{' '}
                <kbd className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">esc</kbd>{' '}
                close
              </span>
              <span className="font-mono tabular-nums">
                {flat.length} {flat.length === 1 ? 'widget' : 'widgets'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
