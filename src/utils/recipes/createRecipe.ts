import type { Vector2D } from '../../types/spatial'
import type { FieldCommand } from '../../types/fieldConnections'
import type { WireTransform } from '../../types/circuit'
import { setWidgetHistorySuppressed, useWidgetStore } from '../../store/useWidgetStore'
import { widgetDefinition } from '../../widgets/registry'
import { dataWearingSkin } from '../widgetSkins'
import type { RecipeDefinition, RecipeTransform } from './recipeTypes'

export interface RecipeBuildResult {
  widgetIds: string[]
  /** Cards the recipe named that could not be placed (a retired widget type). */
  slotsSkipped: number
  relationsCreated: number
  wiresCreated: number
  /** Wires the store rejected — a port the target no longer exposes. */
  wiresSkipped: number
}

const TRANSFORMS: Record<RecipeTransform, WireTransform> = {
  clamp_0_100: { op: 'clamp', min: 0, max: 100 },
}

/**
 * Builds one recipe at `origin` as a single undo step.
 *
 * History is snapshotted once up front and then suppressed, so the whole
 * board — cards, skins, relations, wires — collapses into one undo. The store's
 * own collision solver still owns final placement, so the recipe's coordinates
 * are an opening arrangement rather than a guarantee; cards cannot overlap.
 *
 * Every mutation goes through a public store action, and each one validates
 * itself: a retired widget type yields no card, and `addConnection` refuses a
 * port the target does not expose. Both are counted rather than thrown, so a
 * recipe that has drifted from the registry still builds what it legitimately
 * can and reports the rest.
 */
export function createRecipe(recipe: RecipeDefinition, origin: Vector2D): RecipeBuildResult {
  const result: RecipeBuildResult = {
    widgetIds: [], slotsSkipped: 0, relationsCreated: 0, wiresCreated: 0, wiresSkipped: 0,
  }

  const store = useWidgetStore.getState()
  store.snapshotHistory('recipe')
  setWidgetHistorySuppressed(true)

  try {
    const bySlot = new Map<string, string>()

    for (const slot of recipe.slots) {
      const title = slot.title ?? widgetDefinition(slot.type).label
      const id = store.createWidget(title, { x: origin.x + slot.x, y: origin.y + slot.y }, slot.type)
      if (!id) {
        result.slotsSkipped += 1
        continue
      }
      bySlot.set(slot.slot, id)
      result.widgetIds.push(id)

      if (!slot.skin) continue
      const widget = useWidgetStore.getState().widgets[id]
      if (widget) store.updateWidgetData(
        id,
        dataWearingSkin(widget, slot.skin, widgetDefinition(slot.type)),
      )
    }

    for (const relation of recipe.relations ?? []) {
      const from = bySlot.get(relation.from)
      const to = bySlot.get(relation.to)
      if (from && to && store.addRelation(from, to, relation.kind)) result.relationsCreated += 1
    }

    for (const wire of recipe.wires ?? []) {
      const fromId = bySlot.get(wire.from)
      const toId = bySlot.get(wire.to)
      if (!fromId || !toId) {
        result.wiresSkipped += 1
        continue
      }
      const created = store.addConnection(
        wire.kind === 'value'
          ? {
              fromId, fromField: wire.fromPort, toId, toField: wire.toPort, kind: 'value',
              ...(wire.transform ? { transform: TRANSFORMS[wire.transform] } : {}),
            }
          : {
              fromId, fromField: wire.fromPort, toId, kind: 'trigger',
              command: wire.toPort as FieldCommand, edge: wire.edge ?? 'rising',
            },
      )
      if (created) result.wiresCreated += 1
      else result.wiresSkipped += 1
    }

    if (result.widgetIds.length > 0) store.selectWidgets(result.widgetIds)
  } finally {
    setWidgetHistorySuppressed(false)
  }

  return result
}
