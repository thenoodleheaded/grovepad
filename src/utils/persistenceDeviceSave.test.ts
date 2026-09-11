import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// What counts as a change worth writing the device record for.
//
// The tab row lives in the device record, not the board document, so the only
// thing that ever writes it is the persistence subscription's `deviceChanged`
// predicate. A mutation that misses that predicate is serialized nowhere:
// nothing is scheduled, the pagehide flush has nothing pending, and the change
// is gone on reload. Reordering a tab touches `openTabs` and nothing else, so
// it is exactly the case a predicate built around "which canvas am I on" drops.
// ---------------------------------------------------------------------------

vi.mock('./boardDatabase', () => ({
  readBoardDatabase: vi.fn(() => Promise.resolve(null)),
  writeBoardDatabase: vi.fn(() => Promise.resolve()),
  writeMigratedBoardDatabase: vi.fn(() => Promise.resolve()),
  saveRollingSnapshot: vi.fn(() => Promise.resolve()),
  listRollingSnapshots: vi.fn(() => Promise.resolve([])),
  writeMediaBlob: vi.fn(() => Promise.resolve()),
  readMediaBlob: vi.fn(() => Promise.resolve(null)),
}))

// Keeps the cloud half — and the real getSession() it performs on a machine
// with a filled-in .env.local — out of a local-only case.
vi.mock('../lib/supabase', () => ({
  supabaseConfigured: false,
  getSupabaseClient: () => Promise.resolve(null),
}))

const DEVICE_KEY = 'grovepad:device:v1'
const DEVICE_SAVE_MS = 300

let storage = new Map<string, string>()

function installBrowserGlobals(): void {
  storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
  })
  vi.stubGlobal('window', {
    // Delegated at call time so vi.useFakeTimers, which patches globalThis,
    // still drives the debounced saver through this stub.
    setTimeout: (handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms) as unknown as number,
    clearTimeout: (id: number) => { globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>) },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.stubGlobal('document', {
    body: { hasAttribute: () => false },
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}

/** persistence.ts keeps module-scope state, so every case needs a fresh graph. */
async function bootPersistence() {
  vi.resetModules()
  const { initPersistence } = await import('./persistence')
  const { useWidgetStore } = await import('../store/useWidgetStore')
  const { useCanvasStore } = await import('../store/useCanvasStore')
  return { initPersistence, useWidgetStore, useCanvasStore }
}

function savedTabIds(): string[] {
  const raw = storage.get(DEVICE_KEY)
  if (!raw) return []
  const parsed = JSON.parse(raw) as { openTabs?: { id: string }[] }
  return (parsed.openTabs ?? []).map((tab) => tab.id)
}

let dispose: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  installBrowserGlobals()
})

afterEach(() => {
  dispose?.()
  dispose = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('the device record follows the tab row', () => {
  it('writes a reorder that touched openTabs and nothing else', async () => {
    const mod = await bootPersistence()
    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await vi.advanceTimersByTimeAsync(1)

    // A second tab, reached the ordinary way: opening a nested canvas is a
    // navigation, so it moves activeCanvasId too and is saved either way.
    const nodeId = mod.useWidgetStore.getState().createWidget('Nested', { x: 0, y: 0 }, 'canvas_node')
    const nestedCanvasId = (mod.useWidgetStore.getState().widgets[nodeId]!.data as { canvasId: string }).canvasId
    mod.useWidgetStore.getState().openCanvasTab(nestedCanvasId)
    await vi.advanceTimersByTimeAsync(DEVICE_SAVE_MS + 1)

    const before = savedTabIds()
    expect(before).toHaveLength(2)

    // Dragging the first tab onto the second changes openTabs alone.
    mod.useWidgetStore.getState().reorderCanvasTab(before[0]!, before[1]!)
    const live = mod.useWidgetStore.getState()
    expect(live.openTabs.map((tab) => tab.id)).toEqual([before[1], before[0]])
    expect(live.activeCanvasId).toBe(nestedCanvasId)

    await vi.advanceTimersByTimeAsync(DEVICE_SAVE_MS + 1)

    // Without openTabs in the predicate nothing was ever scheduled, so this
    // still read the pre-drag order and the row snapped back on reload.
    expect(savedTabIds()).toEqual([before[1], before[0]])
  })

  it('writes a background tab closed without changing which canvas is on screen', async () => {
    const mod = await bootPersistence()
    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await vi.advanceTimersByTimeAsync(1)

    const nodeId = mod.useWidgetStore.getState().createWidget('Nested', { x: 0, y: 0 }, 'canvas_node')
    const nestedCanvasId = (mod.useWidgetStore.getState().widgets[nodeId]!.data as { canvasId: string }).canvasId
    mod.useWidgetStore.getState().openCanvasTab(nestedCanvasId)
    await vi.advanceTimersByTimeAsync(DEVICE_SAVE_MS + 1)

    const before = savedTabIds()
    const background = before.find((id) => id !== mod.useWidgetStore.getState().activeTabId)!
    mod.useWidgetStore.getState().closeCanvasTab(background)
    await vi.advanceTimersByTimeAsync(DEVICE_SAVE_MS + 1)

    expect(savedTabIds()).toEqual(before.filter((id) => id !== background))
  })
})
