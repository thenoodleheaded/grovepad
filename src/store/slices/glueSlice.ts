import { useToastStore } from '../useToastStore'
import { applyWidgetPositions } from '../widgetCollection'
import { buildGlueIndex } from '../widgetGraph'
import { reconcileGlueClusters } from '../../utils/glueGeometry'
import type { WidgetGlue } from '../../types/spatial'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'

function sameCanvas(
  aId: string,
  bId: string,
  widgets: ReturnType<WidgetStoreSliceContext['get']>['widgets'],
): boolean {
  const a = widgets[aId]
  const b = widgets[bId]
  return Boolean(a && b && a.canvasId === b.canvasId)
}

export function createGlueSlice({ set, get, pushHistory }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  // `glues`/`widgetGlueIndex` are seeded by useWidgetStore from the persisted
  // board — this slice owns only the actions and ephemeral intent state.
  glueWidgets: (draggedId, targetId) => {
    const state = get()
    if (draggedId === targetId || !sameCanvas(draggedId, targetId, state.widgets)) return
    if (
      state.widgetGlueIndex[draggedId] &&
      state.widgetGlueIndex[draggedId] === state.widgetGlueIndex[targetId]
    ) return
    // The option-drag already opened a history step on its first move; the
    // bond commits inside that same undo step.
    set((s) => {
      const draggedGlueId = s.widgetGlueIndex[draggedId]
      const targetGlueId = s.widgetGlueIndex[targetId]
      if (draggedGlueId && draggedGlueId === targetGlueId) return s
      const glues = { ...s.glues }

      const memberIds = (glueId: string | undefined, fallback: string): string[] => {
        if (!glueId || !glues[glueId]) return [fallback]
        const ids = glues[glueId]!.widgetIds
        delete glues[glueId]
        return ids
      }
      const merged = [
        ...memberIds(targetGlueId, targetId),
        ...memberIds(draggedGlueId, draggedId),
      ].filter((id, index, all) => all.indexOf(id) === index && s.widgets[id])
      if (merged.length < 2) return s

      const id = crypto.randomUUID()
      const glue: WidgetGlue = { id, widgetIds: merged }
      glues[id] = glue
      return { glues, widgetGlueIndex: buildGlueIndex(glues) }
    })
    useToastStore.getState().addToast('Glued')
  },

  unglueWidget: (widgetId, options) => {
    const glueId = get().widgetGlueIndex[widgetId]
    if (!glueId) return false
    // An option-drag pull-off rides the drag's own history step
    // (`skipHistory`); a menu unglue opens its own.
    if (!options?.skipHistory) pushHistory()
    set((state) => {
      const glue = state.glues[glueId]
      if (!glue) return state
      const remaining = glue.widgetIds.filter((id) => id !== widgetId)
      const glues = { ...state.glues }
      if (remaining.length < 2) delete glues[glueId]
      else glues[glueId] = { ...glue, widgetIds: remaining }
      // Removing the connector of a row can leave the survivors no longer
      // touching — re-derive clusters from what actually still welds.
      const reconciled = reconcileGlueClusters(state.widgets, glues)
      return { glues: reconciled, widgetGlueIndex: buildGlueIndex(reconciled) }
    })
    useToastStore.getState().addToast('Unglued')
    return true
  },

  commitGlue: () => {
    const intent = get().glueIntent
    if (!intent) return false
    const state = get()
    if (!state.widgets[intent.draggedId] || !state.widgets[intent.targetId]) {
      get().setGlueIntent(null)
      return false
    }
    // Snap the dragged widget onto the exact 0.3-cell seam the preview showed,
    // then weld. Both land inside the drag's already-open history step.
    set((s) => ({
      widgets: applyWidgetPositions(s.widgets, { [intent.draggedId]: intent.position }),
    }))
    get().glueWidgets(intent.draggedId, intent.targetId)
    // Welding a card that was dragged out of another cluster merges the two
    // records; split off whatever no longer touches so a member left behind
    // does not stay glued to a cluster it has drifted away from.
    set((s) => {
      const glues = reconcileGlueClusters(s.widgets, s.glues)
      return glues === s.glues ? s : { glues, widgetGlueIndex: buildGlueIndex(glues) }
    })
    get().setGlueIntent(null)
    return true
  },

  // Ephemeral option-drag intent (never history, persistence, or sync).
  // While the modifier drag hovers within glue range of a target, the seam
  // layer previews the weld at the exact position the drop will snap to.
  glueIntent: null,
  setGlueIntent: (intent) =>
    set((state) => {
      const current = state.glueIntent
      if (current === intent) return state
      if (
        current &&
        intent &&
        current.draggedId === intent.draggedId &&
        current.targetId === intent.targetId &&
        current.axis === intent.axis &&
        current.position.x === intent.position.x &&
        current.position.y === intent.position.y
      ) return state
      return { glueIntent: intent }
    }),
  // The widget an option-drag is currently pulling clear of its cluster —
  // drives the "about to unglue" preview (seams to it fade out).
  unglueIntentWidgetId: null,
  setUnglueIntentWidgetId: (id) =>
    set((state) => (state.unglueIntentWidgetId === id ? state : { unglueIntentWidgetId: id })),

  hoveredWidgetId: null,
  setHoveredWidgetId: (id) =>
    set((state) => (state.hoveredWidgetId === id ? state : { hoveredWidgetId: id })),
  }
}
