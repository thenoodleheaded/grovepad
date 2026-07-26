import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Startup read failure must never let the seeded board reach durable storage.
//
// useWidgetStore seeds a starter board at module scope, so between app start
// and a successful read the store is ALWAYS holding demo content. If the read
// fails and nothing notices, the first edit schedules a save that writes that
// starter board over the user's real record — and the chip says "Saved".
//
// The board database is the I/O seam, mocked so the read can reject on demand
// and every write is observable. fake-indexeddb cannot fail a read to order.
// ---------------------------------------------------------------------------

vi.mock('./boardDatabase', () => ({
  readBoardDatabase: vi.fn(),
  writeBoardDatabase: vi.fn(() => Promise.resolve()),
  writeMigratedBoardDatabase: vi.fn(() => Promise.resolve()),
  saveRollingSnapshot: vi.fn(() => Promise.resolve()),
  listRollingSnapshots: vi.fn(() => Promise.resolve([])),
  writeMediaBlob: vi.fn(() => Promise.resolve()),
  readMediaBlob: vi.fn(() => Promise.resolve(null)),
}))

// Not cosmetic: useAuthStore calls ensureAuthInitialized() at module scope when
// this is true, which performs a real network getSession() on any machine with
// a filled-in .env.local. Forcing it off also keeps the cloud branch out of
// these local-only cases — the cloud half has its own describe below.
vi.mock('../lib/supabase', () => ({
  supabaseConfigured: false,
  getSupabaseClient: () => Promise.resolve(null),
}))

const BOARD_SAVE_MS = 600

function installBrowserGlobals(): void {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
  })
  vi.stubGlobal('window', {
    // Delegate at call time: vi.useFakeTimers patches globalThis, not this
    // stub, so the debounced saver has to reach the patched functions through
    // it. requestIdleCallback is deliberately absent so the saver takes its
    // window.setTimeout fallback, which fake timers drive exactly.
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
  const boardDatabase = await import('./boardDatabase')
  const { initPersistence } = await import('./persistence')
  const { useWidgetStore } = await import('../store/useWidgetStore')
  const { useCanvasStore } = await import('../store/useCanvasStore')
  const { usePersistenceStatusStore } = await import('../store/usePersistenceStatusStore')
  const { useToastStore } = await import('../store/useToastStore')
  return { boardDatabase, initPersistence, useWidgetStore, useCanvasStore, usePersistenceStatusStore, useToastStore }
}

/** An edit the store can make in node — no layout settling, no text measurement. */
function touchSomeWidget(useWidgetStore: { getState: () => never }): void {
  const state = useWidgetStore.getState() as unknown as {
    widgets: Record<string, unknown>
    updateWidgetMetadata: (id: string, metadata: { pinned: boolean }) => void
  }
  const id = Object.keys(state.widgets)[0]
  expect(id, 'the seeded starter board should not be empty').toBeTruthy()
  state.updateWidgetMetadata(id!, { pinned: true })
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

describe('a startup read failure pauses saving instead of overwriting the record', () => {
  // The production rejection is a DOMException (boardDatabase rejects with
  // request.error), so a fix that discriminates on error type has to fail here
  // rather than shipping green against a plain Error.
  for (const [label, rejection] of [
    ['a plain Error', new Error('IndexedDB unavailable')],
    ['a DOMException', new DOMException('Failed to read large IndexedDB value', 'UnknownError')],
  ] as const) {
    it(`writes nothing after the read rejects with ${label}`, async () => {
      const mod = await bootPersistence()
      vi.mocked(mod.boardDatabase.readBoardDatabase).mockRejectedValue(rejection)

      dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
      await vi.advanceTimersByTimeAsync(1)
      touchSomeWidget(mod.useWidgetStore as never)
      await vi.advanceTimersByTimeAsync(BOARD_SAVE_MS + 1)

      // The whole point: the starter board must not reach disk.
      expect(mod.boardDatabase.writeBoardDatabase).not.toHaveBeenCalled()
      expect(mod.boardDatabase.writeMigratedBoardDatabase).not.toHaveBeenCalled()
      expect(mod.boardDatabase.saveRollingSnapshot).not.toHaveBeenCalled()

      const status = mod.usePersistenceStatusStore.getState()
      expect(status.localSave).toBe('error')
      // Raising the compatibility block would replace the entire app with the
      // "needs a newer Grovepad" screen, which is a different failure.
      expect(status.compatibilityBlock).toBeNull()

      const messages = mod.useToastStore.getState().toasts.map((toast) => toast.message)
      expect(messages.some((message) => /could not be opened/i.test(message))).toBe(true)
      // The store is holding the STARTER board here, so telling the user to
      // export a backup would capture seed widgets, not their data.
      expect(messages.some((message) => /export a backup/i.test(message))).toBe(false)
    })
  }

  it('still warns on close, because nothing from this session reached disk', async () => {
    const mod = await bootPersistence()
    vi.mocked(mod.boardDatabase.readBoardDatabase).mockRejectedValue(new Error('read failed'))
    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await vi.advanceTimersByTimeAsync(1)

    expect(mod.usePersistenceStatusStore.getState().localSave).toBe('error')
  })

  it('does not pause saving when the read succeeded and proved the record absent', async () => {
    // A transient failure of the initial SEED write is an ordinary write
    // failure: the read worked, there is provably nothing on disk to protect,
    // and the debounced saver retries. Blocking here would lose the session.
    const mod = await bootPersistence()
    vi.mocked(mod.boardDatabase.readBoardDatabase).mockResolvedValue(null)
    vi.mocked(mod.boardDatabase.writeBoardDatabase)
      .mockRejectedValueOnce(new Error('transient abort'))
      .mockResolvedValue(undefined)

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await vi.advanceTimersByTimeAsync(1)
    touchSomeWidget(mod.useWidgetStore as never)
    await vi.advanceTimersByTimeAsync(BOARD_SAVE_MS + 1)

    // Seed attempt plus the retry driven by the edit.
    expect(vi.mocked(mod.boardDatabase.writeBoardDatabase).mock.calls.length).toBeGreaterThan(1)
  })

  it('pauses saving when hydration throws, not just when the read rejects', async () => {
    // loadBoard runs inside the same `.then`, so a throw there lands in the
    // same catch. The record is intact and unread — it must not be written.
    const mod = await bootPersistence()
    const seeded = mod.useWidgetStore.getState()
    vi.mocked(mod.boardDatabase.readBoardDatabase).mockResolvedValue(
      (await import('./persistedBoardSchema')).serializePersistedBoard(seeded as never),
    )
    mod.useWidgetStore.setState({
      loadBoard: () => { throw new Error('hydration failed') },
    } as never)

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await vi.advanceTimersByTimeAsync(1)
    touchSomeWidget(mod.useWidgetStore as never)
    await vi.advanceTimersByTimeAsync(BOARD_SAVE_MS + 1)

    expect(mod.boardDatabase.writeBoardDatabase).not.toHaveBeenCalled()
    expect(mod.usePersistenceStatusStore.getState().localSave).toBe('error')
  })

  it('saves normally for a returning user whose board reads back', async () => {
    // The control. Without it, "block everything" would pass every case above.
    const mod = await bootPersistence()
    const seeded = mod.useWidgetStore.getState()
    vi.mocked(mod.boardDatabase.readBoardDatabase).mockResolvedValue(
      (await import('./persistedBoardSchema')).serializePersistedBoard(seeded as never),
    )

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await vi.advanceTimersByTimeAsync(1)
    // Hydrating an existing board must not trigger a seed write.
    expect(mod.boardDatabase.writeBoardDatabase).not.toHaveBeenCalled()

    touchSomeWidget(mod.useWidgetStore as never)
    await vi.advanceTimersByTimeAsync(BOARD_SAVE_MS + 1)

    expect(mod.boardDatabase.writeBoardDatabase).toHaveBeenCalledTimes(1)
    expect(mod.usePersistenceStatusStore.getState().localSave).toBe('saved')
  })
})
