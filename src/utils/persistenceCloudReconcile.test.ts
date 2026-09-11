import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// What the reconcile does with the network, and how little of it it uses.
//
// The bug these lock down: a board edited on one device used to be
// indistinguishable from a board edited on two, so every ordinary session
// ended in "which copy do you want to keep?". With a baseline recording what
// the two sides last agreed on, the ordinary case is a plain upload, and the
// unchanged case does not transfer a board at all.
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

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  getSupabaseClient: () => Promise.resolve(null),
}))

vi.mock('./cloudSync', () => ({
  fetchCloudHead: vi.fn(),
  fetchCloudBoard: vi.fn(),
  pushCloudBoard: vi.fn(() => Promise.resolve()),
}))

vi.mock('./syncBaseline', async (importOriginal) => ({
  // fingerprintBoard stays real: the whole design rests on local hashes
  // matching the checksums the cloud already stores.
  ...(await importOriginal<typeof import('./syncBaseline')>()),
  readSyncBaseline: vi.fn(() => Promise.resolve(null)),
  writeSyncBaseline: vi.fn(() => Promise.resolve()),
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
  const cloudSync = await import('./cloudSync')
  const syncBaseline = await import('./syncBaseline')
  const { buildBoardSnapshot, initPersistence } = await import('./persistence')
  const { useWidgetStore } = await import('../store/useWidgetStore')
  const { useCanvasStore } = await import('../store/useCanvasStore')
  const { usePersistenceStatusStore } = await import('../store/usePersistenceStatusStore')
  const { useAuthStore } = await import('../store/useAuthStore')

  useAuthStore.setState({ session: { user: { id: 'user-1', user_metadata: {} } } } as never)
  usePersistenceStatusStore.setState({ syncEnabled: true } as never)

  const local = buildBoardSnapshot(useWidgetStore.getState())
  const print = await syncBaseline.fingerprintBoard(local)
  return {
    cloudSync, syncBaseline, initPersistence, local, print,
    useWidgetStore, useCanvasStore, usePersistenceStatusStore,
  }
}

let dispose: (() => void) | null = null

beforeEach(() => {
  installBrowserGlobals()
})

afterEach(() => {
  dispose?.()
  dispose = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** Waited for rather than clocked: the reconcile awaits storage, real
 * crypto.subtle hashing, a dynamic import and up to two round trips. */
const until = (assertion: () => void) => vi.waitFor(assertion)

describe('the cheap check', () => {
  it('transfers no board at all when neither side moved', async () => {
    const mod = await bootSignedIn()
    vi.mocked(mod.syncBaseline.readSyncBaseline).mockResolvedValue({
      userId: 'user-1', board: mod.local, ...mod.print, cloudUpdatedAt: null, at: 1,
    })
    vi.mocked(mod.cloudSync.fetchCloudHead).mockResolvedValue({
      indexChecksum: mod.print.indexChecksum,
      canvasChecksums: new Map(Object.entries(mod.print.canvasChecksums)),
      updatedAt: null,
    })

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await until(() => {
      expect(mod.usePersistenceStatusStore.getState().cloudSync).toBe('synced')
    })

    expect(mod.cloudSync.fetchCloudBoard).not.toHaveBeenCalled()
    expect(mod.cloudSync.pushCloudBoard).not.toHaveBeenCalled()
  })

  it('uploads without fetching when only this device moved', async () => {
    const mod = await bootSignedIn()
    // The baseline is a board this device has since moved past.
    vi.mocked(mod.syncBaseline.readSyncBaseline).mockResolvedValue({
      userId: 'user-1',
      board: mod.local,
      indexChecksum: 'stale-index',
      canvasChecksums: { stale: 'stale-canvas' },
      cloudUpdatedAt: null,
      at: 1,
    })
    // The cloud still stands exactly where the baseline left it.
    vi.mocked(mod.cloudSync.fetchCloudHead).mockResolvedValue({
      indexChecksum: 'stale-index',
      canvasChecksums: new Map([['stale', 'stale-canvas']]),
      updatedAt: null,
    })

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await until(() => {
      expect(mod.cloudSync.pushCloudBoard).toHaveBeenCalledTimes(1)
    })

    // The case that used to raise the prompt: no board came down to compare.
    expect(mod.cloudSync.fetchCloudBoard).not.toHaveBeenCalled()
    expect(mod.usePersistenceStatusStore.getState().cloudSync).toBe('synced')
  })

  it('seeds an account that has no cloud board yet', async () => {
    const mod = await bootSignedIn()
    vi.mocked(mod.cloudSync.fetchCloudHead).mockResolvedValue(null)

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await until(() => {
      expect(mod.cloudSync.pushCloudBoard).toHaveBeenCalledTimes(1)
    })

    expect(mod.cloudSync.fetchCloudBoard).not.toHaveBeenCalled()
  })
})

describe('the full path', () => {
  it('fetches the board only once the cloud has actually moved', async () => {
    const mod = await bootSignedIn()
    vi.mocked(mod.syncBaseline.readSyncBaseline).mockResolvedValue({
      userId: 'user-1', board: mod.local, ...mod.print, cloudUpdatedAt: null, at: 1,
    })
    vi.mocked(mod.cloudSync.fetchCloudHead).mockResolvedValue({
      indexChecksum: 'somebody-else-wrote',
      canvasChecksums: new Map([['canvas', 'moved']]),
      updatedAt: '2026-08-21T00:00:00.000Z',
    })
    vi.mocked(mod.cloudSync.fetchCloudBoard).mockResolvedValue({
      board: { ...mod.local, activeWorkspaceId: 'w', activeCanvasId: 'c', canvasViews: {} } as never,
      updatedAt: '2026-08-21T00:00:00.000Z',
      source: 'documents',
    })

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await until(() => {
      expect(mod.cloudSync.fetchCloudBoard).toHaveBeenCalledTimes(1)
    })
  })

  it('does not adopt the cloud board over an edit made while it was in flight', async () => {
    // The snapshot reconcile compares against is taken BEFORE the round trip.
    // Typing during the fetch used to be overwritten by the adopted cloud
    // board — un-undoably, since loadBoard clears history — and the debounced
    // local save then wrote the replacement over it on disk.
    const mod = await bootSignedIn()
    vi.mocked(mod.syncBaseline.readSyncBaseline).mockResolvedValue({
      userId: 'user-1', board: mod.local, ...mod.print, cloudUpdatedAt: null, at: 1,
    })
    vi.mocked(mod.cloudSync.fetchCloudHead).mockResolvedValue({
      indexChecksum: 'somebody-else-wrote',
      canvasChecksums: new Map([['canvas', 'moved']]),
      updatedAt: '2026-08-21T00:00:00.000Z',
    })
    let typedId = ''
    vi.mocked(mod.cloudSync.fetchCloudBoard).mockImplementation(async () => {
      // The user types while the board is still crossing the network.
      typedId = mod.useWidgetStore.getState().createWidget('Buy milk', { x: 0, y: 0 }, 'text')
      return {
        board: { ...mod.local, activeWorkspaceId: 'w', activeCanvasId: 'c', canvasViews: {} },
        updatedAt: '2026-08-21T00:00:00.000Z',
        source: 'documents',
      } as never
    })

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await until(() => {
      expect(mod.cloudSync.fetchCloudBoard).toHaveBeenCalledTimes(1)
    })
    // One macrotask past the fetch: the adopt branch ran synchronously off the
    // resolved promise, so by here the widget would already be gone.
    await new Promise((resolve) => { globalThis.setTimeout(resolve, 0) })

    expect(typedId).toBeTruthy()
    expect(mod.useWidgetStore.getState().widgets[typedId]).toBeDefined()
  })

  it('falls back to a full fetch when the cheap answer cannot be trusted', async () => {
    const mod = await bootSignedIn()
    vi.mocked(mod.cloudSync.fetchCloudHead).mockResolvedValue('inconclusive')
    vi.mocked(mod.cloudSync.fetchCloudBoard).mockResolvedValue(null)

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await until(() => {
      expect(mod.cloudSync.fetchCloudBoard).toHaveBeenCalledTimes(1)
      expect(mod.cloudSync.pushCloudBoard).toHaveBeenCalledTimes(1)
    })
  })
})

describe('protection that must survive the rewrite', () => {
  it('still refuses to sync when the local record could not be read', async () => {
    const mod = await bootSignedIn()
    const boardDatabase = await import('./boardDatabase')
    vi.mocked(boardDatabase.readBoardDatabase).mockRejectedValue(new Error('unreadable'))

    dispose = mod.initPersistence(mod.useWidgetStore, mod.useCanvasStore)
    await until(() => {
      expect(mod.usePersistenceStatusStore.getState().cloudSync).toBe('error')
    })

    expect(mod.cloudSync.fetchCloudHead).not.toHaveBeenCalled()
    expect(mod.cloudSync.pushCloudBoard).not.toHaveBeenCalled()
  })
})
