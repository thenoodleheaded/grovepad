import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Search, X, Zap } from 'lucide-react'
import { useOverlayDismiss } from '../../hooks/useOverlayDismiss'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useToastStore } from '../../store/useToastStore'
import { screenToWorld } from '../../types/spatial'
import { widgetDefinition } from '../../widgets/registry'
import { createRecipe } from '../../utils/recipes/createRecipe'
import { RECIPE_SHELVES, RECIPES } from '../../utils/recipes/recipeData'
import { RECIPE_LEVEL_LABELS, type RecipeDefinition } from '../../utils/recipes/recipeTypes'

// ---------------------------------------------------------------------------
// Recipes — the template catalogue, browsable one shelf at a time.
//
// 460 recipes is far more than one grid should hold, so a shelf owns the view
// and search cuts across every shelf at once. Each tile builds its whole board
// — cards, skins, relations, and wires — in a single undo step.
// ---------------------------------------------------------------------------

const LEVEL_ACCENTS: Record<number, string> = {
  1: '#4ade80', 2: '#38bdf8', 3: '#a78bfa', 4: '#fbbf24', 5: '#fb7185',
}

function viewCenterWorld() {
  const canvas = useCanvasStore.getState()
  return screenToWorld(
    { x: canvas.viewportSize.width / 2, y: canvas.viewportSize.height / 2 },
    { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom },
  )
}

/** Everything a recipe can be found by, lowercased once per recipe. */
const HAYSTACKS = new Map<string, string>(
  RECIPES.map((recipe) => [
    recipe.id,
    [
      recipe.id, recipe.title, recipe.outcome, recipe.graph,
      ...recipe.tags,
      ...recipe.slots.map((slot) => widgetDefinition(slot.type).label),
      RECIPE_SHELVES.find((shelf) => shelf.id === recipe.shelf)?.label ?? '',
    ].join(' ').toLowerCase(),
  ]),
)

function shelfCount(shelfId: string): number {
  return RECIPES.filter((recipe) => recipe.shelf === shelfId).length
}

export function RecipesModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState(RECIPE_SHELVES[0]!.id)
  const [level, setLevel] = useState<number | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useOverlayDismiss(true, onClose, { containerRef: dialogRef, initialFocusRef: dialogRef })

  const searching = query.trim().length > 0
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return RECIPES.filter((recipe) => {
      if (level !== null && recipe.level !== level) return false
      if (needle) return HAYSTACKS.get(recipe.id)!.includes(needle)
      return recipe.shelf === shelf
    })
  }, [query, shelf, level])

  function place(recipe: RecipeDefinition) {
    const built = createRecipe(recipe, viewCenterWorld())
    const cards = `${built.widgetIds.length} card${built.widgetIds.length === 1 ? '' : 's'}`
    const skipped = built.wiresSkipped + built.slotsSkipped
    useToastStore.getState().addToast(
      skipped > 0
        ? `${recipe.title} — ${cards}, ${skipped} part${skipped === 1 ? '' : 's'} unavailable`
        : `${recipe.title} — ${cards} placed`,
    )
    onClose()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recipes"
      className="gp-widget-picker-dialog fixed inset-0 z-[200]"
    >
      <div role="presentation" className="gp-fade absolute inset-0 gp-picker-scrim" onClick={onClose} />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="gp-widget-picker-shell relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col px-4 outline-none sm:px-6 lg:px-8 2xl:px-10"
      >
        {/* Header */}
        <div className="gp-picker-header flex shrink-0 items-center justify-between gap-3 pt-10 pb-1">
          <div className="gp-popup-title-pill gp-panel gp-pop flex h-10 min-w-0 items-center gap-2 rounded-full px-4">
            <BookOpen size={14} className="shrink-0 text-emerald-300" aria-hidden />
            <h2 className="gp-picker-title bg-gradient-to-r from-neutral-100 via-emerald-300 to-neutral-100 bg-clip-text text-[15px] font-semibold tracking-tight text-transparent">
              Recipes
            </h2>
            <span className="shrink-0 text-[11px] font-medium text-neutral-500">{RECIPES.length}</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="gp-picker-close gp-popup-close-naked gp-touch-target h-8 w-8"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        {/* Search */}
        <div className="gp-picker-search gp-popup-island mt-3 flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5">
          <Search size={17} className="shrink-0 text-neutral-600" aria-hidden />
          <input
            ref={searchRef}
            type="text"
            value={query}
            placeholder="Search every recipe…"
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            className="gp-picker-search-input w-full bg-transparent text-[16px] text-neutral-100 outline-none placeholder:text-neutral-600"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
              className="gp-touch-target shrink-0 text-neutral-600 transition-colors hover:text-neutral-300"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>

        {/* Complexity filter */}
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLevel(null)}
            data-active={level === null || undefined}
            className="rounded-full border gp-hairline px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-200 data-[active]:bg-neutral-100 data-[active]:text-neutral-950"
          >
            Any level
          </button>
          {([1, 2, 3, 4, 5] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLevel(level === value ? null : value)}
              data-active={level === value || undefined}
              className="flex items-center gap-1.5 rounded-full border gp-hairline px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-200 data-[active]:bg-neutral-100 data-[active]:text-neutral-950"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: LEVEL_ACCENTS[value] }}
              />
              {RECIPE_LEVEL_LABELS[value]}
            </button>
          ))}
        </div>

        {/* Shelves */}
        {!searching && (
          <div className="mt-2.5 flex shrink-0 gap-1.5 overflow-x-auto pb-1">
            {RECIPE_SHELVES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setShelf(entry.id)}
                data-active={shelf === entry.id || undefined}
                className="shrink-0 whitespace-nowrap rounded-full border gp-hairline bg-neutral-900/45 px-3 py-1.5 text-[11px] font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 data-[active]:border-emerald-400/30 data-[active]:bg-emerald-400/10 data-[active]:text-emerald-200"
              >
                {entry.label}
                <span className="ml-1.5 text-neutral-600">{shelfCount(entry.id)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          {results.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-neutral-600">
              No recipes match {searching ? `“${query}”` : 'this filter'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((recipe) => {
                const accent = LEVEL_ACCENTS[recipe.level]!
                const wires = recipe.wires?.length ?? 0
                const relations = recipe.relations?.length ?? 0
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => place(recipe)}
                    // The catalogue's own build notes — what still needs setting
                    // by hand once the cards and wires are on the board.
                    title={recipe.construct}
                    style={{ ['--gp-tile-accent' as string]: accent }}
                    className="gp-picker-row flex flex-col items-start gap-1.5 rounded-2xl border gp-hairline bg-neutral-900/45 p-3.5 text-left transition-colors hover:bg-neutral-800/70"
                  >
                    <div className="flex w-full items-center gap-2">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: accent, boxShadow: `0 0 8px ${accent}90` }}
                      />
                      <span className="gp-picker-tile-title min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-100">
                        {recipe.title}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-neutral-600">
                        {RECIPE_LEVEL_LABELS[recipe.level]}
                      </span>
                    </div>
                    <p className="gp-picker-tile-description line-clamp-2 text-[11px] leading-relaxed text-neutral-500">
                      {recipe.outcome}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-neutral-600">
                      <span>{recipe.slots.length} cards</span>
                      {relations > 0 && <span>{relations} links</span>}
                      {wires > 0 && (
                        <span className="flex items-center gap-1 text-amber-300/70">
                          <Zap size={9} aria-hidden />
                          {wires} wires
                        </span>
                      )}
                      <span>{recipe.setup.toLowerCase()}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="gp-picker-footer flex shrink-0 items-center justify-center gap-4 border-t gp-hairline py-3 pb-[var(--gp-safe-bottom)] text-[10px] text-neutral-600">
          <span>{results.length} shown</span>
          <span>Click a recipe to build it at the centre of your view</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
