import { create } from 'zustand'
import { useWidgetStore } from './useWidgetStore'
import { analyzeWidgetDeletion, type WidgetDeletionImpact } from './widgetDeletion'

interface PendingWidgetDeletion {
  ids: string[]
  impact: WidgetDeletionImpact
}

interface WidgetDeletionDialogState {
  pending: PendingWidgetDeletion | null
  request: (ids: Iterable<string>) => void
  close: () => void
  confirm: () => void
}

export const useWidgetDeletionDialogStore = create<WidgetDeletionDialogState>()((set, get) => ({
  pending: null,
  request: (ids) => {
    const state = useWidgetStore.getState()
    const impact = analyzeWidgetDeletion(state, ids)
    if (impact.directWidgetIds.length === 0) return
    if (impact.descendantWidgetCount > 0 || impact.removedCanvasIds.size > 1) {
      set({ pending: { ids: impact.directWidgetIds, impact } })
      return
    }
    state.deleteWidgets(impact.directWidgetIds)
  },
  close: () => set({ pending: null }),
  confirm: () => {
    const pending = get().pending
    if (!pending) return
    set({ pending: null })
    useWidgetStore.getState().deleteWidgets(pending.ids)
  },
}))

export function requestWidgetDeletion(ids: Iterable<string>): void {
  useWidgetDeletionDialogStore.getState().request(ids)
}
