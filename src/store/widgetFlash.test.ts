import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWidgetStore } from './useWidgetStore'

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  useWidgetStore.setState({ flashWidgetId: null })
})

describe('widget flash ownership', () => {
  it('lets a repeated flash own its full lifetime', () => {
    vi.useFakeTimers()
    const id = Object.keys(useWidgetStore.getState().widgets)[0]!

    useWidgetStore.getState().flashWidget(id)
    vi.advanceTimersByTime(1_000)
    useWidgetStore.getState().flashWidget(id)
    vi.advanceTimersByTime(600)
    expect(useWidgetStore.getState().flashWidgetId).toBe(id)

    vi.advanceTimersByTime(900)
    expect(useWidgetStore.getState().flashWidgetId).toBeNull()
  })
})
