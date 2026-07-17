import type { Widget } from '../types/spatial'
import { useCanvasStore } from '../store/useCanvasStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { boundsForWidgets } from './widgetBounds'

export type FrameScope = 'board' | 'selection' | 'selection-or-board'

export function widgetsForFrame(
  state: Pick<ReturnType<typeof useWidgetStore.getState>, 'widgets' | 'selectedIds' | 'activeCanvasId'>,
  scope: FrameScope,
): Widget[] {
  const selected = [...state.selectedIds]
    .map((id) => state.widgets[id])
    .filter((widget): widget is Widget => widget !== undefined)
    .filter((widget) => widget.canvasId === state.activeCanvasId)
  if (scope === 'selection' || (scope === 'selection-or-board' && selected.length > 0)) return selected
  return Object.values(state.widgets).filter((widget) => widget.canvasId === state.activeCanvasId)
}

export function frameCanvas(scope: FrameScope, padding = 160): void {
  const rect = boundsForWidgets(widgetsForFrame(useWidgetStore.getState(), scope))
  if (rect) useCanvasStore.getState().fitRect(rect, padding)
  else if (scope === 'board') useCanvasStore.getState().fitAll()
}
