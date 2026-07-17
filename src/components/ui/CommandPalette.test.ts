import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../../utils/persistence'
import { parsePersistedBoard } from '../../utils/persistedBoardSchema'
import { useWidgetStore } from '../../store/useWidgetStore'
import { historyPaletteActionIds } from '../../utils/commandPaletteAvailability'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!
afterEach(() => useWidgetStore.getState().loadBoard(baseline))

describe('Command Palette action availability', () => {
  it('omits unavailable Undo and Redo instead of presenting inert actions', () => {
    useWidgetStore.getState().loadBoard(baseline)
    expect(historyPaletteActionIds(useWidgetStore.getState().canUndo, useWidgetStore.getState().canRedo)).toEqual([])
    useWidgetStore.getState().createWidget('History', { x: 9000, y: 9000 }, 'notes')
    expect(historyPaletteActionIds(useWidgetStore.getState().canUndo, useWidgetStore.getState().canRedo)).toContain('action-undo')
    useWidgetStore.getState().undo()
    expect(historyPaletteActionIds(useWidgetStore.getState().canUndo, useWidgetStore.getState().canRedo)).toContain('action-redo')
  })
})
