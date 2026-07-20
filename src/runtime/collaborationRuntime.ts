import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { base64ToBytes, bytesToBase64 } from '../collaboration/binaryEncoding'
import { registerCollaborationController } from '../collaboration/collaborationController'
import { createCanvasStoreBridge, type CanvasStoreBridge } from '../collaboration/canvasStoreBridge'
import {
  enqueuePendingUpdate,
  listPendingUpdates,
  readCachedCollaborationDocument,
  removePendingUpdates,
  writeCachedCollaborationDocument,
} from '../collaboration/offlineUpdateQueue'
import { installCollaborationPermissionGuards } from '../collaboration/permissionGuards'
import { SupabaseCollaborationRepository } from '../collaboration/supabaseCollaboration'
import type { CollaborationPresence, CollaborationRole } from '../collaboration/types'
import { REMOTE_TRANSPORT_ORIGIN, writeCanvasSnapshot } from '../collaboration/yjsCanvas'
import { getSupabaseClient } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'
import { useCanvasStore } from '../store/useCanvasStore'
import {
  INITIAL_COLLABORATION_STATE,
  canCommentOnCollaborativeCanvas,
  canEditCollaborativeCanvas,
  useCollaborationStore,
} from '../store/useCollaborationStore'
import { useWidgetStore } from '../store/useWidgetStore'

const UPDATE_EVENT = 'y-update'
const PRESENCE_ORIGIN = Symbol('supabase-presence')
const COMPACT_UPDATE_COUNT = 200
const COMPACT_BYTE_COUNT = 512 * 1024
const MAX_WIRE_UPDATE_BYTES = 8 * 1024 * 1024
const DURABLE_BATCH_BYTES = 4 * 1024 * 1024
const DURABLE_BATCH_ROWS = 50

interface LocalPresenceState {
  userId: string
  name: string
  color: string
  role: CollaborationRole
  cursor: { x: number; y: number } | null
  selectedWidgetIds: string[]
  editingWidgetId: string | null
  camera: { pan: { x: number; y: number }; zoom: number } | null
  lastSeenAt: number
}

interface ActiveCollaboration {
  canvasId: string
  role: CollaborationRole
  bridge: CanvasStoreBridge
  awareness: Awareness
  repository: SupabaseCollaborationRepository
  channel: RealtimeChannel
  connected: boolean
  lastSequence: number
  updatesSinceCompaction: number
  bytesSinceCompaction: number
  flushPromise: Promise<void> | null
  flushAgain: boolean
  compactionPromise: Promise<void> | null
  /** Update ids already sent over the hot broadcast path, so the durable
   *  flush does not send the same payload a second time. Ids queued while
   *  disconnected are absent and get their one broadcast at flush. */
  broadcastUpdateIds: Set<string>
  dispose: () => void
  updatePresence: (patch: Partial<LocalPresenceState>) => void
  refreshComments: () => Promise<void>
}

let active: ActiveCollaboration | null = null
let generation = 0

function userColor(userId: string): string {
  const colors = ['#34d399', '#60a5fa', '#a78bfa', '#fb7185', '#fbbf24', '#22d3ee']
  let hash = 0
  for (const character of userId) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  return colors[Math.abs(hash) % colors.length]!
}

function userName(session: Session): string {
  const metadata = session.user.user_metadata
  const named = metadata.full_name ?? metadata.name ?? metadata.user_name
  if (typeof named === 'string' && named.trim()) return named.trim().slice(0, 80)
  return session.user.email?.split('@')[0]?.slice(0, 80) || 'Collaborator'
}

function safePresence(clientId: number, value: unknown): CollaborationPresence | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<LocalPresenceState>
  if (
    typeof state.userId !== 'string' || typeof state.name !== 'string' ||
    typeof state.color !== 'string' ||
    !['owner', 'editor', 'commenter', 'viewer'].includes(state.role ?? '')
  ) return null
  const cursor = state.cursor && Number.isFinite(state.cursor.x) && Number.isFinite(state.cursor.y)
    ? { x: state.cursor.x, y: state.cursor.y }
    : null
  const camera = state.camera && Number.isFinite(state.camera.pan?.x) &&
    Number.isFinite(state.camera.pan?.y) && Number.isFinite(state.camera.zoom)
    ? { pan: { x: state.camera.pan.x, y: state.camera.pan.y }, zoom: state.camera.zoom }
    : null
  return {
    clientId,
    userId: state.userId,
    name: state.name.slice(0, 80),
    color: /^#[\da-f]{6}$/i.test(state.color) ? state.color : '#60a5fa',
    role: state.role as CollaborationRole,
    cursor,
    selectedWidgetIds: Array.isArray(state.selectedWidgetIds)
      ? state.selectedWidgetIds.filter((id): id is string => typeof id === 'string').slice(0, 500)
      : [],
    editingWidgetId: typeof state.editingWidgetId === 'string' ? state.editingWidgetId : null,
    camera,
    lastSeenAt: typeof state.lastSeenAt === 'number' ? state.lastSeenAt : Date.now(),
  }
}

function publishParticipants(session: ActiveCollaboration): void {
  const participants: CollaborationPresence[] = []
  for (const [clientId, value] of session.awareness.getStates()) {
    const parsed = safePresence(clientId, value)
    if (parsed) participants.push(parsed)
  }
  participants.sort((left, right) => left.name.localeCompare(right.name) || left.clientId - right.clientId)
  useCollaborationStore.setState({ participants })
  const followed = participants.find(
    (participant) => participant.clientId === useCollaborationStore.getState().followingClientId,
  )
  if (followed?.camera) useCanvasStore.getState().setView(followed.camera.pan, followed.camera.zoom)
}

async function flushPending(session: ActiveCollaboration): Promise<void> {
  if (session.flushPromise) {
    session.flushAgain = true
    return session.flushPromise
  }
  if (!navigator.onLine || !canEditCollaborativeCanvas(session.role)) return
  const operation = (async () => {
    let persistedAny = false
    while (navigator.onLine) {
      const pending = await listPendingUpdates(session.canvasId)
      if (pending.length === 0) break
      const batch = [] as typeof pending
      let batchBytes = 0
      for (const update of pending) {
        if (
          batch.length > 0 &&
          (batch.length >= DURABLE_BATCH_ROWS || batchBytes + update.payload.byteLength > DURABLE_BATCH_BYTES)
        ) break
        batch.push(update)
        batchBytes += update.payload.byteLength
      }
      await session.repository.persistUpdates(session.canvasId, batch)
      persistedAny = true
      session.updatesSinceCompaction += batch.length
      session.bytesSinceCompaction += batchBytes
      if (session.connected) {
        await Promise.all(batch.map((update) => {
          if (session.broadcastUpdateIds.has(update.id)) return Promise.resolve()
          return session.channel.send({
            type: 'broadcast', event: UPDATE_EVENT,
            payload: { id: update.id, data: bytesToBase64(update.payload) },
          })
        }))
      }
      for (const update of batch) session.broadcastUpdateIds.delete(update.id)
      await removePendingUpdates(batch.map((update) => update.id))
    }
    if (persistedAny) await syncDurableUpdates(session)
  })().finally(() => {
    session.flushPromise = null
    if (session.flushAgain) {
      session.flushAgain = false
      void flushPending(session).then(() => compactIfNeeded(session)).catch(() => {})
    }
  })
  session.flushPromise = operation
  return operation
}

async function syncDurableUpdates(session: ActiveCollaboration): Promise<void> {
  while (true) {
    const updates = await session.repository.fetchUpdates(session.canvasId, session.lastSequence)
    if (updates.length === 0) break
    for (const update of updates) {
      Y.applyUpdate(session.bridge.doc, update.payload, REMOTE_TRANSPORT_ORIGIN)
      session.lastSequence = Math.max(session.lastSequence, update.sequence)
    }
    if (updates.length < 10_000) break
  }
}

async function compactIfNeeded(session: ActiveCollaboration): Promise<void> {
  if (
    session.updatesSinceCompaction < COMPACT_UPDATE_COUNT &&
    session.bytesSinceCompaction < COMPACT_BYTE_COUNT
  ) return
  if (session.compactionPromise) return session.compactionPromise
  const operation = (async () => {
    await syncDurableUpdates(session)
    if (session.lastSequence === 0) return
    await session.repository.compact(
      session.canvasId,
      Y.encodeStateAsUpdate(session.bridge.doc),
      session.lastSequence,
    )
    session.updatesSinceCompaction = 0
    session.bytesSinceCompaction = 0
  })().finally(() => {
    session.compactionPromise = null
  })
  session.compactionPromise = operation
  return operation
}

function scheduleLocalUpdate(session: ActiveCollaboration, update: Uint8Array): void {
  if (!canEditCollaborativeCanvas(session.role) || update.byteLength > MAX_WIRE_UPDATE_BYTES) return
  const updateId = crypto.randomUUID()
  if (session.connected) {
    // Ids normally drain at flush; a queue merge can strand a few. Duplicate
    // broadcasts are harmless, so an occasional reset is the safe bound.
    if (session.broadcastUpdateIds.size > 1024) session.broadcastUpdateIds.clear()
    session.broadcastUpdateIds.add(updateId)
    void session.channel.send({
      type: 'broadcast', event: UPDATE_EVENT,
      payload: { id: updateId, data: bytesToBase64(update) },
    })
  }
  void enqueuePendingUpdate(session.canvasId, update, updateId)
    .then(() => flushPending(session))
    .then(() => compactIfNeeded(session))
    .catch((error: unknown) => {
      useCollaborationStore.setState({
        status: navigator.onLine ? 'error' : 'offline',
        error: error instanceof Error ? error.message : String(error),
      })
    })
}

function installPointerPresence(session: ActiveCollaboration): () => void {
  let frame = 0
  let lastEvent: PointerEvent | null = null
  const publish = () => {
    frame = 0
    const event = lastEvent
    const viewport = document.querySelector<HTMLElement>('[data-canvas-viewport]')
    if (!event || !viewport) return
    const rect = viewport.getBoundingClientRect()
    const camera = useCanvasStore.getState()
    session.updatePresence({
      cursor: {
        x: (event.clientX - rect.left - camera.pan.x) / camera.zoom,
        y: (event.clientY - rect.top - camera.pan.y) / camera.zoom,
      },
    })
  }
  const onPointerMove = (event: PointerEvent) => {
    lastEvent = event
    if (!frame) frame = requestAnimationFrame(publish)
  }
  const onPointerLeave = () => session.updatePresence({ cursor: null })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  return () => {
    window.removeEventListener('pointermove', onPointerMove)
    document.documentElement.removeEventListener('pointerleave', onPointerLeave)
    if (frame) cancelAnimationFrame(frame)
  }
}

async function startCanvasSession(session: Session, canvasId: string, expectedGeneration: number): Promise<void> {
  useCollaborationStore.setState({
    ...INITIAL_COLLABORATION_STATE, status: navigator.onLine ? 'connecting' : 'offline', canvasId,
  })
  const client = await getSupabaseClient()
  if (!client || expectedGeneration !== generation) return
  await client.realtime.setAuth(session.access_token)
  const repository = new SupabaseCollaborationRepository(client)
  const canvasName = useWidgetStore.getState().canvases[canvasId]?.name ?? 'Shared canvas'
  const cachedDocument = await readCachedCollaborationDocument(canvasId).catch(() => null)
  let bootstrap
  try {
    bootstrap = await repository.bootstrap(canvasId, canvasName)
  } catch (error) {
    if (navigator.onLine || !cachedDocument) throw error
    bootstrap = {
      role: cachedDocument.role,
      snapshot: cachedDocument.snapshot,
      lastSequence: cachedDocument.lastSequence,
      updates: [],
    }
  }
  if (expectedGeneration !== generation) return

  let currentSession: ActiveCollaboration
  const bridge = createCanvasStoreBridge({
    canvasId,
    onLocalUpdate: (update) => scheduleLocalUpdate(currentSession, update),
    onError: (error) => useCollaborationStore.setState({ status: 'error', error: error.message }),
  })
  if (cachedDocument) Y.applyUpdate(bridge.doc, cachedDocument.snapshot, REMOTE_TRANSPORT_ORIGIN)
  if (bootstrap.snapshot) Y.applyUpdate(bridge.doc, bootstrap.snapshot, REMOTE_TRANSPORT_ORIGIN)
  for (const update of bootstrap.updates) Y.applyUpdate(bridge.doc, update.payload, REMOTE_TRANSPORT_ORIGIN)
  const hasRemoteState = Boolean(cachedDocument) || Boolean(bootstrap.snapshot) || bootstrap.updates.length > 0
  if (hasRemoteState) bridge.applyDocumentToStore()

  const awareness = new Awareness(bridge.doc)
  const channel = repository.channel(canvasId, session.user.id)
  const disposers: Array<() => void> = []
  let presenceTimer = 0
  const updatePresence = (patch: Partial<LocalPresenceState>) => {
    const previous = awareness.getLocalState() as LocalPresenceState | null
    if (!previous) return
    awareness.setLocalState({ ...previous, ...patch, lastSeenAt: Date.now() })
  }
  const refreshComments = async () => {
    const comments = await repository.listComments(canvasId)
    if (active === currentSession) useCollaborationStore.setState({ comments })
  }
  currentSession = {
    canvasId, role: bootstrap.role, bridge, awareness, repository, channel,
    connected: false,
    lastSequence: Math.max(bootstrap.lastSequence, ...bootstrap.updates.map((update) => update.sequence)),
    updatesSinceCompaction: bootstrap.updates.length,
    bytesSinceCompaction: bootstrap.updates.reduce((total, update) => total + update.payload.byteLength, 0),
    flushPromise: null, flushAgain: false, compactionPromise: null,
    broadcastUpdateIds: new Set(), updatePresence, refreshComments,
    dispose: () => {},
  }
  active = currentSession
  useCollaborationStore.setState({ role: bootstrap.role, localClientId: awareness.clientID, error: null })

  const localState: LocalPresenceState = {
    userId: session.user.id,
    name: userName(session),
    color: userColor(session.user.id),
    role: bootstrap.role,
    cursor: null,
    selectedWidgetIds: [...useWidgetStore.getState().selectedIds],
    editingWidgetId: null,
    camera: { pan: useCanvasStore.getState().pan, zoom: useCanvasStore.getState().zoom },
    lastSeenAt: Date.now(),
  }
  awareness.setLocalState(localState)

  const publishPresence = () => {
    if (!currentSession.connected) return
    const encoded = encodeAwarenessUpdate(awareness, [awareness.clientID])
    void channel.track({ clientId: awareness.clientID, awareness: bytesToBase64(encoded) })
  }
  const schedulePresence = () => {
    if (presenceTimer) return
    presenceTimer = window.setTimeout(() => {
      presenceTimer = 0
      publishPresence()
    }, 16)
  }
  const onAwareness = () => {
    publishParticipants(currentSession)
    schedulePresence()
  }
  awareness.on('update', onAwareness)
  disposers.push(() => awareness.off('update', onAwareness))

  let cacheTimer = 0
  const cacheDocument = () => writeCachedCollaborationDocument({
    canvasId,
    snapshot: Y.encodeStateAsUpdate(bridge.doc),
    lastSequence: currentSession.lastSequence,
    role: currentSession.role,
    updatedAt: Date.now(),
  }).catch(() => {})
  const scheduleDocumentCache = () => {
    window.clearTimeout(cacheTimer)
    cacheTimer = window.setTimeout(() => void cacheDocument(), 180)
  }
  bridge.doc.on('update', scheduleDocumentCache)
  disposers.push(() => bridge.doc.off('update', scheduleDocumentCache))

  channel.on('broadcast', { event: UPDATE_EVENT }, ({ payload }) => {
    if (typeof payload?.data !== 'string') return
    try {
      const update = base64ToBytes(payload.data)
      if (update.byteLength > MAX_WIRE_UPDATE_BYTES) throw new Error('Realtime update exceeded safety limit')
      Y.applyUpdate(bridge.doc, update, REMOTE_TRANSPORT_ORIGIN)
    } catch (error) {
      useCollaborationStore.setState({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState() as Record<string, Array<{ clientId?: unknown; awareness?: unknown }>>
    const liveRemoteIds = new Set<number>()
    for (const presences of Object.values(state)) {
      for (const presence of presences) {
        if (typeof presence.awareness !== 'string' || typeof presence.clientId !== 'number') continue
        if (presence.clientId !== awareness.clientID) liveRemoteIds.add(presence.clientId)
        try { applyAwarenessUpdate(awareness, base64ToBytes(presence.awareness), PRESENCE_ORIGIN) } catch { /* Ignore malformed presence. */ }
      }
    }
    const stale = [...awareness.getStates().keys()].filter(
      (clientId) => clientId !== awareness.clientID && !liveRemoteIds.has(clientId),
    )
    if (stale.length > 0) removeAwarenessStates(awareness, stale, PRESENCE_ORIGIN)
    publishParticipants(currentSession)
  })
  channel.subscribe((status) => {
    if (active !== currentSession) return
    if (status === 'SUBSCRIBED') {
      currentSession.connected = true
      useCollaborationStore.setState({ status: 'connected', error: null })
      publishPresence()
      void syncDurableUpdates(currentSession).then(() => flushPending(currentSession)).catch((error: unknown) => {
        useCollaborationStore.setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
      })
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      currentSession.connected = false
      useCollaborationStore.setState({ status: navigator.onLine ? 'reconnecting' : 'offline' })
    } else if (status === 'CLOSED') {
      currentSession.connected = false
    }
  })

  if (!hasRemoteState) {
    if (canEditCollaborativeCanvas(bootstrap.role)) {
      bridge.seedFromStore()
      bridge.undoManager.clear()
    } else {
      writeCanvasSnapshot(bridge.doc, {
        canvasId,
        canvas: { id: canvasId, name: canvasName },
        widgets: {}, relations: {}, connections: {}, groups: {},
      }, REMOTE_TRANSPORT_ORIGIN)
      bridge.applyDocumentToStore()
    }
  }
  scheduleDocumentCache()
  const disposeGuards = installCollaborationPermissionGuards(bridge.undoManager)
  const unsubscribeSelection = useWidgetStore.subscribe((state, previous) => {
    if (state.selectedIds !== previous.selectedIds) updatePresence({ selectedWidgetIds: [...state.selectedIds] })
  })
  let cameraTimer = 0
  const unsubscribeCamera = useCanvasStore.subscribe((state, previous) => {
    if (state.pan === previous.pan && state.zoom === previous.zoom) return
    if (useCollaborationStore.getState().followingClientId !== null) return
    window.clearTimeout(cameraTimer)
    cameraTimer = window.setTimeout(() => updatePresence({
      camera: { pan: useCanvasStore.getState().pan, zoom: useCanvasStore.getState().zoom },
    }), 80)
  })
  const disposePointer = installPointerPresence(currentSession)
  const onOnline = () => {
    useCollaborationStore.setState({ status: currentSession.connected ? 'connected' : 'reconnecting' })
    void syncDurableUpdates(currentSession).then(() => flushPending(currentSession))
  }
  const onOffline = () => useCollaborationStore.setState({ status: 'offline' })
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  void refreshComments().catch(() => {})

  currentSession.dispose = () => {
    window.clearTimeout(presenceTimer)
    window.clearTimeout(cameraTimer)
    window.clearTimeout(cacheTimer)
    void cacheDocument()
    disposePointer()
    unsubscribeSelection()
    unsubscribeCamera()
    disposeGuards()
    for (const dispose of disposers) dispose()
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    void channel.untrack()
    void client.removeChannel(channel)
    awareness.destroy()
    bridge.destroy()
  }
}

function stopActiveSession(): void {
  generation += 1
  const previous = active
  active = null
  previous?.dispose()
  useCollaborationStore.setState({ ...INITIAL_COLLABORATION_STATE })
}

function restartForCurrentCanvas(): void {
  stopActiveSession()
  const session = useAuthStore.getState().session
  if (!session) return
  const expectedGeneration = generation
  const canvasId = useWidgetStore.getState().activeCanvasId
  void startCanvasSession(session, canvasId, expectedGeneration).catch((error: unknown) => {
    if (expectedGeneration !== generation) return
    useCollaborationStore.setState({
      status: navigator.onLine ? 'error' : 'offline',
      canvasId,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

async function joinCanvasFromUrl(session: Session): Promise<boolean> {
  const url = new URL(window.location.href)
  const canvasId = url.searchParams.get('collaborate')
  if (!canvasId || canvasId.length > 256) return false
  const client = await getSupabaseClient()
  if (!client) return false
  await client.realtime.setAuth(session.access_token)
  const repository = new SupabaseCollaborationRepository(client)
  // Metadata is protected by membership RLS. A random or uninvited link cannot
  // create/claim a canvas and is handled by the normal error boundary below.
  const metadata = await repository.getCanvasMetadata(canvasId)
  const store = useWidgetStore.getState()
  if (!store.canvases[canvasId]) {
    const workspace = store.workspaces[store.activeWorkspaceId]
    if (!workspace) throw new Error('No local workspace is available for the shared canvas')
    useWidgetStore.setState({
      canvases: {
        ...store.canvases,
        [canvasId]: {
          id: canvasId,
          name: metadata.name,
          workspaceId: workspace.id,
          parentCanvasId: workspace.rootCanvasId === canvasId ? null : workspace.rootCanvasId,
        },
      },
    })
  }
  if (useWidgetStore.getState().activeCanvasId !== canvasId) {
    useWidgetStore.getState().navigateToCanvas(canvasId)
  }
  url.searchParams.delete('collaborate')
  window.history.replaceState(null, '', url)
  return true
}

function setCollaborativeEditingWidget(widgetId: string | null): void {
  active?.updatePresence({ editingWidgetId: widgetId })
}

function followCollaborator(clientId: number | null): void {
  useCollaborationStore.setState({ followingClientId: clientId })
  if (active) publishParticipants(active)
}

async function inviteCollaborator(email: string, role: CollaborationRole): Promise<void> {
  if (!active || active.role !== 'owner') throw new Error('Only the canvas owner can invite people')
  await active.repository.setMemberRole(active.canvasId, email, role)
}

async function postCollaborationComment(body: string, parentId?: string, widgetId?: string): Promise<void> {
  if (!active || !canCommentOnCollaborativeCanvas(active.role)) throw new Error('Your role cannot add comments')
  await active.repository.addComment(active.canvasId, body, { parentId, widgetId })
  await active.refreshComments()
}

async function refreshCollaborationComments(): Promise<void> {
  await active?.refreshComments()
}

export function initCollaborationRuntime(): () => void {
  const unregisterController = registerCollaborationController({
    setEditingWidget: setCollaborativeEditingWidget,
    follow: followCollaborator,
    invite: inviteCollaborator,
    postComment: postCollaborationComment,
    refreshComments: refreshCollaborationComments,
  })
  let previousCanvasId = useWidgetStore.getState().activeCanvasId
  let previousSessionId = useAuthStore.getState().session?.user.id ?? null
  const unsubscribeBoard = useWidgetStore.subscribe((state) => {
    if (state.activeCanvasId === previousCanvasId) return
    previousCanvasId = state.activeCanvasId
    restartForCurrentCanvas()
  })
  const unsubscribeAuth = useAuthStore.subscribe((state) => {
    const sessionId = state.session?.user.id ?? null
    if (sessionId === previousSessionId) return
    previousSessionId = sessionId
    restartForCurrentCanvas()
  })
  const retryOfflineStart = () => {
    if (!active && useAuthStore.getState().session) restartForCurrentCanvas()
  }
  window.addEventListener('online', retryOfflineStart)
  const initialSession = useAuthStore.getState().session
  if (initialSession && new URL(window.location.href).searchParams.has('collaborate')) {
    void joinCanvasFromUrl(initialSession)
      .then(() => restartForCurrentCanvas())
      .catch((error: unknown) => {
        useCollaborationStore.setState({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      })
  } else {
    restartForCurrentCanvas()
  }
  return () => {
    unsubscribeBoard()
    unsubscribeAuth()
    window.removeEventListener('online', retryOfflineStart)
    unregisterController()
    stopActiveSession()
  }
}
