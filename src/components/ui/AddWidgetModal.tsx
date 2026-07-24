import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Blocks, Check, ChevronDown, Search, Star, X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetPickerPrefsStore } from '../../store/useWidgetPickerPrefsStore'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  isWidgetTypePublic,
  orderedDefinitions,
  type WidgetCategory,
  type WidgetDefinition,
} from '../../widgets/registry'
import { DOMAIN_PACKS, DOMAIN_PACK_LABELS, snapToGrid } from '../../types/spatial'
import type { DomainPack, ModuleType, Vector2D } from '../../types/spatial'
import { ATLAS_CATALOG, ATLAS_TYPES, ATLAS_TYPE_SET, type AtlasType } from '../../widgets/atlasCatalog'
import { AUTOMATION_CORE_CATALOG, AUTOMATION_CORE_SET, type AutomationCoreType } from '../../widgets/automationCoreCatalog'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'

interface AddWidgetModalProps {
  worldPos: Vector2D
  onClose: () => void
  selection?: {
    initialTypes: readonly ModuleType[]
    onConfirm: (types: ModuleType[]) => void
  }
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
  if (window.innerWidth >= 1280) return 4
  if (window.innerWidth >= 1024) return 3
  if (window.innerWidth >= 640) return 2
  return 1
}

// ---------------------------------------------------------------------------
// Widget tile — dark accent glass with a bright icon island embedded at left
// ---------------------------------------------------------------------------

function WidgetTile({
  def,
  active,
  selected,
  selecting,
  favorited,
  onChoose,
  onHover,
  onUnhover,
  onToggleFavorite,
}: {
  def: WidgetDefinition
  active: boolean
  selected: boolean
  selecting: boolean
  favorited: boolean
  onChoose: () => void
  onHover: () => void
  onUnhover: () => void
  onToggleFavorite: () => void
}) {
  const Icon = def.icon
  const ref = useRef<HTMLButtonElement>(null)

  // Keep the keyboard-highlighted tile in view while arrowing through.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="group/tile relative" style={{ '--gp-tile-accent': def.accent } as React.CSSProperties}>
      <button
        ref={ref}
        type="button"
        aria-label={selecting
          ? `${selected ? 'Deselect' : 'Select'} ${def.label}`
          : `Add ${def.label}`}
        aria-pressed={selecting ? selected : undefined}
        data-active={active || undefined}
        data-selected={selected || undefined}
        onClick={onChoose}
        onPointerEnter={onHover}
        onPointerLeave={onUnhover}
        className="gp-picker-row relative grid min-h-[104px] w-full grid-cols-[80px_minmax(0,1fr)] items-start gap-4 rounded-[22px] p-3 pr-5 text-left"
      >
        <span
          className="gp-picker-icon relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[18px]"
          style={{ color: def.accent }}
        >
          <Icon size={42} strokeWidth={1.8} aria-hidden />
        </span>
        <span className="relative z-[1] flex min-w-0 flex-col gap-1.5 self-stretch pr-12">
          <span className="gp-picker-tile-title block truncate text-[19px] font-semibold tracking-[-0.02em] text-neutral-100">
            {def.label}
          </span>
          <span className="gp-picker-tile-description line-clamp-2 block text-[11.5px] leading-[1.45] text-neutral-400/85">
            {def.description}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={favorited ? `Remove ${def.label} from favorites` : `Favorite ${def.label}`}
        aria-pressed={favorited}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite()
        }}
        className={`gp-touch-target absolute top-3.5 right-3.5 z-[2] flex h-6 w-6 items-center justify-center rounded-full transition-opacity duration-150 ${
          favorited
            ? 'text-amber-300 opacity-100'
            : 'text-neutral-500 opacity-0 hover:text-amber-200 focus-visible:opacity-100 group-hover/tile:opacity-100'
        }`}
      >
        <Star size={14} strokeWidth={1.8} fill={favorited ? 'currentColor' : 'none'} aria-hidden />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Packs view — specialist libraries, toggled per workspace
// ---------------------------------------------------------------------------

function PacksView({ onBack }: { onBack: () => void }) {
  const activePacks = useWidgetStore((state) => state.activePacks)
  const togglePack = useWidgetStore((state) => state.togglePack)
  const hiddenPackWidgetTypes = useWidgetPickerPrefsStore((state) => state.hiddenPackWidgetTypes)
  const toggleHiddenPackWidgetType = useWidgetPickerPrefsStore((state) => state.toggleHiddenPackWidgetType)
  const [expandedPack, setExpandedPack] = useState<DomainPack | null>(null)
  const allDefs = orderedDefinitions().filter((def) => isWidgetTypePublic(def.type))
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
          className="gp-touch-target flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
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
            const isExpanded = expandedPack === pack
            return (
              <div
                key={pack}
                className={`gp-rise flex flex-col rounded-2xl border transition-colors duration-150 ${
                  isActive
                    ? 'border-emerald-400/40 bg-emerald-400/[0.07]'
                    : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-800/40'
                }`}
                style={{ animationDelay: `${Math.min(index * 25, 250)}ms` }}
              >
                <div className="flex items-center gap-1.5 p-2 pl-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => togglePack(pack)}
                    className="gp-touch-target flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl py-1.5 text-left"
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
                  {isActive && (
                    <button
                      type="button"
                      aria-label={
                        isExpanded
                          ? `Collapse ${DOMAIN_PACK_LABELS[pack]} widget list`
                          : `Choose which ${DOMAIN_PACK_LABELS[pack]} widgets to show`
                      }
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedPack(isExpanded ? null : pack)}
                      className="gp-touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>
                  )}
                </div>
                {isActive && isExpanded && (
                  <div className="flex flex-col gap-0.5 border-t gp-hairline px-2 pt-1.5 pb-2">
                    {packWidgets.map((def) => {
                      const hidden = hiddenPackWidgetTypes.includes(def.type)
                      return (
                        <button
                          key={def.type}
                          type="button"
                          role="switch"
                          aria-checked={!hidden}
                          onClick={() => toggleHiddenPackWidgetType(def.type)}
                          className="gp-touch-target flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-neutral-800/60"
                        >
                          <span className={hidden ? 'text-neutral-600 line-through' : 'text-neutral-300'}>
                            {def.label}
                          </span>
                          <span
                            aria-hidden
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              hidden
                                ? 'border-neutral-700 text-transparent'
                                : 'border-emerald-400 bg-emerald-400 text-neutral-950'
                            }`}
                          >
                            <Check size={9} strokeWidth={3} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
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
export function AddWidgetModal({ worldPos, onClose, selection }: AddWidgetModalProps) {
  const activePacks = useWidgetStore((state) => state.activePacks)
  const favoriteWidgetTypes = useWidgetPickerPrefsStore((state) => state.favoriteWidgetTypes)
  const hiddenPackWidgetTypes = useWidgetPickerPrefsStore((state) => state.hiddenPackWidgetTypes)
  const toggleFavoriteWidgetType = useWidgetPickerPrefsStore((state) => state.toggleFavoriteWidgetType)
  const shouldFocusSearchNow = useAdaptiveInputStore((state) =>
    state.capabilities.viewportClass === 'desktop' &&
    state.activeInput !== 'touch' &&
    state.activeInput !== 'pen',
  )
  const shouldFocusSearch = useRef(shouldFocusSearchNow).current
  const initialView = useWidgetStore((state) => state.addWidgetView)
  const [view, setView] = useState<'widgets' | 'packs'>(initialView)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [keyboardActive, setKeyboardActive] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<ModuleType[]>(
    () => [...(selection?.initialTypes ?? [])],
  )
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useOverlayLifecycle(true)
  useFocusTrap(true, dialogRef, shouldFocusSearch ? searchRef : dialogRef)

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (view === 'widgets') {
        if (shouldFocusSearch) searchRef.current?.focus()
        else dialogRef.current?.focus({ preventScroll: true })
      }
      else dialogRef.current?.querySelector<HTMLButtonElement>('[data-packs-back]')?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [view, shouldFocusSearch])

  const groups = useMemo(() => {
    const q = query.toLowerCase().trim()
    const visible = orderedDefinitions().filter((def) => {
      if (!isWidgetTypePublic(def.type)) return false
      if (def.pack && !activePacks.includes(def.pack)) return false
      if (def.pack && hiddenPackWidgetTypes.includes(def.type)) return false
      if (!q) return true
      return (
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        CATEGORY_LABELS[def.category].toLowerCase().includes(q) ||
        (def.type === 'tracker' && ATLAS_TYPES.some((type) => {
          const spec=ATLAS_CATALOG[type]
          return spec.label.toLowerCase().includes(q)||spec.aliases.some(alias=>alias.toLowerCase().includes(q))
        })) ||
        (ATLAS_TYPE_SET.has(def.type) && ATLAS_CATALOG[def.type as AtlasType].aliases.some((alias) => alias.toLowerCase().includes(q))) ||
        (AUTOMATION_CORE_SET.has(def.type) && AUTOMATION_CORE_CATALOG[def.type as AutomationCoreType].aliases.some((alias) => alias.toLowerCase().includes(q)))
      )
    })
    // Favorites are pulled out of their normal category and pinned first,
    // always — a favorited widget never shows twice.
    const favoriteSet = new Set(favoriteWidgetTypes)
    const favorites = visible.filter((def) => favoriteSet.has(def.type))
    const rest = visible.filter((def) => !favoriteSet.has(def.type))
    const byCategory = new Map<WidgetCategory, WidgetDefinition[]>()
    for (const def of rest) {
      const list = byCategory.get(def.category)
      if (list) list.push(def)
      else byCategory.set(def.category, [def])
    }
    const categoryGroups = CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
      category: c as WidgetCategory | 'favorites',
      defs: byCategory.get(c)!,
    }))
    return favorites.length > 0
      ? [{ category: 'favorites' as const, defs: favorites }, ...categoryGroups]
      : categoryGroups
  }, [query, activePacks, hiddenPackWidgetTypes, favoriteWidgetTypes])

  /** All visible tiles in reading order — the keyboard walks this list. */
  const flat = useMemo(() => groups.flatMap((g) => g.defs), [groups])
  const clampedActive = Math.min(activeIndex, Math.max(0, flat.length - 1))

  const choose = useCallback((type: ModuleType) => {
    if (selection) {
      setSelectedTypes((current) => current.includes(type)
        ? current.filter((candidate) => candidate !== type)
        : [...current, type])
      return
    }
    const snapped = { x: snapToGrid(worldPos.x), y: snapToGrid(worldPos.y) }
    const def = orderedDefinitions().find((d) => d.type === type)
    const id = useWidgetStore.getState().createWidget(def?.label ?? 'Widget', snapped, type)
    useWidgetStore.getState().selectWidget(id, false)
    useWidgetStore.getState().startRenaming(id)
    onClose()
  }, [selection, worldPos.x, worldPos.y, onClose])

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
        setHoveredIndex(null)
        setKeyboardActive(true)
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
            choose(def.type)
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, flat, activeIndex, query, onClose, choose])

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
      aria-label={selection ? 'Choose widgets for this tree point' : 'Add widget'}
      className={`gp-widget-picker-dialog fixed inset-0 ${selection ? 'z-[240]' : 'z-[200]'}`}
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
        className="gp-widget-picker-shell relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col px-4 outline-none sm:px-6 lg:px-8 2xl:px-10"
      >
        {view === 'packs' ? (
          <div className="flex min-h-0 flex-1 flex-col pt-10">
            <PacksView onBack={() => setView('widgets')} />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="gp-picker-header flex shrink-0 items-center justify-between gap-3 pt-10 pb-1">
              <div className="gp-popup-title-pill gp-panel gp-pop flex h-10 min-w-0 items-center rounded-full px-4">
                <h2 className="gp-picker-title bg-gradient-to-r from-neutral-100 via-emerald-300 to-neutral-100 bg-clip-text text-[15px] font-semibold tracking-tight text-transparent">
                  {selection ? 'Choose widgets for this tree point' : 'Widget Library'}
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setView('packs')}
                  className="gp-picker-pack-button gp-popup-action gp-touch-target"
                >
                  <Blocks size={13} aria-hidden />
                  Packs
                </button>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="gp-picker-close gp-popup-close-naked gp-touch-target h-8 w-8"
                >
                  <X size={15} aria-hidden />
                </button>
              </div>
            </div>

            {/* Search — a glowing glass pill under the title */}
            <div className="gp-picker-search gp-popup-island mt-3 flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5">
              <Search size={17} className="shrink-0 text-neutral-600" aria-hidden />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder="Search widgets…"
                autoComplete="off"
                enterKeyHint="search"
                spellCheck={false}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveIndex(0)
                  setHoveredIndex(null)
                  setKeyboardActive(false)
                }}
                className="gp-picker-search-input w-full bg-transparent text-[16px] text-neutral-100 outline-none placeholder:text-neutral-600"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('')
                    setActiveIndex(0)
                    setHoveredIndex(null)
                    setKeyboardActive(false)
                    searchRef.current?.focus()
                  }}
                  className="gp-touch-target shrink-0 text-neutral-600 transition-colors hover:text-neutral-300"
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
                {groups.map(({ category, defs }, groupIndex) => {
                  const isFavorites = category === 'favorites'
                  const dotAccent = isFavorites ? '#fbbf24' : defs[0]!.accent
                  return (
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
                            background: dotAccent,
                            boxShadow: `0 0 8px ${dotAccent}90`,
                          }}
                        />
                        <h3 className="gp-picker-category-label  text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                          {isFavorites ? 'Favorites' : CATEGORY_LABELS[category]}
                        </h3>
                        <span
                          aria-hidden
                          className="h-px flex-1"
                          style={{
                            background: `linear-gradient(90deg, ${dotAccent}46, transparent)`,
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {defs.map((def, defIndex) => {
                          const flatIndex = groupOffsets[groupIndex]! + defIndex
                          return (
                            <WidgetTile
                              key={def.type}
                              def={def}
                              active={
                                flatIndex === hoveredIndex ||
                                (hoveredIndex === null && keyboardActive && flatIndex === clampedActive)
                              }
                              selected={selectedTypes.includes(def.type)}
                              selecting={Boolean(selection)}
                              favorited={favoriteWidgetTypes.includes(def.type)}
                              onChoose={() => choose(def.type)}
                              onHover={() => {
                                setHoveredIndex(flatIndex)
                                setKeyboardActive(false)
                              }}
                              onUnhover={() => setHoveredIndex(null)}
                              onToggleFavorite={() => toggleFavoriteWidgetType(def.type)}
                            />
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>

            {selection ? (
              <div className="gp-picker-footer flex min-h-14 shrink-0 items-center justify-between gap-3 border-t gp-hairline pb-[var(--gp-safe-bottom)] text-[11px] text-neutral-500">
                <span aria-live="polite">
                  <strong className="text-neutral-100 tabular-nums">{selectedTypes.length}</strong>{' '}
                  {selectedTypes.length === 1 ? 'widget selected' : 'widgets selected'}
                </span>
                <div className="flex items-center gap-2">
                  {selection.initialTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => selection.onConfirm([])}
                      className="gp-touch-target rounded-xl px-3 text-xs text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      Clear node
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="gp-touch-target rounded-xl px-3 text-xs text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={selectedTypes.length === 0}
                    onClick={() => selection.onConfirm(selectedTypes)}
                    className="gp-touch-target rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    OK
                  </button>
                </div>
              </div>
            ) : (
              <div className="gp-picker-footer flex h-11 shrink-0 items-center justify-between border-t gp-hairline text-[11px] text-neutral-600">
                <span className="gp-picker-key-hints">
                  <kbd className="rounded bg-neutral-800/80 px-1.5 py-0.5  text-[10px] text-neutral-400">↑↓←→</kbd>{' '}
                  navigate ·{' '}
                  <kbd className="rounded bg-neutral-800/80 px-1.5 py-0.5  text-[10px] text-neutral-400">↵</kbd>{' '}
                  place ·{' '}
                  <kbd className="rounded bg-neutral-800/80 px-1.5 py-0.5  text-[10px] text-neutral-400">esc</kbd>{' '}
                  close
                </span>
                <span className=" tabular-nums">
                  {flat.length} {flat.length === 1 ? 'widget' : 'widgets'}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
