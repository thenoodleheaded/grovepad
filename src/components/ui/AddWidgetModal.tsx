import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Star, X } from 'lucide-react'
import { useOverlayDismiss } from '../../hooks/useOverlayDismiss'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetPickerPrefsStore } from '../../store/useWidgetPickerPrefsStore'
import { isStudyFocusType } from '../../widgets/studyFocus'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  isWidgetTypePublic,
  orderedDefinitions,
  type WidgetCategory,
  type WidgetDefinition,
} from '../../widgets/registry'
import { snapToGrid } from '../../types/spatial'
import type { ModuleType, Vector2D } from '../../types/spatial'
import { ATLAS_CATALOG, ATLAS_TYPES, ATLAS_TYPE_SET, type AtlasType } from '../../widgets/atlasCatalog'
import { AUTOMATION_CORE_CATALOG, AUTOMATION_CORE_SET, type AutomationCoreType } from '../../widgets/automationCoreCatalog'
import { useAdaptiveInputStore } from '../../store/useAdaptiveInputStore'
import { WidgetFace } from './widgetFaces'

interface AddWidgetModalProps {
  worldPos: Vector2D
  onClose: () => void
  selection?: {
    initialTypes: readonly ModuleType[]
    onConfirm: (types: ModuleType[]) => void
  }
}

/** Palette geometry. One column of rows, narrow enough to sit beside your work
 *  rather than over it — a library is read, not surveyed. */
const PALETTE_WIDTH = 408
/** Gap between the spawn point and the panel corner it grows from. */
const ANCHOR_OFFSET = 14
/** Keep the panel clear of the window edge and of the canvas toolbar. */
const VIEWPORT_MARGIN = 16
const TOOLBAR_CLEARANCE = 64

interface PalettePlacement {
  left: number
  top: number
  origin: string
}

/**
 * Places the palette next to the point the widget will land on, clamped inside
 * the window, and reports the transform origin so the open animation grows out
 * of that point rather than out of the middle of nowhere.
 */
function placePalette(anchor: Vector2D, panel: { width: number; height: number }): PalettePlacement {
  const maxLeft = window.innerWidth - panel.width - VIEWPORT_MARGIN
  const maxTop = window.innerHeight - panel.height - VIEWPORT_MARGIN
  // Prefer growing down-right from the point; flip to the other side when the
  // panel would run off the window rather than sliding it far from the anchor.
  const wantsLeft = anchor.x + ANCHOR_OFFSET + panel.width > window.innerWidth - VIEWPORT_MARGIN
  const wantsUp = anchor.y + ANCHOR_OFFSET + panel.height > window.innerHeight - VIEWPORT_MARGIN
  const rawLeft = wantsLeft ? anchor.x - ANCHOR_OFFSET - panel.width : anchor.x + ANCHOR_OFFSET
  const rawTop = wantsUp ? anchor.y - ANCHOR_OFFSET - panel.height : anchor.y + ANCHOR_OFFSET
  const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), Math.max(VIEWPORT_MARGIN, maxLeft))
  const top = Math.min(Math.max(TOOLBAR_CLEARANCE, rawTop), Math.max(TOOLBAR_CLEARANCE, maxTop))
  const originX = Math.min(Math.max(0, anchor.x - left), panel.width)
  const originY = Math.min(Math.max(0, anchor.y - top), panel.height)
  return { left, top, origin: `${originX}px ${originY}px` }
}

/** Every word a search should be able to find a widget by. */
function haystack(def: WidgetDefinition): string {
  const aliases: string[] = []
  if (def.type === 'tracker') {
    for (const type of ATLAS_TYPES) {
      aliases.push(ATLAS_CATALOG[type].label, ...ATLAS_CATALOG[type].aliases)
    }
  }
  if (ATLAS_TYPE_SET.has(def.type)) aliases.push(...ATLAS_CATALOG[def.type as AtlasType].aliases)
  if (AUTOMATION_CORE_SET.has(def.type)) aliases.push(...AUTOMATION_CORE_CATALOG[def.type as AutomationCoreType].aliases)
  return [def.label, def.description, CATEGORY_LABELS[def.category], ...aliases].join(' ').toLowerCase()
}

interface PickerGroup {
  key: string
  label: string | null
  defs: WidgetDefinition[]
}

// ---------------------------------------------------------------------------
// Widget row — a face, a name, and the family it belongs to
// ---------------------------------------------------------------------------

function WidgetRow({
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
  const ref = useRef<HTMLButtonElement>(null)

  // Keep the keyboard-highlighted row in view while arrowing through.
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
        className="gp-facet-row relative flex w-full items-center gap-3.5 rounded-[14px] pr-12 pl-4 text-left"
      >
        <span className="gp-facet-glyph flex h-[22px] w-[29px] shrink-0 items-center justify-center">
          <WidgetFace type={def.type} category={def.category} />
        </span>
        <span className="gp-facet-label min-w-0 flex-1 truncate text-[14px] leading-none font-medium tracking-[-0.012em]">
          {def.label}
        </span>
        <span className="gp-facet-meta shrink-0 text-[9.5px] leading-none tracking-[0.09em] uppercase">
          {CATEGORY_LABELS[def.category]}
        </span>
      </button>
      {selecting ? (
        <span
          aria-hidden
          data-on={selected || undefined}
          className="gp-facet-check pointer-events-none absolute inset-y-0 right-3.5 my-auto flex h-[19px] w-[19px] items-center justify-center rounded-full"
        >
          <Check size={12} strokeWidth={2.4} />
        </span>
      ) : (
        <button
          type="button"
          aria-label={favorited ? `Remove ${def.label} from favorites` : `Favorite ${def.label}`}
          aria-pressed={favorited}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          className={`gp-facet-star gp-touch-target absolute inset-y-0 right-2.5 my-auto z-[2] flex h-7 w-7 items-center justify-center rounded-full transition-opacity duration-150 ${
            favorited
              ? 'text-amber-300 opacity-100'
              : 'opacity-0 focus-visible:opacity-100 group-hover/tile:opacity-100'
          }`}
        >
          <Star size={13} strokeWidth={1.9} fill={favorited ? 'currentColor' : 'none'} aria-hidden />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main picker — one column, one hue at a time
// ---------------------------------------------------------------------------

/**
 * The widget library as a single readable column. Each widget draws a small
 * picture of its own layout instead of wearing a coloured app icon, so the
 * shape tells you what it is and the ink can stay neutral. Exactly one colour
 * is ever lit — the row you are on — and the panel's crown takes that same hue,
 * so browsing feels like turning a facet to the light rather than reading a
 * wall of badges.
 *
 * Type to filter, arrows to walk, Enter to place, Esc to close. Which libraries
 * this column draws from is a setup decision, not a step in the add flow —
 * domain packs live in Settings → Data.
 */
export function AddWidgetModal({ worldPos, onClose, selection }: AddWidgetModalProps) {
  const activePacks = useWidgetStore((state) => state.activePacks)
  const favoriteWidgetTypes = useWidgetPickerPrefsStore((state) => state.favoriteWidgetTypes)
  const hiddenPackWidgetTypes = useWidgetPickerPrefsStore((state) => state.hiddenPackWidgetTypes)
  const toggleFavoriteWidgetType = useWidgetPickerPrefsStore((state) => state.toggleFavoriteWidgetType)
  const recentWidgetTypes = useWidgetPickerPrefsStore((state) => state.recentWidgetTypes)
  const studyFocus = useWidgetPickerPrefsStore((state) => state.studyFocus)
  const shouldFocusSearchNow = useAdaptiveInputStore((state) =>
    state.capabilities.viewportClass === 'desktop' &&
    state.activeInput !== 'touch' &&
    state.activeInput !== 'pen',
  )
  const shouldFocusSearch = useRef(shouldFocusSearchNow).current
  const isPhone = useAdaptiveInputStore((state) => state.capabilities.viewportClass === 'phone')
  // Read the camera once, not as a subscription: the palette is anchored where
  // it opened and must not chase the board if something pans underneath it.
  const anchor = useRef<Vector2D>(
    (() => {
      const { pan, zoom } = useCanvasStore.getState()
      return { x: worldPos.x * zoom + pan.x, y: worldPos.y * zoom + pan.y }
    })(),
  ).current
  const [placement, setPlacement] = useState<PalettePlacement | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  // The column always has a lit row, so Enter always has a target and the
  // crown always has a hue. Hovering hands the highlight to the pointer and
  // leaving hands it back where the pointer left it.
  const [keyboardActive, setKeyboardActive] = useState(true)
  const [selectedTypes, setSelectedTypes] = useState<ModuleType[]>(
    () => [...(selection?.initialTypes ?? [])],
  )
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // The window keydown below owns Escape alongside column navigation, so the
  // shared hook skips Escape.
  useOverlayDismiss(true, onClose, {
    containerRef: dialogRef,
    initialFocusRef: shouldFocusSearch ? searchRef : dialogRef,
    escape: false,
  })

  // Measure first, then place and reveal: the panel's height depends on how
  // many widgets survived the filter, and a flip decision needs that height.
  useLayoutEffect(() => {
    if (isPhone) return
    const panel = dialogRef.current
    if (!panel) return
    const measure = () => {
      const box = panel.getBoundingClientRect()
      setPlacement(placePalette(anchor, { width: box.width, height: box.height }))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [anchor, isPhone])

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (shouldFocusSearch) searchRef.current?.focus()
      else dialogRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [shouldFocusSearch])

  /** The column, in bands: pinned first, then recently placed, then each family
   *  in order. Searching collapses the bands into one ranked list — a name that
   *  starts with what you typed outranks one that merely contains it. */
  const groups = useMemo<PickerGroup[]>(() => {
    const q = query.toLowerCase().trim()
    const visible = orderedDefinitions().filter((def) => {
      if (!isWidgetTypePublic(def.type)) return false
      if (studyFocus && !isStudyFocusType(def.type)) return false
      // Study focus is its own allow-list, so it overrides the pack gate: a
      // study card stays reachable with its pack switched off, and the switch
      // can never leave the picker emptier than the set it names.
      if (!studyFocus && def.pack && !activePacks.includes(def.pack)) return false
      if (def.pack && hiddenPackWidgetTypes.includes(def.type)) return false
      return true
    })

    if (q) {
      const ranked = visible
        .map((def) => {
          const label = def.label.toLowerCase()
          const rank = label.startsWith(q) ? 0 : label.includes(q) ? 1 : haystack(def).includes(q) ? 2 : 3
          return { def, rank }
        })
        .filter((entry) => entry.rank < 3)
        .sort((a, b) => a.rank - b.rank || a.def.label.localeCompare(b.def.label))
      return ranked.length ? [{ key: 'results', label: null, defs: ranked.map((entry) => entry.def) }] : []
    }

    const favoriteSet = new Set(favoriteWidgetTypes)
    const favorites = visible.filter((def) => favoriteSet.has(def.type))
    const rest = visible.filter((def) => !favoriteSet.has(def.type))
    const recentDefs = recentWidgetTypes
      .map((type) => rest.find((def) => def.type === type))
      .filter((def): def is WidgetDefinition => Boolean(def))
    const recentSet = new Set(recentDefs.map((def) => def.type))
    const byCategory = new Map<WidgetCategory, WidgetDefinition[]>()
    for (const def of rest) {
      if (recentSet.has(def.type)) continue
      const list = byCategory.get(def.category)
      if (list) list.push(def)
      else byCategory.set(def.category, [def])
    }
    const bands: PickerGroup[] = []
    if (favorites.length) bands.push({ key: 'pinned', label: 'Pinned', defs: favorites })
    if (recentDefs.length) bands.push({ key: 'recent', label: 'Recent', defs: recentDefs })
    for (const category of CATEGORY_ORDER) {
      const defs = byCategory.get(category)
      if (defs?.length) bands.push({ key: category, label: CATEGORY_LABELS[category], defs })
    }
    return bands
  }, [query, activePacks, hiddenPackWidgetTypes, favoriteWidgetTypes, recentWidgetTypes, studyFocus])

  const flat = useMemo(() => groups.flatMap((group) => group.defs), [groups])
  const clampedActive = Math.min(activeIndex, Math.max(0, flat.length - 1))
  const litIndex = hoveredIndex ?? (keyboardActive ? clampedActive : null)
  const litAccent = litIndex === null ? null : flat[litIndex]?.accent ?? null

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
    useWidgetPickerPrefsStore.getState().recordRecentWidgetType(type)
    useWidgetStore.getState().selectWidget(id, false)
    useWidgetStore.getState().startRenaming(id)
    onClose()
  }, [selection, worldPos.x, worldPos.y, onClose])

  // One window-level key handler covers Esc everywhere plus column navigation.
  // Left and right are deliberately absent: they belong to the search caret.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      // Buttons retain native keyboard activation. Without this guard, Enter
      // on Close or a focused row also spawned the unrelated highlighted row
      // through this window-level shortcut handler.
      if (e.target instanceof HTMLButtonElement) return
      const last = Math.max(0, flat.length - 1)
      const moveTo = (next: number) => {
        e.preventDefault()
        setHoveredIndex(null)
        setKeyboardActive(true)
        setActiveIndex(Math.min(Math.max(0, next), last))
      }
      switch (e.key) {
        case 'ArrowDown':
          moveTo(clampedActive + 1)
          break
        case 'ArrowUp':
          moveTo(clampedActive - 1)
          break
        case 'PageDown':
          moveTo(clampedActive + 8)
          break
        case 'PageUp':
          moveTo(clampedActive - 8)
          break
        case 'Home':
          moveTo(0)
          break
        case 'End':
          moveTo(last)
          break
        case 'Enter': {
          const def = flat[clampedActive]
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
  }, [flat, clampedActive, onClose, choose])

  let cursor = -1

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={selection ? 'Choose widgets for this tree point' : 'Add widget'}
      className={`gp-widget-picker-dialog fixed inset-0 ${selection ? 'z-[240]' : 'z-[200]'}`}
    >
      {/* Scrim — a light hush, not a curtain. The board stays readable so the
          palette reads as something on top of your work, not a new screen. */}
      <div
        role="presentation"
        className="gp-fade absolute inset-0 gp-palette-scrim"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        data-placed={placement || isPhone ? '' : undefined}
        data-lit={litAccent ? '' : undefined}
        className={`gp-widget-palette gp-facet-panel gp-panel absolute flex max-h-[min(620px,78dvh)] flex-col overflow-hidden outline-none ${
          isPhone ? 'gp-widget-palette-sheet inset-x-0 bottom-0' : ''
        }`}
        style={
          {
            '--gp-lit-accent': litAccent ?? 'transparent',
            ...(isPhone
              ? {}
              : {
                  width: PALETTE_WIDTH,
                  left: placement?.left ?? anchor.x,
                  top: placement?.top ?? anchor.y,
                  transformOrigin: placement?.origin ?? 'center',
                }),
          } as React.CSSProperties
        }
      >
        {/* The crown — the one place colour lives, taking the hue of whatever
            row is lit and cross-fading as you walk the column. */}
        <div className="gp-facet-crown pointer-events-none absolute inset-x-0 top-0 h-24" aria-hidden />

        {/* Search — a bare line, already focused. No title, no toolbar, no
            close button on a machine that has Esc. */}
        <div className="gp-facet-search relative flex shrink-0 items-center gap-3 px-5 pt-5 pb-4">
          <input
            ref={searchRef}
            type="text"
            value={query}
            placeholder={selection ? 'Search widgets to add…' : 'Search widgets…'}
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
            aria-label="Search widgets"
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
              setHoveredIndex(null)
              setKeyboardActive(true)
            }}
            className="gp-facet-search-input min-w-0 flex-1 bg-transparent text-[15.5px] leading-none tracking-[-0.015em] outline-none"
          />
          <span className="gp-facet-count shrink-0 text-[10.5px] leading-none tabular-nums">
            {flat.length}
          </span>
          {isPhone && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="gp-facet-close gp-touch-target -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>

        {/* The column */}
        <div className="gp-facet-list min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
          {flat.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-14">
              <p className="gp-facet-empty text-center text-[13px]">Nothing named “{query}”</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setActiveIndex(0)
                  searchRef.current?.focus()
                }}
                className="gp-facet-empty-action rounded-xl px-3 py-1.5 text-xs font-medium"
              >
                Browse the whole library
              </button>
            </div>
          )}
          {groups.map((group) => (
            <div key={group.key} className="gp-facet-band">
              {group.label && (
                <div className="gp-facet-band-label relative px-4 pt-6 pb-2.5 text-[9px] leading-none tracking-[0.17em] uppercase">
                  {group.label}
                </div>
              )}
              {group.defs.map((def) => {
                cursor += 1
                const index = cursor
                return (
                  <WidgetRow
                    key={def.type}
                    def={def}
                    active={index === litIndex}
                    selected={selectedTypes.includes(def.type)}
                    selecting={Boolean(selection)}
                    favorited={favoriteWidgetTypes.includes(def.type)}
                    onChoose={() => choose(def.type)}
                    onHover={() => {
                      setHoveredIndex(index)
                      setKeyboardActive(false)
                    }}
                    onUnhover={() => {
                      // Hand the highlight back to the keyboard where the
                      // pointer left it, so the column is never unlit.
                      setHoveredIndex(null)
                      setActiveIndex(index)
                      setKeyboardActive(true)
                    }}
                    onToggleFavorite={() => toggleFavoriteWidgetType(def.type)}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {selection && (
          <div className="gp-facet-footer flex min-h-15 shrink-0 items-center justify-between gap-3 px-4 pb-[var(--gp-safe-bottom)] text-[11px]">
            <span aria-live="polite" className="gp-facet-count-label">
              <strong className="tabular-nums">{selectedTypes.length}</strong>{' '}
              selected
            </span>
            <div className="flex items-center gap-1.5">
              {selection.initialTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => selection.onConfirm([])}
                  className="gp-facet-ghost gp-touch-target rounded-xl px-3 text-xs"
                >
                  Clear node
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="gp-facet-ghost gp-touch-target rounded-xl px-3 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedTypes.length === 0}
                onClick={() => selection.onConfirm(selectedTypes)}
                className="gp-facet-confirm gp-touch-target rounded-xl px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-35"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
