import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { useWidgetStore } from './useWidgetStore'

const baseline = buildBoardSnapshot(useWidgetStore.getState())

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

describe('board hydration boundary', () => {
  it('replaces canonical board state and clears undo and redo history', () => {
    const store = useWidgetStore.getState()
    const createdId = store.createWidget('Temporary', { x: 10_000, y: 10_000 }, 'notes')
    expect(useWidgetStore.getState().canUndo).toBe(true)
    expect(useWidgetStore.getState().widgets[createdId]).toBeDefined()

    useWidgetStore.getState().loadBoard(baseline)
    const hydrated = useWidgetStore.getState()
    expect(hydrated.canUndo).toBe(false)
    expect(hydrated.canRedo).toBe(false)
    expect(hydrated.widgets[createdId]).toBeUndefined()

    const widgetIds = Object.keys(hydrated.widgets)
    hydrated.undo()
    expect(Object.keys(useWidgetStore.getState().widgets)).toEqual(widgetIds)
  })

  it('clears transient selection and linking state during hydration', () => {
    const widgetId = Object.keys(useWidgetStore.getState().widgets)[0]
    expect(widgetId).toBeDefined()
    useWidgetStore.setState({
      selectedIds: new Set([widgetId!]),
      contextMenu: { widgetId: widgetId!, x: 10, y: 10 },
      childLinkSource: widgetId!,
      dependencyLinkSource: widgetId!,
    })

    useWidgetStore.getState().loadBoard(baseline)
    const hydrated = useWidgetStore.getState()
    expect(hydrated.selectedIds.size).toBe(0)
    expect(hydrated.contextMenu).toBeNull()
    expect(hydrated.childLinkSource).toBeNull()
    expect(hydrated.dependencyLinkSource).toBeNull()
  })
})
