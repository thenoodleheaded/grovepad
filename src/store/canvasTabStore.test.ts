import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'
import { useCanvasStore } from './useCanvasStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

/** Create a canvas node on the active canvas and return both ids. */
function addNestedCanvas(title: string): { widgetId: string; canvasId: string } {
  const widgetId = useWidgetStore.getState().createWidget(title, { x: 0, y: 0 }, 'canvas_node')
  const widget = useWidgetStore.getState().widgets[widgetId]!
  return { widgetId, canvasId: (widget.data as { canvasId: string }).canvasId }
}

describe('canvas tabs in the board store', () => {
  it('always starts with one tab on the active canvas', () => {
    const state = useWidgetStore.getState()
    expect(state.openTabs).toHaveLength(1)
    expect(state.openTabs[0]!.id).toBe(state.activeTabId)
    expect(state.openTabs[0]!.canvasId).toBe(state.activeCanvasId)
  })

  it('moves the active tab when you navigate into a nested canvas', () => {
    const { canvasId } = addNestedCanvas('Nested')
    const tabId = useWidgetStore.getState().activeTabId

    useWidgetStore.getState().navigateToCanvas(canvasId)

    const state = useWidgetStore.getState()
    expect(state.activeTabId).toBe(tabId)
    expect(state.openTabs).toHaveLength(1)
    expect(state.openTabs[0]!.canvasId).toBe(canvasId)
    expect(state.activeCanvasId).toBe(canvasId)
  })

  it('opens a second tab without disturbing the first', () => {
    const rootCanvasId = useWidgetStore.getState().activeCanvasId
    const rootTabId = useWidgetStore.getState().activeTabId
    const { canvasId } = addNestedCanvas('Nested')

    useWidgetStore.getState().openCanvasTab(canvasId)

    const state = useWidgetStore.getState()
    expect(state.openTabs.map((tab) => tab.canvasId)).toEqual([rootCanvasId, canvasId])
    expect(state.activeTabId).not.toBe(rootTabId)
    expect(state.activeCanvasId).toBe(canvasId)
  })

  it('opens a background tab without moving the user', () => {
    const rootCanvasId = useWidgetStore.getState().activeCanvasId
    const rootTabId = useWidgetStore.getState().activeTabId
    const { canvasId } = addNestedCanvas('Nested')

    useWidgetStore.getState().openCanvasTab(canvasId, { activate: false })

    const state = useWidgetStore.getState()
    expect(state.openTabs).toHaveLength(2)
    expect(state.activeTabId).toBe(rootTabId)
    expect(state.activeCanvasId).toBe(rootCanvasId)
  })

  it('parks and restores the camera per canvas across tab switches', () => {
    const rootTabId = useWidgetStore.getState().activeTabId
    const { canvasId } = addNestedCanvas('Nested')
    useCanvasStore.getState().setView({ x: 120, y: 40 }, 1.5)

    useWidgetStore.getState().openCanvasTab(canvasId)
    useCanvasStore.getState().setView({ x: -80, y: 10 }, 0.5)
    useWidgetStore.getState().activateCanvasTab(rootTabId)

    expect(useCanvasStore.getState().pan).toEqual({ x: 120, y: 40 })
    expect(useCanvasStore.getState().zoom).toBe(1.5)
  })

  it('refuses to close the last tab', () => {
    const tabId = useWidgetStore.getState().activeTabId
    useWidgetStore.getState().closeCanvasTab(tabId)
    expect(useWidgetStore.getState().openTabs).toHaveLength(1)
  })

  it('lands on the neighbouring tab when the active one closes', () => {
    const rootCanvasId = useWidgetStore.getState().activeCanvasId
    const { canvasId } = addNestedCanvas('Nested')
    useWidgetStore.getState().openCanvasTab(canvasId)
    const openedTabId = useWidgetStore.getState().activeTabId

    useWidgetStore.getState().closeCanvasTab(openedTabId)

    const state = useWidgetStore.getState()
    expect(state.openTabs).toHaveLength(1)
    expect(state.activeCanvasId).toBe(rootCanvasId)
    expect(state.openTabs[0]!.id).toBe(state.activeTabId)
  })

  it('retires a background tab whose canvas is deleted from another tab', () => {
    const rootCanvasId = useWidgetStore.getState().activeCanvasId
    const { widgetId, canvasId } = addNestedCanvas('Nested')
    useWidgetStore.getState().openCanvasTab(canvasId, { activate: false })
    expect(useWidgetStore.getState().openTabs).toHaveLength(2)

    useWidgetStore.getState().deleteWidgets([widgetId])

    const state = useWidgetStore.getState()
    expect(state.canvases[canvasId]).toBeUndefined()
    expect(state.openTabs).toEqual([{ id: state.activeTabId, canvasId: rootCanvasId }])
  })

  it('retires the active tab when undo removes the canvas under it', () => {
    const rootCanvasId = useWidgetStore.getState().activeCanvasId
    const { canvasId } = addNestedCanvas('Nested')
    useWidgetStore.getState().openCanvasTab(canvasId)
    expect(useWidgetStore.getState().activeCanvasId).toBe(canvasId)

    // Undoing the canvas node's creation takes its canvas with it.
    useWidgetStore.getState().undo()

    const state = useWidgetStore.getState()
    expect(state.canvases[canvasId]).toBeUndefined()
    expect(state.openTabs.every((tab) => state.canvases[tab.canvasId])).toBe(true)
    expect(state.activeCanvasId).toBe(rootCanvasId)
    expect(state.openTabs.find((tab) => tab.id === state.activeTabId)?.canvasId).toBe(rootCanvasId)
  })

  it('keeps the tab row valid after a board load replaces the document', () => {
    const { canvasId } = addNestedCanvas('Nested')
    useWidgetStore.getState().openCanvasTab(canvasId)

    useWidgetStore.getState().loadBoard(baseline)

    const state = useWidgetStore.getState()
    expect(state.openTabs.length).toBeGreaterThanOrEqual(1)
    expect(state.openTabs.every((tab) => state.canvases[tab.canvasId])).toBe(true)
    expect(state.openTabs.find((tab) => tab.id === state.activeTabId)?.canvasId).toBe(
      state.activeCanvasId,
    )
  })

  it('reorders tabs without changing which one is in front', () => {
    const { canvasId } = addNestedCanvas('Nested')
    useWidgetStore.getState().openCanvasTab(canvasId)
    const [first, second] = useWidgetStore.getState().openTabs
    const activeTabId = useWidgetStore.getState().activeTabId

    useWidgetStore.getState().reorderCanvasTab(second!.id, first!.id)

    const state = useWidgetStore.getState()
    expect(state.openTabs.map((tab) => tab.id)).toEqual([second!.id, first!.id])
    expect(state.activeTabId).toBe(activeTabId)
  })

  it('never lets the tab row leak into a board document', () => {
    const { canvasId } = addNestedCanvas('Nested')
    useWidgetStore.getState().openCanvasTab(canvasId)

    const snapshot = buildBoardSnapshot(useWidgetStore.getState()) as unknown as Record<
      string,
      unknown
    >

    expect(snapshot.openTabs).toBeUndefined()
    expect(snapshot.activeTabId).toBeUndefined()
  })
})
