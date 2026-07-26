/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

// ---------------------------------------------------------------------------
// The store seeds synchronously at module scope and hydrates later from
// IndexedDB. Collaboration session start must wait for that hydration:
// started against the pre-hydration board, the bridge diffs a live shared doc
// against seed/stale content and PUBLISHES deletions of collaborators' work —
// and the shared-flag gate read pre-hydration makes a shared canvas whose id
// survives from the seed silently never connect at all.
//
// This suite drives the real collaboration runtime, real store bridge and
// real Y.Docs; only the I/O edges (IndexedDB, Supabase) are mocked, with the
// board read held open by a deferred so each case controls who wins the race.
// ---------------------------------------------------------------------------

interface Deferred {
  promise: Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const control = vi.hoisted(() => {
  const deferred = (): { promise: Promise<unknown>; resolve: (v: unknown) => void; reject: (r: unknown) => void } => {
    let resolve!: (v: unknown) => void
    let reject!: (r: unknown) => void
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }
  return {
    deferred,
    disk: { read: null as ReturnType<typeof deferred> | null },
    remote: { bootstrap: null as unknown },
    captured: { updates: [] as Uint8Array[] },
  }
})

vi.mock('../utils/boardDatabase', () => ({
  readBoardDatabase: vi.fn(() => control.disk.read!.promise),
  writeBoardDatabase: vi.fn(() => Promise.resolve()),
  writeMigratedBoardDatabase: vi.fn(() => Promise.resolve()),
  saveRollingSnapshot: vi.fn(() => Promise.resolve()),
  listRollingSnapshots: vi.fn(() => Promise.resolve([])),
  writeMediaBlob: vi.fn(() => Promise.resolve()),
  readMediaBlob: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: false,
  getSupabaseClient: () => Promise.resolve({
    realtime: { setAuth: async () => {} },
    removeChannel: async () => {},
  }),
}))

vi.mock('../collaboration/supabaseCollaboration', () => {
  const channelStub = () => ({
    on() { return this },
    subscribe() { return this },
    unsubscribe: async () => 'ok',
    send: async () => 'ok',
    track: async () => 'ok',
    untrack: async () => 'ok',
    presenceState: () => ({}),
  })
  return {
    SupabaseCollaborationRepository: class {
      bootstrap() { return Promise.resolve(control.remote.bootstrap) }
      channel() { return channelStub() }
      awarenessChannel() { return channelStub() }
      fetchUpdates() { return Promise.resolve([]) }
      persistUpdates() { return Promise.resolve() }
      compact() { return Promise.resolve() }
      listComments() { return Promise.resolve([]) }
      getCanvasMetadata() { return Promise.resolve({}) }
    },
  }
})

vi.mock('../collaboration/offlineUpdateQueue', () => ({
  // The wire tap: every local-origin Y update the session would publish passes
  // through here regardless of channel connectivity.
  enqueuePendingUpdate: vi.fn((_canvasId: string, update: Uint8Array) => {
    control.captured.updates.push(update)
    return Promise.resolve()
  }),
  listPendingUpdates: vi.fn(() => Promise.resolve([])),
  removePendingUpdates: vi.fn(() => Promise.resolve()),
  writeCachedCollaborationDocument: vi.fn(() => Promise.resolve()),
  readCachedCollaborationDocument: vi.fn(() => Promise.resolve(null)),
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
    location: { href: 'https://grovepad.test/' },
    setTimeout: (handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms) as unknown as number,
    clearTimeout: (id: number) => { globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>) },
    setInterval: (handler: () => void, ms?: number) => globalThis.setInterval(handler, ms) as unknown as number,
    clearInterval: (id: number) => { globalThis.clearInterval(id as unknown as ReturnType<typeof setInterval>) },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.stubGlobal('document', {
    body: { hasAttribute: () => false },
    documentElement: { addEventListener: () => {}, removeEventListener: () => {} },
    visibilityState: 'visible',
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.stubGlobal('navigator', { onLine: true })
}

/** Let every pending microtask and zero-delay timer run. */
async function drain(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => { globalThis.setTimeout(resolve, 0) })
  }
}

const REMOTE_WIDGET_ID = 'remote-widget-1'

let disposeAll: (() => void)[] = []

beforeEach(() => {
  installBrowserGlobals()
  control.disk.read = control.deferred() as Deferred
  control.captured.updates = []
})

afterEach(async () => {
  for (const dispose of disposeAll.reverse()) dispose()
  disposeAll = []
  await drain(4)
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/**
 * Boot the real persistence + collaboration runtime in appRuntime's order,
 * with a signed-in session and the board read held open by the deferred.
 * `preShared` marks the live canvas shared BEFORE the runtime initializes —
 * the state a rejoin boot is in, and the only state in which an unguarded
 * runtime starts a session against the pre-hydration board.
 */
async function boot({ preShared = false } = {}) {
  vi.resetModules()
  const { useWidgetStore } = await import('../store/useWidgetStore')
  const { useCanvasStore } = await import('../store/useCanvasStore')
  const { useAuthStore } = await import('../store/useAuthStore')
  const persistence = await import('../utils/persistence')
  const yjsCanvas = await import('../collaboration/yjsCanvas')

  useAuthStore.setState({
    session: { access_token: 'token', user: { id: 'user-1', email: 'u@example.com', user_metadata: {} } },
  } as never)

  const canvasId = useWidgetStore.getState().activeCanvasId
  const canvasName = useWidgetStore.getState().canvases[canvasId]!.name
  if (preShared) {
    const preState = useWidgetStore.getState()
    useWidgetStore.setState({
      canvases: { ...preState.canvases, [canvasId]: { ...preState.canvases[canvasId]!, shared: true } },
    } as never)
  }

  // The remote doc every peer shares: one widget the collaborators created.
  const remoteDoc = new Y.Doc()
  yjsCanvas.writeCanvasSnapshot(remoteDoc, yjsCanvas.snapshotCanvas({
    widgets: {
      [REMOTE_WIDGET_ID]: {
        ...Object.values(useWidgetStore.getState().widgets)[0]!,
        id: REMOTE_WIDGET_ID,
        canvasId,
        title: 'Made by a collaborator',
      },
    },
    relations: {}, connections: {}, glues: {},
    canvases: { [canvasId]: { id: canvasId, name: canvasName } },
  }, canvasId))
  const remoteSnapshot = Y.encodeStateAsUpdate(remoteDoc)
  control.remote.bootstrap = {
    role: 'owner',
    snapshot: remoteSnapshot,
    lastSequence: 0,
    updates: [],
  }

  disposeAll.push(persistence.initPersistence(useWidgetStore, useCanvasStore))
  const { initCollaborationRuntime } = await import('./collaborationRuntime')
  disposeAll.push(initCollaborationRuntime())

  return { useWidgetStore, persistence, yjsCanvas, canvasId, remoteSnapshot }
}

describe('collaboration session start waits for local hydration', () => {
  it('does not publish deletions when hydration loses the boot race (corridor A)', async () => {
    const { useWidgetStore, persistence, yjsCanvas, canvasId, remoteSnapshot } = await boot({ preShared: true })

    // Give the network bootstrap time to win while the disk read is pending —
    // on unguarded code the session is now live against the pre-hydration board.
    await drain()

    // Now the stale persisted board arrives: shared canvas, WITHOUT the
    // remote widget (it predates the collaborator's work).
    const staleState = useWidgetStore.getState()
    const persisted = persistence.buildBoardSnapshot({
      ...staleState,
      widgets: Object.fromEntries(
        Object.entries(staleState.widgets).filter(([id]) => id !== REMOTE_WIDGET_ID),
      ),
    } as never)
    control.disk.read!.resolve(persisted)
    await drain()

    // Every update the session published, replayed onto a peer that already
    // held the collaborators' doc: their widget must survive.
    const peer = new Y.Doc()
    Y.applyUpdate(peer, remoteSnapshot)
    for (const update of control.captured.updates) Y.applyUpdate(peer, update)
    const peerWidgets = yjsCanvas.readCanvasSnapshot(peer, canvasId).widgets
    expect(Object.keys(peerWidgets)).toContain(REMOTE_WIDGET_ID)

    // And this client ends holding the collaborators' widget too.
    expect(REMOTE_WIDGET_ID in useWidgetStore.getState().widgets).toBe(true)
  })

  it('connects a canvas whose shared flag only exists in the persisted board (corridor C)', async () => {
    // The discriminator: pre-hydration the seed store says "not shared", and
    // hydration does not change activeCanvasId — so a gate read too early
    // refuses, and nothing ever re-fires. An await placed inside
    // startCanvasSession instead of before the gate fails this case too.
    const { useWidgetStore, persistence, canvasId } = await boot()
    await drain()

    const state = useWidgetStore.getState()
    const persisted = persistence.buildBoardSnapshot({
      ...state,
      canvases: { ...state.canvases, [canvasId]: { ...state.canvases[canvasId]!, shared: true } },
      widgets: Object.fromEntries(
        Object.entries(state.widgets).filter(([id]) => id !== REMOTE_WIDGET_ID),
      ),
    } as never)
    control.disk.read!.resolve(persisted)
    await drain()

    // The session must have started after hydration and adopted the doc.
    expect(REMOTE_WIDGET_ID in useWidgetStore.getState().widgets).toBe(true)
  })

  it('still starts the session when the board read fails (corridor B)', async () => {
    // The seam must settle on failure too — an over-fix that only resolves on
    // a successful read would wedge collaboration for exactly the users whose
    // local disk is broken, the ones who need the durable shared copy most.
    const { useWidgetStore } = await boot({ preShared: true })
    control.disk.read!.reject(new DOMException('Failed to read', 'UnknownError'))
    await drain()

    expect(REMOTE_WIDGET_ID in useWidgetStore.getState().widgets).toBe(true)
  })
})

describe('the hydration seam itself', () => {
  it('is pending while the read is pending, settled after, and settled on failure', async () => {
    vi.resetModules()
    const { useWidgetStore } = await import('../store/useWidgetStore')
    const { useCanvasStore } = await import('../store/useCanvasStore')
    const persistence = await import('../utils/persistence')

    // Default-resolved before persistence starts, so unit tests and guest
    // shells that never initialize persistence are not wedged.
    let settled = false
    void persistence.whenLocalBoardHydrated().then(() => { settled = true })
    await drain(2)
    expect(settled).toBe(true)

    disposeAll.push(persistence.initPersistence(useWidgetStore, useCanvasStore))
    settled = false
    void persistence.whenLocalBoardHydrated().then(() => { settled = true })
    await drain(2)
    expect(settled).toBe(false)

    control.disk.read!.reject(new Error('read failed'))
    await drain(2)
    expect(settled).toBe(true)
  })
})

describe('the runtime order the seam depends on', () => {
  it('starts persistence before collaboration in the app runtime', () => {
    // The seam is default-resolved until initPersistence arms it; starting
    // collaboration first silently disarms the entire protection.
    const source = readFileSync(new URL('./appRuntime.ts', import.meta.url), 'utf8')
    const services = source.slice(source.indexOf('const appRuntime = createRuntimeBoundary'))
    const persistenceAt = services.indexOf('initPersistence(')
    const collaborationAt = services.indexOf('initSignedInCollaboration(')
    expect(persistenceAt).toBeGreaterThanOrEqual(0)
    expect(collaborationAt).toBeGreaterThanOrEqual(0)
    expect(persistenceAt).toBeLessThan(collaborationAt)
  })
})
