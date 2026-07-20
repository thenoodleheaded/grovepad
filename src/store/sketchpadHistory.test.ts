import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import type { SketchpadData } from '../types/widgetDataCore'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

const stroke = (id: string) => ({
  id,
  color: '#fff',
  size: 4,
  points: [{ x: 0.5, y: 0.5, pressure: 0.5 }],
})

describe('Sketchpad history', () => {
  it('undoes and redoes every completed gesture independently', () => {
    const store = useWidgetStore.getState()
    const id = store.createWidget('History sketch', { x: 30_000, y: 30_000 }, 'sketchpad')
    store.updateWidgetData(id, { height: 240, strokes: [stroke('a')] }, { coalesceHistory: false })
    store.updateWidgetData(id, { height: 240, strokes: [stroke('a'), stroke('b')] }, { coalesceHistory: false })

    useWidgetStore.getState().undo()
    expect((useWidgetStore.getState().widgets[id]!.data as SketchpadData).strokes).toHaveLength(1)
    useWidgetStore.getState().redo()
    expect((useWidgetStore.getState().widgets[id]!.data as SketchpadData).strokes).toHaveLength(2)
  })
})
