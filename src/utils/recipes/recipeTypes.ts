import type { ModuleType } from '../../types/spatial'
import type { RelationType } from '../../types/relations'

// ---------------------------------------------------------------------------
// Recipes — the template catalogue.
//
// A recipe is a declarative build order for a board: which cards to place,
// which skin each wears, how they relate, and how they are wired. The data
// itself lives in the generated `recipeData.ts`; this file owns the shape and
// `createRecipe.ts` owns turning one into real widgets.
//
// Slot letters ('A', 'B', 'R', …) are local to a single recipe. They are the
// only way relations and wires name their endpoints, so every letter used by a
// relation or wire must appear in `slots`.
// ---------------------------------------------------------------------------

export type RecipeLevel = 1 | 2 | 3 | 4 | 5

/** The shelf a recipe browses under — the top-level grouping in the picker. */
export interface RecipeShelf {
  id: string
  label: string
}

export interface RecipeSlot {
  slot: string
  type: ModuleType
  /** World offset from the recipe's origin. The store's collision solver still
   * owns final placement, so these are an opening arrangement, not a promise. */
  x: number
  y: number
  /** Stored skin value, applied through `dataWearingSkin`. */
  skin?: string
  /** Card title when the recipe names one; otherwise the type's own label. */
  title?: string
}

export interface RecipeRelation {
  from: string
  to: string
  kind: RelationType
}

/** The only transform the catalogue asks for, spelled out in `createRecipe`. */
export type RecipeTransform = 'clamp_0_100'

export interface RecipeWire {
  from: string
  /** Source field key — must be a readable field on the source type. */
  fromPort: string
  to: string
  /** Value wires: a settable field key. Trigger wires: a command key. */
  toPort: string
  kind: 'value' | 'trigger'
  transform?: RecipeTransform
  edge?: 'rising' | 'change'
}

export interface RecipeDefinition {
  id: string
  title: string
  /** Matches a `RecipeShelf.id`. */
  shelf: string
  level: RecipeLevel
  /** Human setup estimate straight from the catalogue, e.g. '8–16 MIN'. */
  setup: string
  /** Graph shape, e.g. 'MULTI-STAGE CIRCUIT'. */
  graph: string
  tags: readonly string[]
  /** One line on what the finished board gives you. */
  outcome: string
  /** Prose build notes — shown after placing, since wiring needs configuring. */
  construct: string
  slots: readonly RecipeSlot[]
  relations?: readonly RecipeRelation[]
  wires?: readonly RecipeWire[]
}

export const RECIPE_LEVEL_LABELS: Record<RecipeLevel, string> = {
  1: 'Seed',
  2: 'Starter',
  3: 'Connected',
  4: 'Workflow',
  5: 'System',
}
