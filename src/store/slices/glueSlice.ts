import { useToastStore } from '../useToastStore'
import { applyWidgetPositions } from '../widgetCollection'
import { buildGlueIndex } from '../widgetGraph'
import {
  closeClusterGaps,
  foldedBlockShift,
  reconcileGlueClusters,
  refoldCollapsedCluster,
  spreadClusterMembers,
  unfoldReleasedFoldedMembers,
} from '../../utils/glueGeometry'
import { settleWidgetsByCanvas } from '../widgetSettling'
import type { WidgetGlue } from '../../types/spatial'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'

const MAX_GLUE_NAME = 60

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
      const draggedGlue = draggedGlueId ? glues[draggedGlueId] : undefined
      const targetGlue = targetGlueId ? glues[targetGlueId] : undefined

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

      // A merge that touches a COLLAPSED group stays collapsed: the newcomers
      // fold in and the whole collection re-stacks, so a widget welded onto a
      // folded group joins it as an icon (and remembers where it came from)
      // instead of hovering full-size beside a record that quietly lost its
      // collapsed flag. The group's identity — name, and the restore map that
      // unfolding depends on — is carried across the merge, never dropped.
      const collapsed = targetGlue?.collapsed === true || draggedGlue?.collapsed === true
      const name = targetGlue?.name ?? draggedGlue?.name

      const id = crypto.randomUUID()
      const glue: WidgetGlue = { id, widgetIds: merged }
      if (name) glue.name = name

      if (collapsed) {
        const mergedRestore = { ...(draggedGlue?.restore ?? {}), ...(targetGlue?.restore ?? {}) }
        // The collapsed side owns the frame those restore entries were written
        // in, so its fold anchor is what the merge rebases against.
        const previousFoldedAt =
          (targetGlue?.collapsed === true ? targetGlue.foldedAt : undefined) ??
          (draggedGlue?.collapsed === true ? draggedGlue.foldedAt : undefined)
        const folded = refoldCollapsedCluster(s.widgets, merged, mergedRestore, previousFoldedAt)
        glue.collapsed = true
        glue.restore = folded.restore
        glue.foldedAt = folded.anchor
        glues[id] = glue
        return {
          widgets: folded.widgets,
          glues,
          widgetGlueIndex: buildGlueIndex(glues),
          widgetStructureVersion: s.widgetStructureVersion + 1,
        }
      }

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
      const wasCollapsed = glue.collapsed === true
      const remaining = glue.widgetIds.filter((id) => id !== widgetId)
      const glues = { ...state.glues }
      let widgets = state.widgets

      if (remaining.length < 2) {
        delete glues[glueId]
      } else if (wasCollapsed) {
        // The collection stays folded, minus one — re-stack the survivors so
        // the block closes its gap, and trim the restore map to who is left.
        const folded = refoldCollapsedCluster(widgets, remaining, glue.restore, glue.foldedAt)
        widgets = folded.widgets
        glues[glueId] = {
          ...glue,
          widgetIds: remaining,
          collapsed: true,
          restore: folded.restore,
          foldedAt: folded.anchor,
        }
      } else {
        glues[glueId] = { ...glue, widgetIds: remaining }
      }

      // The survivors close ranks BEFORE membership is re-derived. Pulling a
      // card out of the middle of a stack leaves a card-sized hole, and the
      // widgets standing beyond it are innocent: they were welded to the group,
      // not to the card that left. Without this they fall out of glue range and
      // reconcile splits them off — one departure quietly ungrouping everyone
      // behind it. Closed up, they re-magnetize onto the remaining block and
      // stay one group. Never for a collapsed set: it already re-stacked.
      if (!wasCollapsed && remaining.length >= 2) {
        widgets = closeClusterGaps(widgets, remaining)
      }
      // Whatever still does not touch after that genuinely is not welded —
      // re-derive clusters from what actually still welds.
      const reconciled = reconcileGlueClusters(widgets, glues)
      // The member just released (and any survivor a dissolve left behind) is
      // no longer part of a folded set, so it must not stay a 1×1 icon.
      widgets = unfoldReleasedFoldedMembers(widgets, state.glues, reconciled)
      // Settle around the surviving block, whatever released the member. A
      // restore lands a folded member back at its pre-fold spot, which the
      // board may have grown into since. And an unglue from the CONTEXT MENU
      // has no drag behind it: the freed card is still standing between its
      // former clustermates, so the ranks closing above would slide them
      // straight over it and commit the overlap. Only the option-drag path was
      // ever rescued, by WidgetCard's own settle after the gesture.
      const settled = settleWidgetsByCanvas(widgets, glue.widgetIds, buildGlueIndex(reconciled), {
        anchorIds: remaining,
      })
      return {
        widgets: settled,
        glues: reconciled,
        widgetGlueIndex: buildGlueIndex(reconciled),
        widgetStructureVersion: state.widgetStructureVersion + 1,
        // Selecting any member selects the whole cluster, so the freed widget
        // would still be holding a selection full of its former clustermates —
        // and the next plain drag would carry the group it just left across the
        // board. It leaves alone, so it is selected alone.
        selectedIds: state.selectedIds.has(widgetId) ? new Set([widgetId]) : state.selectedIds,
      }
    })
    useToastStore.getState().addToast('Unglued')
    return true
  },

  unglueCluster: (glueId) => {
    if (!get().glues[glueId]) return
    pushHistory()
    set((state) => {
      const cluster = state.glues[glueId]
      if (!cluster) return state
      const glues = { ...state.glues }
      delete glues[glueId]
      // Dissolving a COLLAPSED group would otherwise scatter a fistful of 1×1
      // icons across the board — restore every member to the state it was
      // folded from, then settle the newly full cards against their neighbours.
      let widgets = unfoldReleasedFoldedMembers(state.widgets, state.glues, glues)
      if (cluster.collapsed === true) {
        if (widgets !== state.widgets) {
          widgets = settleWidgetsByCanvas(widgets, cluster.widgetIds, buildGlueIndex(glues))
        }
      } else {
        // A split must be PHYSICAL: the record is gone, so the cards push each
        // other a clear cell apart — left stored touching, they would keep
        // reading (and settling) as one welded object that never came apart.
        widgets = spreadClusterMembers(widgets, cluster.widgetIds)
        if (widgets !== state.widgets) {
          widgets = settleWidgetsByCanvas(widgets, cluster.widgetIds, buildGlueIndex(glues))
        }
      }
      const dissolved = new Set(cluster.widgetIds)
      return {
        widgets,
        glues,
        widgetGlueIndex: buildGlueIndex(glues),
        widgetStructureVersion: state.widgetStructureVersion + 1,
        // The selection was the cluster; the cluster is gone. Leaving all its
        // former members selected would make the very next drag move them as
        // one — the group surviving in behaviour after it was dissolved.
        selectedIds: [...state.selectedIds].some((id) => dissolved.has(id))
          ? new Set([...state.selectedIds].filter((id) => !dissolved.has(id)))
          : state.selectedIds,
      }
    })
    useToastStore.getState().addToast('Ungrouped')
  },

  renameGlue: (glueId, name) => {
    const glue = get().glues[glueId]
    if (!glue) return
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_GLUE_NAME)
    if ((glue.name ?? '') === clean) return
    pushHistory()
    set((state) => {
      const current = state.glues[glueId]
      if (!current) return state
      const next: WidgetGlue = { ...current }
      if (clean) next.name = clean
      else delete next.name
      return { glues: { ...state.glues, [glueId]: next } }
    })
  },

  setClusterCollapsed: (glueId, collapsed) => {
    const glue = get().glues[glueId]
    if (!glue) return
    pushHistory()
    set((state) => {
      const cluster = state.glues[glueId]
      if (!cluster) return state
      const memberIds = cluster.widgetIds.filter((id) => state.widgets[id])
      if (memberIds.length === 0) return state

      const nextGlue: WidgetGlue = { ...cluster }
      let widgets: Record<string, typeof state.widgets[string]>

      if (collapsed) {
        // Fold to the single-cell packed collection — the shared owner records
        // each member's pre-fold state and re-stacks them into one grid-aligned
        // block. Its members go below the 2×2 floor that governs icons you can
        // actually aim at, because the folded collection is one pointer target.
        const folded = refoldCollapsedCluster(state.widgets, memberIds, cluster.restore, cluster.foldedAt)
        widgets = folded.widgets
        nextGlue.collapsed = true
        nextGlue.restore = folded.restore
        nextGlue.foldedAt = folded.anchor
      } else {
        // Unfold: put every member back at the position, size and scale state
        // the fold replaced — translated by however far the folded block has
        // been dragged since, so the group expands around where it sits NOW
        // rather than rewinding to its pre-collapse spot. A member with no
        // remembered entry (joined while collapsed) simply opens to its
        // dormant full size in place.
        widgets = { ...state.widgets }
        const restore = cluster.restore
        const shift = foldedBlockShift(state.widgets, cluster)
        for (const id of memberIds) {
          const w = state.widgets[id]!
          const saved = restore?.[id]
          if (saved) {
            widgets[id] = {
              ...w,
              iconified: saved.iconified,
              size: { width: saved.width, height: saved.height },
              position: { x: saved.x + shift.x, y: saved.y + shift.y },
            }
          } else {
            const size = w.expandedSize ?? w.size
            widgets[id] = { ...w, iconified: false, size }
          }
        }
        delete nextGlue.collapsed
        delete nextGlue.restore
        delete nextGlue.foldedAt
      }

      return {
        widgets: settleWidgetsByCanvas(widgets, memberIds, state.widgetGlueIndex),
        glues: { ...state.glues, [glueId]: nextGlue },
        widgetStructureVersion: state.widgetStructureVersion + 1,
      }
    })
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
      if (glues === s.glues) return s
      // A split that drops a member out of a collapsed group must not leave it
      // a 1×1 icon marooned on the board.
      const widgets = unfoldReleasedFoldedMembers(s.widgets, s.glues, glues)
      return { widgets, glues, widgetGlueIndex: buildGlueIndex(glues) }
    })
    // The weld moved a card, so the overlap check runs — but only now, with the
    // cluster record built. Settling before the weld was on the books would
    // have read the two touching cards as strangers and shoved them apart;
    // afterwards the cluster is one rigid unit and its seam survives intact.
    set((s) => ({
      widgets: settleWidgetsByCanvas(s.widgets, [intent.draggedId], s.widgetGlueIndex, {
        anchorIds: [intent.draggedId],
      }),
    }))
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
