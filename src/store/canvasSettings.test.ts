import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { GENERATION_GAP } from './generationFloor'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

describe('per-canvas settings', () => {
  it('updates only the requested canvas and clamps grid strength', () => {
    const firstCanvasId = useWidgetStore.getState().activeCanvasId
    const secondWorkspaceId = useWidgetStore.getState().createWorkspace('Second')
    const secondCanvasId = useWidgetStore.getState().workspaces[secondWorkspaceId]!.rootCanvasId

    useWidgetStore.getState().updateCanvasSettings(firstCanvasId, {
      shared: true,
      gridIntensity: 150,
      linksVisible: false,
    })

    expect(useWidgetStore.getState().canvases[firstCanvasId]).toMatchObject({
      shared: true,
      gridIntensity: 100,
      linksVisible: false,
    })
    expect(useWidgetStore.getState().canvases[secondCanvasId]).not.toHaveProperty('shared')
    expect(useWidgetStore.getState().canvases[secondCanvasId]).not.toHaveProperty('gridIntensity')
    expect(useWidgetStore.getState().canvases[secondCanvasId]).not.toHaveProperty('linksVisible')
  })

  it('survives the exported-board validation round trip', () => {
    const canvasId = useWidgetStore.getState().activeCanvasId
    useWidgetStore.getState().updateCanvasSettings(canvasId, {
      shared: true,
      gridIntensity: 42,
      linksVisible: false,
    })

    const parsed = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))

    expect(parsed?.canvases[canvasId]).toMatchObject({
      shared: true,
      gridIntensity: 42,
      linksVisible: false,
    })
  })

  it('a new parent line never moves the parent, and drops the child below it', () => {
    // The height rule is the ONE thing linking rearranges: the parent holds its
    // place, sideways placement is left alone, and the child lands under it.
    const sourceId = useWidgetStore.getState().createWidget('Source', { x: 0, y: 400 }, 'text')
    const targetId = useWidgetStore.getState().createWidget('Target', { x: 1200, y: 0 }, 'text')
    const sourceBefore = useWidgetStore.getState().widgets[sourceId]!.position
    const targetBefore = useWidgetStore.getState().widgets[targetId]!.position

    useWidgetStore.getState().addRelation(sourceId, targetId, 'parent')

    const after = useWidgetStore.getState()
    expect(after.widgets[sourceId]!.position).toEqual(sourceBefore)
    expect(after.widgets[targetId]!.position.x).toBe(targetBefore.x)
    // Measured against the parent's TOP plus a generation: the rule works on
    // the boxes cards actually occupy at rest, not their dormant full size.
    expect(after.widgets[targetId]!.position.y).toBeGreaterThan(sourceBefore.y + GENERATION_GAP)
  })

  it('keeps the drawn direction for a drag connection', () => {
    const lowerSourceId = useWidgetStore.getState().createWidget('Lower source', { x: 0, y: 400 }, 'text')
    const upperTargetId = useWidgetStore.getState().createWidget('Upper target', { x: 1200, y: 0 }, 'text')

    useWidgetStore.getState().startLinkDrag(lowerSourceId, { x: 1200, y: 0 }, { x: 0, y: 0 })
    useWidgetStore.getState().endLinkDrag(upperTargetId)

    expect(Object.values(useWidgetStore.getState().relations)).toContainEqual(
      expect.objectContaining({ fromId: lowerSourceId, toId: upperTargetId, type: 'parent' }),
    )

    const beforeMove = useWidgetStore.getState().widgets[upperTargetId]!.position
    useWidgetStore.getState().moveWidget(upperTargetId, { x: 0, y: -40 }, 1)
    expect(useWidgetStore.getState().widgets[upperTargetId]!.position).toEqual({
      x: beforeMove.x,
      y: beforeMove.y - 40,
    })
  })

  it('ignores the legacy canvas-wide strict flag', () => {
    const canvasId = useWidgetStore.getState().activeCanvasId
    const legacyBoard = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!
    legacyBoard.canvases[canvasId] = {
      ...legacyBoard.canvases[canvasId]!,
      relationStrict: true,
    }
    useWidgetStore.getState().loadBoard(legacyBoard)

    const lowerId = useWidgetStore.getState().createWidget('Lower', { x: 0, y: 400 }, 'text')
    const upperId = useWidgetStore.getState().createWidget('Upper', { x: 800, y: 0 }, 'text')
    const positionsBefore = {
      lower: useWidgetStore.getState().widgets[lowerId]!.position,
      upper: useWidgetStore.getState().widgets[upperId]!.position,
    }
    const relationId = useWidgetStore.getState().addRelation(lowerId, upperId, 'parent')

    expect(useWidgetStore.getState().relations[relationId]).toMatchObject({
      fromId: lowerId,
      toId: upperId,
      type: 'parent',
    })
    // The legacy canvas flag decides nothing: the parent still holds its place,
    // and the child answers to the same height rule every board obeys.
    expect(useWidgetStore.getState().widgets[lowerId]!.position).toEqual(positionsBefore.lower)
    expect(useWidgetStore.getState().widgets[upperId]!.position.x).toBe(positionsBefore.upper.x)
    expect(useWidgetStore.getState().widgets[upperId]!.position.y).toBeGreaterThan(
      positionsBefore.upper.y,
    )
  })
})
