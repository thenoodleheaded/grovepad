import { useWidgetStore } from '../store/useWidgetStore'

/** The modifier state every canvas link reads, however it was clicked. */
export interface CanvasOpenModifiers {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

/**
 * One decision shared by every surface that can send you to a canvas — the
 * canvas card, the canvas tree, the breadcrumbs, and search results — so a
 * modifier means the same thing wherever you click.
 *
 * A plain click navigates the tab you are already in, exactly as it did before
 * tabs existed. Cmd/Ctrl opens a background tab, and adding Shift brings that
 * tab to the front: the convention browsers taught everyone.
 */
export function openCanvasFromClick(canvasId: string, modifiers?: CanvasOpenModifiers): void {
  const store = useWidgetStore.getState()
  if (!store.canvases[canvasId]) return
  if (modifiers && (modifiers.metaKey || modifiers.ctrlKey)) {
    store.openCanvasTab(canvasId, { activate: modifiers.shiftKey })
    return
  }
  store.navigateToCanvas(canvasId)
}

/** Middle-click, which every tabbed interface treats as "open in a new tab". */
export function openCanvasInBackgroundTab(canvasId: string): void {
  const store = useWidgetStore.getState()
  if (!store.canvases[canvasId]) return
  store.openCanvasTab(canvasId, { activate: false })
}
