import type { ModuleType } from '../types/spatial'
import { GRID_SIZE, MODULE_PACK_REQUIREMENTS } from '../types/spatial'
import type { WidgetCategory, WidgetDefinition, WidgetSizing } from './contracts/registry'
export type { WidgetCategory, WidgetDefinition, WidgetSizing } from './contracts/registry'
import { EXPANSION_WIDGET_DEFINITIONS } from './registry/expansion'
import { ATLAS_WIDGET_DEFINITIONS, TRACKER_WIDGET_DEFINITION } from './registry/atlas'
import { AUTOMATION_CORE_DEFINITIONS } from './registry/automationCore'
import { STRUCTURE_NOTES_WIDGET_DEFINITIONS } from './registry/structureNotesWidgets'
import { PLANNING_WIDGET_DEFINITIONS } from './registry/planningWidgets'
import { STUDY_WIDGET_DEFINITIONS } from './registry/studyWidgets'
import { DATA_TRACKING_WIDGET_DEFINITIONS } from './registry/dataTrackingWidgets'
import { MEDIA_INPUT_WIDGET_DEFINITIONS } from './registry/mediaInputWidgets'
import { PROFESSIONAL_WIDGET_DEFINITIONS } from './registry/professionalWidgets'
import { REVIEWED_WIDGET_SIZING } from './sizingProfiles'

// ---------------------------------------------------------------------------
// Widget registry — the single database describing every widget type.
//
// Everything the app needs to know about a widget type lives in one entry:
// picker metadata (label, description, icon, category, accent), spawn
// defaults (size, starter data), and pack gating. Stores and UI read from
// here so adding a widget type is one entry + one renderer case.
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  structure: 'Structure',
  notes: 'Notes & Content',
  planning: 'Tasks & Planning',
  study: 'Study & Learning',
  data: 'Data & Views',
  media: 'Media & Creative',
  tracking: 'Tracking',
  automation: 'Automation & Logic',
  life: 'Life Systems',
  specialist: 'Specialist',
}

export const CATEGORY_ORDER: readonly WidgetCategory[] = [
  'structure',
  'notes',
  'planning',
  'study',
  'data',
  'media',
  'tracking',
  'automation',
  'life',
  'specialist',
]

/**
 * Per-type resize rules. Absent bounds fall back to DEFAULT_SIZING. A widget
 * whose height always follows its content sets `autoHeight` — the resize
 * handle then adjusts width only and the card's height reporter owns height.
 */
export const DEFAULT_SIZING = {
  minWidth: GRID_SIZE * 5, // 200px — a floor that keeps control rows unclipped
  minHeight: GRID_SIZE * 3, // 120px
  // A card is never a screen-swallowing void. Content-fit widgets (autoHeight)
  // opt out of the height ceiling so long content still grows freely.
  maxWidth: GRID_SIZE * 32, // 1280px
  maxHeight: GRID_SIZE * 32, // 1280px
  autoHeight: false,
} satisfies WidgetSizing

export const WIDGET_REGISTRY: Record<ModuleType, WidgetDefinition> = {
  ...STRUCTURE_NOTES_WIDGET_DEFINITIONS,
  ...PLANNING_WIDGET_DEFINITIONS,
  ...STUDY_WIDGET_DEFINITIONS,
  ...DATA_TRACKING_WIDGET_DEFINITIONS,
  ...MEDIA_INPUT_WIDGET_DEFINITIONS,
  ...PROFESSIONAL_WIDGET_DEFINITIONS,
  ...EXPANSION_WIDGET_DEFINITIONS,
  tracker: TRACKER_WIDGET_DEFINITION,
  ...ATLAS_WIDGET_DEFINITIONS,
  ...AUTOMATION_CORE_DEFINITIONS,
}

// Apply the domain pack requirements from MODULE_PACK_REQUIREMENTS dynamically
for (const type of Object.keys(WIDGET_REGISTRY) as ModuleType[]) {
  const pack = MODULE_PACK_REQUIREMENTS[type]
  if (pack) {
    WIDGET_REGISTRY[type].pack = pack
  } else {
    delete WIDGET_REGISTRY[type].pack
  }
}

// Apply the calibrated 35-widget content-safety profiles after generated
// families and local declarations meet. Existing per-type values remain the
// base, so a profile only replaces the axes it intentionally owns.
for (const [type, sizing] of Object.entries(REVIEWED_WIDGET_SIZING) as Array<
  [keyof typeof REVIEWED_WIDGET_SIZING, WidgetSizing]
>) {
  WIDGET_REGISTRY[type].sizing = { ...WIDGET_REGISTRY[type].sizing, ...sizing }
}

export function widgetDefinition(type: ModuleType): WidgetDefinition {
  return WIDGET_REGISTRY[type]
}

export function isWidgetTypePublic(type: ModuleType): boolean {
  return WIDGET_REGISTRY[type].availability !== 'existing-only'
}

/** All definitions in stable picker order (category order, then label). */
const ORDERED_DEFINITIONS: readonly WidgetDefinition[] = (() => {
  const byCategory = new Map<WidgetCategory, WidgetDefinition[]>()
  for (const def of Object.values(WIDGET_REGISTRY)) {
    const list = byCategory.get(def.category)
    if (list) list.push(def)
    else byCategory.set(def.category, [def])
  }
  const result: WidgetDefinition[] = []
  for (const category of CATEGORY_ORDER) {
    const defs = byCategory.get(category)
    if (!defs) continue
    defs.sort((a, b) => a.label.localeCompare(b.label))
    result.push(...defs)
  }
  return Object.freeze(result)
})()

export function orderedDefinitions(): readonly WidgetDefinition[] {
  return ORDERED_DEFINITIONS
}

// ---------------------------------------------------------------------------
// AI import catalog — the document importer shows the model the full widget
// database so it picks the best-fit type from all of them, not a hardcoded
// handful. Both the human-readable catalog and the schema enum are derived
// from WIDGET_REGISTRY here, so a new widget type becomes AI-selectable the
// moment its registry entry lands — nothing to keep in sync by hand.
// ---------------------------------------------------------------------------

/**
 * Types the importer must not spawn from a topology plan. `canvas_node` needs
 * a store-created backing canvas (its default data carries an empty canvasId
 * that only the store fills in), so it can't be materialized from a plain
 * mindmap import.
 */
const IMPORT_EXCLUDED_TYPES = new Set<ModuleType>(['canvas_node'])

/** Every widget type the AI importer may choose, in stable picker order. */
export const IMPORT_SELECTABLE_TYPES: readonly ModuleType[] = ORDERED_DEFINITIONS
  .map((def) => def.type)
  .filter((type) => !IMPORT_EXCLUDED_TYPES.has(type) && isWidgetTypePublic(type))

/**
 * Full catalog of selectable widget types as prompt text, grouped by category:
 *   ## Category
 *   - "type" — Label: description
 * Fed to the topology pass so type selection is informed by the whole database.
 */
export function importTypeCatalog(): string {
  const byCategory = new Map<WidgetCategory, WidgetDefinition[]>()
  for (const def of ORDERED_DEFINITIONS) {
    if (IMPORT_EXCLUDED_TYPES.has(def.type) || !isWidgetTypePublic(def.type)) continue
    const list = byCategory.get(def.category)
    if (list) list.push(def)
    else byCategory.set(def.category, [def])
  }
  const blocks: string[] = []
  for (const category of CATEGORY_ORDER) {
    const defs = byCategory.get(category)
    if (!defs || defs.length === 0) continue
    const lines = defs.map((d) => `- "${d.type}" — ${d.label}: ${d.description}`)
    blocks.push(`## ${CATEGORY_LABELS[category]}\n${lines.join('\n')}`)
  }
  return blocks.join('\n\n')
}
