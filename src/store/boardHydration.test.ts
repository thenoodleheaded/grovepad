import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import unknownBoardFixture from '../utils/fixtures/boards/v2-unknown.json?raw'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

describe('board hydration boundary', () => {
  it('retains future payload content through the canonical store boundary', () => {
    const fixture = JSON.parse(unknownBoardFixture) as Record<string, unknown>
    const board = parsePersistedBoard(fixture)
    expect(board).not.toBeNull()

    useWidgetStore.getState().loadBoard(board!)

    expect(useWidgetStore.getState().widgets.future?.metadata.locked).toBe(true)
    expect(useWidgetStore.getState().duplicateWidgets(['future'])).toEqual([])
    const expectedDocument = { ...fixture }
    Reflect.deleteProperty(expectedDocument, 'activeWorkspaceId')
    Reflect.deleteProperty(expectedDocument, 'activeCanvasId')
    Reflect.deleteProperty(expectedDocument, 'canvasViews')
    expect(buildBoardSnapshot(useWidgetStore.getState())).toEqual(expectedDocument)
  })

  it('does not resurrect opaque semantic records after an endpoint is deleted', () => {
    const fixture = JSON.parse(unknownBoardFixture) as unknown
    const board = parsePersistedBoard(fixture)
    expect(board).not.toBeNull()
    useWidgetStore.getState().loadBoard(board!)

    useWidgetStore.getState().deleteWidget('alpha')

    const snapshot = buildBoardSnapshot(useWidgetStore.getState())
    expect(snapshot.relations).toEqual({})
    expect(snapshot.connections).toEqual({})
    expect(snapshot.groups).toEqual({})
    expect(snapshot.widgets.future).toBeDefined()
  })

  it('never includes transient hydration state in a persisted snapshot', () => {
    const widgetId = Object.keys(useWidgetStore.getState().widgets)[0]
    expect(widgetId).toBeDefined()
    useWidgetStore.getState().setWidgetHydration(widgetId!, true)

    const snapshot = buildBoardSnapshot(useWidgetStore.getState())
    expect(snapshot).toMatchObject({ format: 'grovepad-board', v: 2 })
    expect(snapshot.widgets[widgetId!]).not.toHaveProperty('isHydrating')
    expect(useWidgetStore.getState().widgets[widgetId!]?.isHydrating).toBe(true)
  })

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

  it('keeps local device navigation when a replacement document still contains it', () => {
    const board = parsePersistedBoard(JSON.parse(unknownBoardFixture))!
    board.canvases.child = {
      id: 'child',
      name: 'Child',
      workspaceId: 'workspace',
      parentCanvasId: 'canvas',
    }
    useWidgetStore.setState({
      activeWorkspaceId: 'workspace',
      activeCanvasId: 'child',
      canvasViews: { child: { pan: { x: 40, y: 50 }, zoom: 1.25 } },
    })

    useWidgetStore.getState().loadBoard(board)

    expect(useWidgetStore.getState()).toMatchObject({
      activeWorkspaceId: 'workspace',
      activeCanvasId: 'child',
      canvasViews: { child: { pan: { x: 40, y: 50 }, zoom: 1.25 } },
    })
  })

  it('restores legacy embedded navigation during authoritative local hydration', () => {
    const board = parsePersistedBoard(JSON.parse(unknownBoardFixture))!
    board.canvases.child = {
      id: 'child',
      name: 'Child',
      workspaceId: 'workspace',
      parentCanvasId: 'canvas',
    }
    board.activeCanvasId = 'child'
    board.canvasViews = { child: { pan: { x: 8, y: 9 }, zoom: 1.5 } }
    useWidgetStore.setState({
      activeWorkspaceId: 'workspace',
      activeCanvasId: 'canvas',
      canvasViews: {},
    })

    useWidgetStore.getState().loadBoard(board, { restorePersistedDeviceState: true })

    expect(useWidgetStore.getState()).toMatchObject({
      activeWorkspaceId: 'workspace',
      activeCanvasId: 'child',
      canvasViews: { child: { pan: { x: 8, y: 9 }, zoom: 1.5 } },
    })
  })
})
