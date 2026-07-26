import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// The cloud half of the same rule. Blocking local writes is not enough on its
// own: reconcile() only awaits localReady, which RESOLVES through the read's
// catch, so a failed startup read would otherwise let the seeded starter board
// be pushed to the cloud — and pushCloudBoard DELETES remote canvas rows that
// are absent from what it is handed, so that destroys more than the local
// overwrite would.
//
// supabaseConfigured has to be true here, which is why this cannot live in
// persistenceStartupFailure.test.ts (that file forces it false).
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

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  getSupabaseClient: () => Promise.resolve(null),
}))

vi.mock('./cloudSync', () => ({
  fetchCloudBoard: vi.fn(() => Promise.resolve(null)),
  pushCloudBoard: vi.fn(() => Promise.resolve()),
}))

function installBrowserGlobals(): void {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
  })
  vi.stubGlobal('window', {
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

async function bootSignedIn() {
  vi.resetModules()
  const boardDatabase = await import('./boardDatabase')
  const cloudSync = await import('./cloudSync')
  const { initPersistence } = await import('./persistence')
  const { useWidgetStore } = await import('../store/useWidgetStore')
  const { useCanvasStore } = await import('../store/useCanvasStore')
  const { usePersistenceStatusStore } = await import('../store/usePersistenceStatusStore')
  const { useAuthStore } = await import('../store/useAuthStore')

  useAuthStore.setState({ session: { user: { id: 'user-1', user_metadata: {} } } } as never)
  usePersistenceStatusStore.setState({ syncEnabled: true } as never)

  return { boardDatabase, cloudSync, initPersistence, useWidgetStore, useCanvasStore, usePersistenceStatusStore }
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

describe('a startup read failure also keeps the seeded board out of the cloud', () => {
  it('never pushes after the read rejects', async () => {
    const mod = await bootSignedIn()
    vi.mocked(mod.boardDatabase.readBoardDatabase).mockRejectedValue(
      new DOMException('Failed to read large IndexedDB value', 'UnknownError'),
    )

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await vi.advanceTimersByTimeAsync(50)

    expect(mod.cloudSync.pushCloudBoard).not.toHaveBeenCalled()
    expect(mod.usePersistenceStatusStore.getState().cloudSync).toBe('error')
  })

  it('still reconciles normally when the read succeeds', async () => {
    // The control: without it, "never reconcile" would pass the case above.
    const mod = await bootSignedIn()
    vi.mocked(mod.boardDatabase.readBoardDatabase).mockResolvedValue(null)

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await vi.advanceTimersByTimeAsync(50)

    // No cloud row yet, so the seeded board is pushed up as the account's first.
    expect(mod.cloudSync.pushCloudBoard).toHaveBeenCalled()
  })
})
