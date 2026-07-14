import { describe, expect, it } from 'vitest'
import { useCanvasStore } from './useCanvasStore'
import { useWidgetStore } from './useWidgetStore'

describe('store no-op updates', () => {
  it('does not wake widget subscribers when values are already current', () => {
    const state = useWidgetStore.getState()
    let notifications = 0
    const unsubscribe = useWidgetStore.subscribe(() => {
      notifications++
    })

    if (state.dependencyLinkSource) state.startDependencyLink(state.dependencyLinkSource)
    else state.clearDependencyLink()
    state.setDragOverGroupId(state.dragOverGroupId)
    state.setShortcutsOpen(state.shortcutsOpen)
    state.setImportOpen(state.importOpen)
    state.setQuickAddOpen(state.quickAddOpen)
    state.setPaletteOpen(state.paletteOpen)
    if (state.selectedIds.size === 0) state.clearSelection()

    unsubscribe()
    expect(notifications).toBe(0)
  })

  it('does not wake camera subscribers for identical geometry', () => {
    const state = useCanvasStore.getState()
    let notifications = 0
    const unsubscribe = useCanvasStore.subscribe(() => {
      notifications++
    })

    state.panBy({ x: 0, y: 0 })
    state.setPan(state.pan)
    state.setView(state.pan, state.zoom)
    state.setViewportSize(state.viewportSize)
    state.setIsPanning(state.isPanning)

    unsubscribe()
    expect(notifications).toBe(0)
  })
})
