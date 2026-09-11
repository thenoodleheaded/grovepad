import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdaptiveInputStore } from '../store/useAdaptiveInputStore'
import { deriveAdaptiveInputCapabilities } from '../utils/adaptiveInput'
import { initAdaptiveInputRuntime } from './adaptiveInputRuntime'

type Listener = (event: { pointerType?: string; key?: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }) => void

function fakeEventTarget() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    listeners,
    addEventListener(type: string, listener: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type: string, event: Parameters<Listener>[0] = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
  }
}

describe('adaptive input runtime', () => {
  beforeEach(() => {
    useAdaptiveInputStore.setState({
      activeInput: 'mouse',
      interactionMode: 'navigate',
      capabilities: deriveAdaptiveInputCapabilities({
        width: 1280,
        height: 720,
        hasCoarsePointer: false,
        hasFinePointer: true,
        canHover: true,
        reducedMotion: false,
      }),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('publishes hybrid capabilities, modality changes, viewport changes, and idempotent teardown', () => {
    const windowTarget = fakeEventTarget()
    const viewportTarget = fakeEventTarget()
    const queries = new Map<string, ReturnType<typeof fakeEventTarget> & { matches: boolean }>()
    const matchMedia = (query: string) => {
      let entry = queries.get(query)
      if (!entry) {
        entry = Object.assign(fakeEventTarget(), {
          matches:
            query === '(any-pointer: coarse)' ||
            query === '(any-pointer: fine)' ||
            query === '(any-hover: hover)',
        })
        queries.set(query, entry)
      }
      return entry
    }
    const visualViewport = Object.assign(viewportTarget, { width: 834, height: 1194 })
    const styles = new Map<string, string>()
    const root = {
      dataset: {} as Record<string, string>,
      style: { setProperty: (name: string, value: string) => styles.set(name, value) },
    }
    vi.stubGlobal('document', { documentElement: root })
    vi.stubGlobal('window', {
      ...windowTarget,
      innerWidth: 834,
      innerHeight: 1194,
      visualViewport,
      matchMedia,
    })

    const dispose = initAdaptiveInputRuntime()
    expect(root.dataset).toMatchObject({
      activeInput: 'mouse',
      interactionMode: 'navigate',
      viewportClass: 'tablet',
      hasCoarsePointer: 'true',
      hasFinePointer: 'true',
      canHover: 'true',
    })

    windowTarget.dispatch('pointerdown', { pointerType: 'pen' })
    expect(root.dataset.activeInput).toBe('pen')

    visualViewport.width = 390
    visualViewport.height = 844
    viewportTarget.dispatch('resize')
    expect(root.dataset.viewportClass).toBe('phone')
    expect(root.dataset.virtualKeyboard).toBe('open')
    expect(styles.get('--gp-keyboard-inset')).toBe('350px')

    dispose()
    dispose()
    expect([...windowTarget.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true)
    expect([...viewportTarget.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true)
    expect(
      [...queries.values()].every((query) =>
        [...query.listeners.values()].every((listeners) => listeners.size === 0),
      ),
    ).toBe(true)
  })
  it('puts an iOS-scrolled document back once no field is being edited', () => {
    const windowTarget = fakeEventTarget()
    const viewportTarget = fakeEventTarget()
    const matchMedia = () => Object.assign(fakeEventTarget(), { matches: false })
    const visualViewport = Object.assign(viewportTarget, { width: 402, height: 874 })
    const root = { dataset: {} as Record<string, string>, style: { setProperty: () => undefined } }
    const input = { tagName: 'INPUT', isContentEditable: false }
    const body = { tagName: 'BODY', isContentEditable: false }
    const fakeDocument = { documentElement: root, activeElement: input as unknown }
    const scrollTo = vi.fn()
    const fakeWindow = {
      ...windowTarget,
      innerWidth: 402,
      innerHeight: 874,
      scrollX: 0,
      scrollY: 0,
      visualViewport,
      matchMedia,
      scrollTo,
      requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1 },
      cancelAnimationFrame: vi.fn(),
    }
    vi.stubGlobal('document', fakeDocument)
    vi.stubGlobal('window', fakeWindow)

    const dispose = initAdaptiveInputRuntime()
    expect(scrollTo).not.toHaveBeenCalled()

    // Focusing a field: iOS lifts the document and the keyboard takes 336px.
    fakeWindow.scrollY = 180
    visualViewport.height = 538
    viewportTarget.dispatch('resize')
    expect(scrollTo).not.toHaveBeenCalled()

    // Moving focus between fields must not yank the document mid-edit.
    windowTarget.dispatch('focusout')
    expect(scrollTo).not.toHaveBeenCalled()

    // Done editing: keyboard gone, nothing focused, document restored.
    fakeDocument.activeElement = body
    visualViewport.height = 874
    viewportTarget.dispatch('resize')
    expect(scrollTo).toHaveBeenCalledWith(0, 0)

    scrollTo.mockClear()
    fakeWindow.scrollY = 64
    windowTarget.dispatch('focusout')
    expect(scrollTo).toHaveBeenCalledWith(0, 0)

    dispose()
    expect([...windowTarget.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true)
  })
})
