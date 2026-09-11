import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { COLLAPSED_MEMBER_SIZE } from '../utils/glueGeometry'
import { captureClipboardPayload, getClipboardPayload } from '../utils/widgetClipboard'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

let spawnCursor = 0

type SpawnType = Parameters<ReturnType<typeof useWidgetStore.getState>['createWidget']>[2]

/** Fresh cards far from the seed board so settling never collides with it. */
function spawn(type: SpawnType, title: string) {
  const baseX = 60_000 + spawnCursor * 6_000
  spawnCursor += 1
  return useWidgetStore.getState().createWidget(title, { x: baseX, y: 60_000 }, type)
}

function canvasIdOf(widgetId: string): string {
  return (useWidgetStore.getState().widgets[widgetId]!.data as { canvasId: string }).canvasId
}

describe('structural clipboard', () => {
  it('copy then paste rebuilds wires between the copied cards', () => {
    const from = spawn('counter', 'Wire source')
    const to = spawn('goal_tracker', 'Wire target')
    const wire = useWidgetStore.getState().addConnection({
      fromId: from, fromField: 'count', toId: to, kind: 'value', toField: 'percent',
    })
    expect(wire).toBeTruthy()

    useWidgetStore.getState().copyWidgets([from, to])
    const pasted = useWidgetStore.getState().pasteWidgets(getClipboardPayload())

    expect(pasted).toHaveLength(2)
    const state = useWidgetStore.getState()
    const pastedSet = new Set(pasted)
    const cloneWire = Object.values(state.connections).find(
      (connection) => pastedSet.has(connection.fromId) && pastedSet.has(connection.toId),
    )
    expect(cloneWire).toBeDefined()
    expect(cloneWire!.id).not.toBe(wire)
    expect(cloneWire!.fromField).toBe('count')
    expect(cloneWire!.toField).toBe('percent')
    // The original wire is untouched.
    expect(state.connections[wire!]).toBeDefined()
  })

  it('copy then paste rebuilds a folded glue cluster instead of loose cards', () => {
    const a = spawn('text', 'Weld A')
    const b = spawn('text', 'Weld B')
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)
    expect(useWidgetStore.getState().widgets[a]!.size).toEqual(COLLAPSED_MEMBER_SIZE)

    useWidgetStore.getState().copyWidgets([a, b])
    const pasted = useWidgetStore.getState().pasteWidgets(getClipboardPayload())

    const state = useWidgetStore.getState()
    const cloneGlueId = state.widgetGlueIndex[pasted[0]!]
    expect(cloneGlueId).toBeDefined()
    expect(cloneGlueId).not.toBe(glueId)
    const cloneGlue = state.glues[cloneGlueId!]!
    expect(cloneGlue.widgetIds.sort()).toEqual([...pasted].sort())
    // The fold travelled: still collapsed, members legitimately iconified.
    expect(cloneGlue.collapsed).toBe(true)
    for (const id of pasted) {
      expect(state.widgets[id]!.size).toEqual(COLLAPSED_MEMBER_SIZE)
    }
    // Restore entries were re-keyed onto the clones, not left on the sources.
    expect(Object.keys(cloneGlue.restore ?? {}).sort()).toEqual([...pasted].sort())
  })

  it('copy then paste carries relation links and recomputes blockers', () => {
    const gate = spawn('checklist', 'Blocker gate')
    const blocked = spawn('text', 'Blocked card')
    useWidgetStore.getState().addRelation(gate, blocked, 'blocker')
    expect(useWidgetStore.getState().blockedWidgetIds.has(blocked)).toBe(true)

    useWidgetStore.getState().copyWidgets([gate, blocked])
    const pasted = useWidgetStore.getState().pasteWidgets(getClipboardPayload())

    const state = useWidgetStore.getState()
    const pastedSet = new Set(pasted)
    const cloneRelation = Object.values(state.relations).find(
      (relation) => pastedSet.has(relation.fromId) && pastedSet.has(relation.toId),
    )
    expect(cloneRelation).toBeDefined()
    expect(cloneRelation!.type).toBe('blocker')
    const blockedClone = pasted.find((id) => id === cloneRelation!.toId)!
    expect(state.blockedWidgetIds.has(blockedClone)).toBe(true)
  })

  it('captures a canvas card with its full subtree, and cut → paste restores it', () => {
    const card = spawn('canvas_node', 'Project board')
    const innerCanvasId = canvasIdOf(card)
    useWidgetStore.getState().navigateToCanvas(innerCanvasId)
    const child = useWidgetStore.getState().createWidget('Inner note', { x: 200, y: 200 }, 'text')
    const nestedCard = useWidgetStore.getState().createWidget('Nested board', { x: 900, y: 200 }, 'canvas_node')
    const nestedCanvasId = canvasIdOf(nestedCard)
    useWidgetStore.getState().navigateToCanvas(nestedCanvasId)
    const deepChild = useWidgetStore.getState().createWidget('Deep note', { x: 100, y: 100 }, 'text')
    useWidgetStore.getState().navigateToCanvas(baseline.activeCanvasId!)

    const payload = captureClipboardPayload(useWidgetStore.getState(), [card])
    expect(payload.widgets.map((widget) => widget.id)).toEqual([card])
    expect(payload.canvases.map((canvas) => canvas.id).sort()).toEqual(
      [innerCanvasId, nestedCanvasId].sort(),
    )
    expect(payload.canvasWidgets.map((widget) => widget.id).sort()).toEqual(
      [child, nestedCard, deepChild].sort(),
    )

    // Cut removes the whole branch; paste brings back an equivalent one.
    useWidgetStore.getState().cutWidgets([card])
    expect(useWidgetStore.getState().widgets[child]).toBeUndefined()
    expect(useWidgetStore.getState().canvases[innerCanvasId]).toBeUndefined()

    const pasted = useWidgetStore.getState().pasteWidgets(getClipboardPayload())
    expect(pasted).toHaveLength(1)
    const state = useWidgetStore.getState()
    const pastedCanvasId = (state.widgets[pasted[0]!]!.data as { canvasId: string }).canvasId
    expect(pastedCanvasId).not.toBe(innerCanvasId)
    const pastedCanvas = state.canvases[pastedCanvasId]!
    expect(pastedCanvas.parentCanvasId).toBe(state.activeCanvasId)
    const innerClones = Object.values(state.widgets).filter(
      (widget) => widget.canvasId === pastedCanvasId,
    )
    expect(innerClones.map((widget) => widget.title).sort()).toEqual(
      ['Inner note', 'Nested board'].sort(),
    )
    const nestedClone = innerClones.find((widget) => widget.type === 'canvas_node')!
    const nestedCloneCanvasId = (nestedClone.data as { canvasId: string }).canvasId
    expect(nestedCloneCanvasId).not.toBe(nestedCanvasId)
    expect(state.canvases[nestedCloneCanvasId]!.parentCanvasId).toBe(pastedCanvasId)
    const deepClones = Object.values(state.widgets).filter(
      (widget) => widget.canvasId === nestedCloneCanvasId,
    )
    expect(deepClones.map((widget) => widget.title)).toEqual(['Deep note'])
  })

  it('duplicating a canvas card duplicates its contents, not an empty shell', () => {
    const card = spawn('canvas_node', 'Filled board')
    const innerCanvasId = canvasIdOf(card)
    useWidgetStore.getState().navigateToCanvas(innerCanvasId)
    useWidgetStore.getState().createWidget('Inside A', { x: 100, y: 100 }, 'text')
    useWidgetStore.getState().createWidget('Inside B', { x: 700, y: 100 }, 'checklist')
    useWidgetStore.getState().navigateToCanvas(baseline.activeCanvasId!)

    const [copy] = useWidgetStore.getState().duplicateWidgets([card])
    const state = useWidgetStore.getState()
    expect(state.widgets[copy!]!.title).toBe('Filled board copy')
    const copyCanvasId = (state.widgets[copy!]!.data as { canvasId: string }).canvasId
    expect(copyCanvasId).not.toBe(innerCanvasId)
    expect(state.canvases[copyCanvasId]!.name).toBe('Filled board copy')
    const copiedInner = Object.values(state.widgets).filter(
      (widget) => widget.canvasId === copyCanvasId,
    )
    // Contents crossed with the card — same titles, no " copy" suffix inside.
    expect(copiedInner.map((widget) => widget.title).sort()).toEqual(['Inside A', 'Inside B'])
    // The original board is untouched.
    const originalInner = Object.values(state.widgets).filter(
      (widget) => widget.canvasId === innerCanvasId,
    )
    expect(originalInner.map((widget) => widget.title).sort()).toEqual(['Inside A', 'Inside B'])
  })

  it('duplicate carries relation links inside the duplicated set', () => {
    const parent = spawn('text', 'Family parent')
    const kid = spawn('text', 'Family child')
    useWidgetStore.getState().addRelation(parent, kid, 'parent')

    const copies = useWidgetStore.getState().duplicateWidgets([parent, kid])
    const state = useWidgetStore.getState()
    const copySet = new Set(copies)
    const cloneRelation = Object.values(state.relations).find(
      (relation) => copySet.has(relation.fromId) && copySet.has(relation.toId),
    )
    expect(cloneRelation).toBeDefined()
    expect(cloneRelation!.type).toBe('parent')
  })
})
