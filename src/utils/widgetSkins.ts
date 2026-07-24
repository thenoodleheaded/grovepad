import type { ModuleData } from '../types/spatial'
import type { AtlasWidgetData } from '../types/widgetDataExpansion'
import { ATLAS_CATALOG, ATLAS_TYPES, atlasModeFor, switchAtlasMode } from '../widgets/atlasCatalog'
import type { WidgetSkinOption } from '../widgets/contracts/registry'

/**
 * Skins — the alternate shapes one widget can wear — come from two places.
 * Most widgets declare a short list in the registry. The Tracker is special:
 * every entry in the Atlas catalogue is one of its skins, and switching keeps
 * a snapshot of the skin being left so nothing is lost on the way back.
 *
 * This module is the single answer to "what skins does this card have, which
 * is it wearing, and what data does wearing another one produce".
 */

/**
 * Only the fields skin resolution actually reads. Deliberately narrower than
 * `Widget`, so every caller — card, resting face, test — can hand over what it
 * has without pretending to own a whole board object.
 */
interface SkinnedCard {
  type: string
  data: unknown
}

interface AccentedCard extends SkinnedCard {
  metadata: { accent?: string }
}

type SkinnedDefinition = {
  skins?: readonly WidgetSkinOption[]
  skinField?: 'mode' | 'skin'
}

export type WidgetSkinState = Record<string, unknown>
export type WidgetSkinStates = Record<string, WidgetSkinState>

interface DataWithSkinState {
  mode?: string
  skin?: string
  skinStates?: WidgetSkinStates
}

/** Atlas entries as skins, in catalogue order. Built once — the list is fixed. */
const TRACKER_SKINS: readonly WidgetSkinOption[] = ATLAS_TYPES.map((type) => ({
  value: type,
  label: ATLAS_CATALOG[type].label,
  icon: ATLAS_CATALOG[type].icon,
  accent: ATLAS_CATALOG[type].accent,
}))

function isTrackerWidget(widget: Pick<SkinnedCard, 'type'>): boolean {
  return widget.type === 'tracker'
}

/** Every skin this card can wear, in the order they roll past. */
export function skinsFor(
  widget: Pick<SkinnedCard, 'type'>,
  def: SkinnedDefinition,
): readonly WidgetSkinOption[] {
  if (isTrackerWidget(widget)) return TRACKER_SKINS
  return def.skins ?? []
}

/** The skin currently worn, falling back to the first for stale/unknown data. */
export function currentSkin(
  widget: SkinnedCard,
  def: SkinnedDefinition,
): WidgetSkinOption | null {
  const skins = skinsFor(widget, def)
  if (skins.length === 0) return null
  const value = isTrackerWidget(widget)
    ? atlasModeFor(widget.data as AtlasWidgetData)
    : (widget.data as DataWithSkinState)[def.skinField ?? 'mode'] ?? ''
  return skins.find((skin) => skin.value === value) ?? skins[0]!
}

/**
 * The data this card should hold once it wears `value`. The Tracker rewrites
 * its whole preset (keeping a snapshot of the outgoing one); everything else
 * only changes the `mode` field it already persists.
 */
export function dataWearingSkin(
  widget: SkinnedCard,
  value: string,
  def: SkinnedDefinition = {},
): ModuleData {
  if (isTrackerWidget(widget)) {
    return switchAtlasMode(widget.data as AtlasWidgetData, value as never) as ModuleData
  }
  const field = def.skinField ?? 'mode'
  return { ...(widget.data as object), [field]: value } as unknown as ModuleData
}

/** Optional data owned by one skin, isolated from the widget's shared fields. */
export function skinStateFor(data: unknown, value: string): WidgetSkinState {
  const states = (data as DataWithSkinState | null)?.skinStates
  const state = states?.[value]
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
}

/**
 * Update one skin's optional state without disturbing another skin or the
 * widget's canonical fields. This is the migration-safe home for advanced
 * skin data such as a selected grouping, review history, or extra columns.
 */
export function dataWithSkinState(
  data: ModuleData,
  value: string,
  state: WidgetSkinState,
): ModuleData {
  const current = data as ModuleData & DataWithSkinState
  const nextStates: WidgetSkinStates = { ...(current.skinStates ?? {}) }
  if (Object.keys(state).length === 0) delete nextStates[value]
  else nextStates[value] = { ...state }

  if (Object.keys(nextStates).length === 0) {
    const { skinStates: _removed, ...withoutSkinStates } = current
    return withoutSkinStates as unknown as ModuleData
  }

  return {
    ...(current as object),
    skinStates: nextStates,
  } as unknown as ModuleData
}

/**
 * The colour this card wears. A hand-picked accent on the widget always wins;
 * otherwise the skin owns the hue, so a Pomodoro reads red and a Countdown
 * green without either being a different widget. Cards with no skins fall back
 * to the type's own accent.
 */
export function widgetAccent(
  widget: AccentedCard,
  def: SkinnedDefinition & { accent: string },
): string {
  return widget.metadata.accent ?? currentSkin(widget, def)?.accent ?? def.accent
}

/** The active skin and the rest, in declared order. */
export function splitSkins(
  skins: readonly WidgetSkinOption[],
  value: string,
): { current: WidgetSkinOption; others: WidgetSkinOption[] } | null {
  if (skins.length === 0) return null
  const current = skins.find((skin) => skin.value === value) ?? skins[0]!
  return { current, others: skins.filter((skin) => skin.value !== current.value) }
}
