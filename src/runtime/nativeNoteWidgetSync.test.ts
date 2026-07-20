import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeWidgetStore } from '../store/useNativeWidgetStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { initNativeNoteWidgetSync } from './nativeNoteWidgetSync'

describe('native Note widget sync runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useNativeWidgetStore.setState({ selectedWidgetId: null, syncStatus: 'idle', lastError: null })
  })

  afterEach(() => vi.useRealTimers())

  it('debounces edits, skips unrelated mutations, and clears a deleted selection', async () => {
    const id = useWidgetStore.getState().createWidget('Native note', { x: 8_000, y: 8_000 }, 'notes')
    useNativeWidgetStore.getState().setSelectedWidgetId(id)
    const invoke = vi.fn(async (
      _command: 'sync_note_widget',
      _args: { payload: string },
    ) => ({ supported: true, changed: true }))
    const dispose = initNativeNoteWidgetSync({ isNative: () => true, invoke, debounceMs: 100 })

    await vi.runAllTimersAsync()
    expect(invoke).toHaveBeenCalledTimes(1)

    useWidgetStore.getState().updateWidgetData(id, { text: 'a' })
    useWidgetStore.getState().updateWidgetData(id, { text: 'ab' })
    await vi.advanceTimersByTimeAsync(99)
    expect(invoke).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(JSON.parse(invoke.mock.calls[1]![1].payload).note.text).toBe('ab')

    useWidgetStore.setState({ flashWidgetId: id })
    await vi.runAllTimersAsync()
    expect(invoke).toHaveBeenCalledTimes(2)

    useWidgetStore.setState((state) => ({
      widgets: {
        ...state.widgets,
        [id]: {
          ...state.widgets[id]!,
          position: {
            ...state.widgets[id]!.position,
            x: state.widgets[id]!.position.x + 40,
          },
        },
      },
    }))
    await vi.runAllTimersAsync()
    expect(invoke).toHaveBeenCalledTimes(2)

    useWidgetStore.getState().deleteWidget(id)
    await vi.runAllTimersAsync()
    expect(JSON.parse(invoke.mock.calls[2]![1].payload).note).toBeNull()
    dispose()
    dispose()
  })

  it('coalesces edits made while native persistence is in flight', async () => {
    const id = useWidgetStore.getState().createWidget('Native note', { x: 8_400, y: 8_000 }, 'notes')
    useNativeWidgetStore.getState().setSelectedWidgetId(id)
    let finishFirst: ((value: { supported: boolean; changed: boolean }) => void) | undefined
    const invoke = vi.fn((_command: 'sync_note_widget', _args: { payload: string }) => {
      if (invoke.mock.calls.length === 1) {
        return new Promise<{ supported: boolean; changed: boolean }>((resolve) => {
          finishFirst = resolve
        })
      }
      return Promise.resolve({ supported: true, changed: true })
    })
    const dispose = initNativeNoteWidgetSync({ isNative: () => true, invoke, debounceMs: 20 })

    await vi.advanceTimersByTimeAsync(0)
    expect(invoke).toHaveBeenCalledTimes(1)
    useWidgetStore.getState().updateWidgetData(id, { text: 'first queued edit' })
    useWidgetStore.getState().updateWidgetData(id, { text: 'newest edit' })
    await vi.advanceTimersByTimeAsync(20)
    expect(invoke).toHaveBeenCalledTimes(1)

    finishFirst?.({ supported: true, changed: true })
    await vi.runAllTimersAsync()
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(JSON.parse(invoke.mock.calls[1]![1].payload).note.text).toBe('newest edit')
    dispose()
  })

  it('is inert in the browser', () => {
    const invoke = vi.fn(async (
      _command: 'sync_note_widget',
      _args: { payload: string },
    ) => ({ supported: true, changed: true }))
    const dispose = initNativeNoteWidgetSync({ isNative: () => false, invoke })
    vi.runAllTimers()
    expect(invoke).not.toHaveBeenCalled()
    dispose()
  })

  it('probes an unsupported desktop only once', async () => {
    const id = useWidgetStore.getState().createWidget('Native note', { x: 8_800, y: 8_000 }, 'notes')
    useNativeWidgetStore.getState().setSelectedWidgetId(id)
    const invoke = vi.fn(async (
      _command: 'sync_note_widget',
      _args: { payload: string },
    ) => ({ supported: false, changed: false }))
    const dispose = initNativeNoteWidgetSync({ isNative: () => true, invoke, debounceMs: 20 })

    await vi.runAllTimersAsync()
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(useNativeWidgetStore.getState().syncStatus).toBe('unsupported')

    useWidgetStore.getState().updateWidgetData(id, { text: 'no bridge work' })
    await vi.runAllTimersAsync()
    expect(invoke).toHaveBeenCalledTimes(1)
    dispose()
  })
})
