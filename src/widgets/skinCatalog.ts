import {
  BarChart3,
  Clock3,
  Columns3,
  Gauge,
  Grid2X2,
  Image,
  LayoutGrid,
  List,
  ListChecks,
  ListOrdered,
  Map,
  PanelsTopLeft,
  Sparkles,
  Tags,
  Terminal,
  Timeline,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleType } from '../types/spatial'
import type { WidgetDefinition, WidgetSkinOption } from './contracts/registry'
import {
  WIDGET_SKIN_BLUEPRINTS,
  type SkinPresentation,
} from './skinBlueprints.generated'

const PRESENTATION_ICONS: Record<SkinPresentation, LucideIcon> = {
  standard: Sparkles,
  compact: Tags,
  cards: PanelsTopLeft,
  grid: LayoutGrid,
  ledger: List,
  timeline: Timeline,
  board: Columns3,
  dashboard: Gauge,
  form: ListChecks,
  terminal: Terminal,
  map: Map,
  chart: BarChart3,
  matrix: Grid2X2,
  time: Clock3,
  steps: ListOrdered,
  media: Image,
}

/**
 * Merge the reviewed opportunity catalogue into the hand-authored registry.
 *
 * Existing skins stay first because their renderer contracts predate the
 * generated catalogue. A matching value is never duplicated. The generated
 * file deliberately contains no React components; this small seam adds the
 * shared visual vocabulary when the registry is assembled. The separate
 * ownership ledger is planning guidance only: it must never hide a catalogue
 * choice that was already available to people.
 */
export function installCataloguedSkins(
  registry: Record<ModuleType, WidgetDefinition>,
): void {
  for (const [untypedType, blueprints] of Object.entries(WIDGET_SKIN_BLUEPRINTS)) {
    const type = untypedType as ModuleType
    const definition = registry[type]
    if (!definition) {
      throw new Error(`Skin catalogue references unknown widget type "${untypedType}"`)
    }

    const existing = definition.skins ?? []
    if (existing.length === 0) definition.skinField = 'skin'
    const values = new Set(existing.map((skin) => skin.value))
    const additions: WidgetSkinOption[] = []

    for (const blueprint of blueprints) {
      if (values.has(blueprint.value)) continue
      values.add(blueprint.value)
      additions.push({
        ...blueprint,
        icon: PRESENTATION_ICONS[blueprint.presentation],
      })
    }

    if (additions.length > 0) {
      definition.skins = Object.freeze([...existing, ...additions])
    }
  }
}

export function cataloguedSkinCount(): number {
  return cataloguedOpportunityCount()
}

export function cataloguedOpportunityCount(): number {
  return Object.values(WIDGET_SKIN_BLUEPRINTS).reduce(
    (total, skins) => total + skins.length,
    0,
  )
}
