import type { ModuleType } from '../../types/spatial'
import {
  WIDGET_SKIN_BLUEPRINTS,
  type WidgetSkinBlueprint,
} from '../../widgets/skinBlueprints.generated'
import {
  compact,
  record,
  REST_ROW_LIMIT,
  type RestingFaceModel,
  type RestRow,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// The catalogue dress.
//
// Most skins in the catalogue are not separate renderers: they wear the
// family's own body under a presentation dress (08-skin-presentations.css)
// and, when the skin is a schema-extension, a pocket of user-named details.
// A folded card must not invent a shape the open card does not have — so
// rather than a bespoke face per catalogue skin, this module gives every one
// of them exactly what its open card has that the base face was missing:
//
//   1. the skin's own name, as the eyebrow (otherwise a folded Thermometer
//      and a folded Burn-up are indistinguishable),
//   2. its named details, which are the only data that skin owns,
//   3. its presentation, carried through to the tile as paint.
//
// Families whose skins DO have real renderers build their own faces and reach
// here only for the parts they left blank.
// ---------------------------------------------------------------------------

const BLUEPRINTS = WIDGET_SKIN_BLUEPRINTS as Record<string, readonly WidgetSkinBlueprint[] | undefined>

export interface SkinDetail {
  name: string
  value: string
}

/**
 * The catalogue entry for the skin this card is wearing, or null. Both skin
 * fields are checked because `skinField` is per-widget ('mode' where the
 * family already persisted one, 'skin' where the catalogue introduced it) and
 * a blueprint value is unique enough that reading both cannot collide.
 */
export function cataloguedSkin(
  type: ModuleType,
  data: Record<string, unknown>,
): WidgetSkinBlueprint | null {
  const blueprints = BLUEPRINTS[type]
  if (!blueprints) return null
  const worn = [data.skin, data.mode].find((value) => typeof value === 'string')
  if (typeof worn !== 'string') return null
  return blueprints.find((blueprint) => blueprint.value === worn) ?? null
}

/** The user-named fields a schema-extension skin keeps in its own pocket. */
export function skinDetails(data: Record<string, unknown>, value: string): SkinDetail[] {
  const state = record(record(data.skinStates)?.[value])
  if (!state || !Array.isArray(state.details)) return []
  const details: SkinDetail[] = []
  for (const item of state.details) {
    const detail = record(item)
    if (!detail) continue
    const name = typeof detail.name === 'string' ? detail.name.trim() : ''
    const raw = typeof detail.value === 'string' ? detail.value.trim() : ''
    if (!name && !raw) continue
    details.push({ name: compact(name || 'Detail', 20), value: compact(raw || '—', 16) })
    if (details.length >= REST_ROW_LIMIT) break
  }
  return details
}

function detailRows(details: readonly SkinDetail[]): RestRow[] {
  return details.map((detail, index) => ({
    key: `detail-${index}`,
    label: detail.name,
    value: detail.value,
    tone: 'muted' as const,
  }))
}

/**
 * Give a catalogued skin the two things the base face could not know: its own
 * name, and its named details.
 *
 * The name takes the eyebrow because skin identity is otherwise invisible at
 * rest — two Goal cards wearing Thermometer and Burn-up hold the same
 * milestones and would fold to the same tile. A family that already wrote an
 * eyebrow keeps it: it built a face for this skin and knows a better heading
 * than the catalogue does (July beats "Month"). Families deliberately leave
 * the eyebrow blank for the skins they do not separately render.
 */
export function dressWithCatalogueSkin(
  model: RestingFaceModel,
  blueprint: WidgetSkinBlueprint,
  details: readonly SkinDetail[],
): RestingFaceModel {
  const name = compact(blueprint.label, 20)

  // Nothing of its own to show: the skin's named details ARE the card.
  if (model.kind === 'icon') {
    if (details.length === 0) return model
    return { kind: 'rows', eyebrow: { label: name }, rows: detailRows(details), overflow: 0 }
  }

  switch (model.kind) {
    case 'rows': {
      const rows = details.length > 0 && model.rows.length < REST_ROW_LIMIT
        ? [...model.rows, ...detailRows(details).slice(0, REST_ROW_LIMIT - model.rows.length)]
        : model.rows
      return { ...model, rows, eyebrow: model.eyebrow ?? { label: name } }
    }
    case 'columns':
    case 'grid':
    case 'bars':
    case 'chips':
    case 'lines':
    case 'chain':
    case 'timeline':
    case 'split':
    case 'paper':
    case 'clock':
      return model.eyebrow ? model : { ...model, eyebrow: { label: name } }
    // metric, gauge, boolean, text, note, chart, stars, palette and image are
    // single readings with no header of their own. A heading would cost them a
    // whole extra cell of height to say something the title capsule and the
    // skin roller already say — and where two skins really do fold to the same
    // reading, they fold to the same reading when opened too.
    default:
      return model
  }
}
