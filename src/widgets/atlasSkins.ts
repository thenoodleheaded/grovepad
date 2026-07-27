import { CalendarClock, Gauge, List, Minimize2, Shapes, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AtlasWidgetData } from '../types/widgetDataExpansion'
import { ATLAS_CATALOG, ATLAS_TYPES, type AtlasSpec, type AtlasType } from './atlasCatalog'
import type { WidgetSkinOption } from './contracts/registry'
import type { SkinPresentation } from './skinBlueprints.generated'

/**
 * Skins for the fifty Atlas cards.
 *
 * Every Atlas widget stores the same envelope — a headline number against a
 * target, a list of items, a reading history, and a few named times — and each
 * type gives those slots domain meaning. That shared envelope is exactly what a
 * skin needs: these are six ways of *seeing the same record*, never six
 * different records. Switching one only writes `data.skin`, so nothing a card
 * holds can disappear or change meaning on the way across.
 *
 * A skin is only offered when the card actually holds what it draws. A Fuel Log
 * keeps a series, so it can wear Trend; a Gratitude Jar does not, so it never
 * offers an empty chart. Cards whose data supports nothing beyond the object
 * hero still get Compact, so the roller is never a one-item list.
 *
 * Every skin keeps the type's own accent. The hue on an Atlas card says which
 * system it is, not which shape it is wearing.
 */
export type AtlasSkin = 'object' | 'dial' | 'ledger' | 'trend' | 'schedule' | 'compact'

/** Visuals whose hero already draws the card's items — a row list is the same
 *  content in a denser shape, so those types can wear Ledger. */
export const ATLAS_COLLECTION_VISUALS: ReadonlySet<string> = new Set([
  'deck','book','ledger','tags','plant','bag','bins','boxes','hourglass','combs','clipboard','stamps',
  'receipt','grid','ladder','dishes','vault','beads','plates','stars','pet','passport','suitcase',
  'wallet','easels','film','constellation','frost','streams',
])

/** Visuals already drawn as a round instrument. Shared with the renderer so the
 *  Dial skin and the object hero speak one geometry. */
export const ATLAS_CIRCULAR_VISUALS: ReadonlySet<string> = new Set([
  'ring','crescent','orbit','eclipse','horizon','dome','clocks','gauge','meter','pressure','vu','moon','arc',
])

function writableSlots(spec: AtlasSpec): ReadonlySet<string> {
  return new Set(spec.fields.flatMap((field) => (field.writable ? [field.writable] : [])))
}

interface AtlasSkinBlueprint {
  value: AtlasSkin
  label: string
  description: string
  presentation: SkinPresentation
  icon: LucideIcon
  /** Whether this type's stored data can honestly fill the skin. */
  applies: (spec: AtlasSpec) => boolean
}

const BLUEPRINTS: readonly AtlasSkinBlueprint[] = [
  {
    value: 'object',
    label: 'Object',
    description: 'The card as its own drawn instrument, with readouts and controls.',
    presentation: 'standard',
    icon: Shapes,
    applies: () => true,
  },
  {
    value: 'dial',
    label: 'Dial',
    description: 'One large reading on an arc, for a card watched at a glance.',
    presentation: 'dashboard',
    icon: Gauge,
    // Only honest when the card keeps a headline amount and something to reach.
    applies: (spec) => {
      const slots = writableSlots(spec)
      return slots.has('primary') || slots.has('target')
    },
  },
  {
    value: 'ledger',
    label: 'Ledger',
    description: 'The card’s entries as tickable rows instead of drawn pieces.',
    presentation: 'ledger',
    icon: List,
    applies: (spec) => ATLAS_COLLECTION_VISUALS.has(spec.visual),
  },
  {
    value: 'trend',
    label: 'Trend',
    description: 'The reading history as a line, with its latest, average, and peak.',
    presentation: 'chart',
    icon: TrendingUp,
    applies: (spec) => spec.fields.some((field) => field.valueType === 'series'),
  },
  {
    value: 'schedule',
    label: 'Schedule',
    description: 'The card’s named times laid out across the day.',
    presentation: 'time',
    icon: CalendarClock,
    applies: (spec) => {
      const slots = writableSlots(spec)
      return Boolean(spec.defaults?.times)
        || slots.has('timeStart') || slots.has('timeEnd')
        || spec.defaults?.timeStart !== undefined || spec.defaults?.timeEnd !== undefined
    },
  },
  {
    value: 'compact',
    label: 'Compact',
    description: 'A single glanceable line — the headline reading and one action.',
    presentation: 'compact',
    icon: Minimize2,
    applies: () => true,
  },
]

/** Built once: the skin list is fixed by each type's declared spec. */
const ATLAS_SKINS: Record<AtlasType, readonly WidgetSkinOption[]> = Object.fromEntries(
  ATLAS_TYPES.map((type) => {
    const spec = ATLAS_CATALOG[type]
    const skins: WidgetSkinOption[] = BLUEPRINTS
      .filter((blueprint) => blueprint.applies(spec))
      .map((blueprint) => ({
        value: blueprint.value,
        label: blueprint.label,
        description: blueprint.description,
        icon: blueprint.icon,
        // The type owns the hue; the skin owns the shape.
        accent: spec.accent,
        implementation: 'renderer-ready',
        presentation: blueprint.presentation,
      }))
    return [type, Object.freeze(skins)]
  }),
) as Record<AtlasType, readonly WidgetSkinOption[]>

/** Every shape this Atlas type can wear, in roller order. */
export function atlasSkinsFor(type: AtlasType): readonly WidgetSkinOption[] {
  return ATLAS_SKINS[type]
}

/**
 * The record after ticking one Ledger row. The Ledger skin is the only shape
 * that edits items directly, so the rule lives here rather than in the
 * renderer: exactly one item flips `done`, every other field — including the
 * item's own label, value, date, status, and note — is handed back untouched.
 */
export function atlasItemsToggled(data: AtlasWidgetData, itemId: string): AtlasWidgetData {
  return {
    ...data,
    items: data.items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)),
  }
}

/** The shape worn now. Absent, unknown, or inapplicable data reads as Object,
 *  so a card saved before skins existed — or one whose spec later dropped a
 *  series — still opens on the hero it has always had. */
export function atlasSkinFor(type: AtlasType, data: Pick<AtlasWidgetData, 'skin'>): AtlasSkin {
  const value = data.skin
  return ATLAS_SKINS[type].some((skin) => skin.value === value) ? value as AtlasSkin : 'object'
}
