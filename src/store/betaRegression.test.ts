import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useCanvasStore } from './useCanvasStore'
import { useWidgetStore } from './useWidgetStore'
import { analyzeWidgetDeletion } from './widgetDeletion'
import { widgetsForFrame } from '../utils/cameraFraming'
import { restingFootprintWidget } from '../utils/widgetRest'
import { rectsOverlap } from './widgetCollection'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
  useCanvasStore.getState().setViewportSize({ width: 1280, height: 720 })
  useCanvasStore.getState().setView({ x: 0, y: 0 }, 1)
})

describe('beta report store regressions', () => {
  it('keeps consecutive picker creations from overlapping at their resting footprints', () => {
    const origin = { x: 1200, y: 1200 }
    const ids = [
      useWidgetStore.getState().createWidget('Audit Note', origin, 'notes'),
      useWidgetStore.getState().createWidget('Tasks', origin, 'checklist'),
      useWidgetStore.getState().createWidget('Toggle', origin, 'toggle'),
      useWidgetStore.getState().createWidget('Calculator', origin, 'calculator'),
      useWidgetStore.getState().createWidget('Number Input', origin, 'number_input'),
      useWidgetStore.getState().createWidget('Table', origin, 'table'),
      useWidgetStore.getState().createWidget('Timer', origin, 'timekeeper'),
    ]
    const widgets = ids.map((id) =>
      restingFootprintWidget(useWidgetStore.getState().widgets[id]!),
    )

    for (let i = 0; i < widgets.length; i++) {
      for (let j = i + 1; j < widgets.length; j++) {
        const a = widgets[i]!
        const b = widgets[j]!
        expect(
          rectsOverlap(
            { id: a.id, ...a.position, ...a.size },
            { id: b.id, ...b.position, ...b.size },
            0,
          ),
          `${a.title} ${JSON.stringify({ ...a.position, ...a.size })} overlaps ${b.title} ${JSON.stringify({ ...b.position, ...b.size })}`,
        ).toBe(false)
      }
    }
  })

  it('clears an obsolete redo branch when a workspace is created', () => {
    const first = useWidgetStore.getState().createWorkspace('First')
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().workspaces[first]).toBeUndefined()
    expect(useWidgetStore.getState().canRedo).toBe(true)

    const replacement = useWidgetStore.getState().createWorkspace('Replacement')
    expect(useWidgetStore.getState().canRedo).toBe(false)
    useWidgetStore.getState().redo()
    expect(useWidgetStore.getState().workspaces[replacement]?.name).toBe('Replacement')
  })

  it('round-trips exact world geometry independently of the camera', () => {
    const id = useWidgetStore.getState().createWidget('Geometry', { x: 1200, y: -840 }, 'notes')
    const before = useWidgetStore.getState().widgets[id]!
    useCanvasStore.getState().setView({ x: -500, y: 900 }, 0.4)
    useWidgetStore.getState().snapshotHistory('drag:test')
    useWidgetStore.getState().moveWidget(id, { x: 160, y: 80 }, 0.4)
    useWidgetStore.getState().resizeWidget(id, { width: 560, height: 360 })
    const after = useWidgetStore.getState().widgets[id]!

    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[id]?.position).toEqual(before.position)
    expect(useWidgetStore.getState().widgets[id]?.size).toEqual(before.size)
    useWidgetStore.getState().redo()
    expect(useWidgetStore.getState().widgets[id]?.position).toEqual(after.position)
    expect(useWidgetStore.getState().widgets[id]?.size).toEqual(after.size)
  })

  it('makes framing atomic, padded, and board-scoped regardless of selection', () => {
    const selected = useWidgetStore.getState().createWidget('Selected', { x: 0, y: 0 }, 'notes')
    const remote = useWidgetStore.getState().createWidget('Remote', { x: 5000, y: 3000 }, 'notes')
    useWidgetStore.getState().selectWidget(selected, false)
    const targets = widgetsForFrame(useWidgetStore.getState(), 'board')
    expect(targets.map((widget) => widget.id)).toEqual(expect.arrayContaining([selected, remote]))

    const target = useWidgetStore.getState().widgets[selected]!
    useCanvasStore.getState().fitRect({ ...target.position, ...target.size }, 120)
    const { pan, zoom } = useCanvasStore.getState()
    expect(target.position.x * zoom + pan.x).toBeGreaterThanOrEqual(120)
    expect(target.position.y * zoom + pan.y).toBeGreaterThanOrEqual(120)
    expect((target.position.x + target.size.width) * zoom + pan.x).toBeLessThanOrEqual(1160)
    expect((target.position.y + target.size.height) * zoom + pan.y).toBeLessThanOrEqual(600)
  })

  it('counts every descendant before deleting a nested canvas', () => {
    const owner = useWidgetStore.getState().createWidget('Nested', { x: 0, y: 0 }, 'canvas_node')
    const childCanvas = (useWidgetStore.getState().widgets[owner]!.data as { canvasId: string }).canvasId
    useWidgetStore.getState().navigateToCanvas(childCanvas)
    const child = useWidgetStore.getState().createWidget('Child', { x: 0, y: 0 }, 'notes')
    const nestedOwner = useWidgetStore.getState().createWidget('Deeper', { x: 400, y: 0 }, 'canvas_node')
    const deeperCanvas = (useWidgetStore.getState().widgets[nestedOwner]!.data as { canvasId: string }).canvasId
    useWidgetStore.getState().navigateToCanvas(deeperCanvas)
    const grandchild = useWidgetStore.getState().createWidget('Grandchild', { x: 0, y: 0 }, 'notes')

    const impact = analyzeWidgetDeletion(useWidgetStore.getState(), [owner])
    expect(impact.removedCanvasIds).toEqual(new Set([childCanvas, deeperCanvas]))
    expect(impact.removedWidgetIds).toEqual(new Set([owner, child, nestedOwner, grandchild]))
    expect(impact.descendantWidgetCount).toBe(3)
  })

  it('undoes generated output and completion status as one transaction', () => {
    const generator = useWidgetStore.getState().createWidget('Generator', { x: 0, y: 0 }, 'ai_generator')
    useWidgetStore.getState().updateWidgetData(generator, { prompt: 'One checklist', status: 'done' })
    const created = useWidgetStore.getState().commitThoughtPlan({
      sourceText: 'One checklist', confidence: 1,
      nodes: [{ temporaryId: 'one', widgetType: 'checklist', title: 'One checklist', data: { items: [] }, sourceText: 'One checklist', confidence: 1, depth: 0, metadata: { badges: [] } }],
      relations: [], warnings: [],
    }, { x: 500, y: 0 })
    useWidgetStore.getState().applyWireWrites(new Map([[generator, { prompt: 'One checklist', status: 'done' }]]))
    expect(created).toHaveLength(1)
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[created[0]!]).toBeUndefined()
    expect(useWidgetStore.getState().widgets[generator]?.data).toEqual({ prompt: 'One checklist', status: 'done' })
  })
})
