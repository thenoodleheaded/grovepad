import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdaptiveInputStore } from './useAdaptiveInputStore'
import { useFocusStore } from './useFocusStore'
import { useWidgetStore } from './useWidgetStore'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(performance.now() + 1_000)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  useAdaptiveInputStore.getState().setInteractionMode('select')
  useFocusStore.setState({
    focusedWidgetId: null,
    focusPurpose: null,
    savedInteractionMode: null,
  })
})

afterEach(() => {
  useFocusStore.setState({
    focusedWidgetId: null,
    focusPurpose: null,
    savedInteractionMode: null,
  })
  useWidgetStore.getState().loadBoard(baseline)
  vi.unstubAllGlobals()
})

describe('focused widget session', () => {
  it('switches edit/layout purpose without losing the original camera or mode', () => {
    const id = useWidgetStore.getState().createWidget('Focus test', { x: 2_000, y: 1_000 }, 'notes')

    useFocusStore.getState().enterFocus(id, 'edit')
    expect(useFocusStore.getState()).toMatchObject({
      focusedWidgetId: id,
      focusPurpose: 'edit',
      savedInteractionMode: 'select',
    })
    expect(useAdaptiveInputStore.getState().interactionMode).toBe('edit')

    useFocusStore.getState().enterFocus(id, 'layout')
    expect(useFocusStore.getState().focusPurpose).toBe('layout')
    expect(useAdaptiveInputStore.getState().interactionMode).toBe('select')

    useFocusStore.getState().exitFocus()
    expect(useFocusStore.getState().focusedWidgetId).toBeNull()
    expect(useAdaptiveInputStore.getState().interactionMode).toBe('select')
  })
})
