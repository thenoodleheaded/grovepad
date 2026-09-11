import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabase'
import { readMediaBlob, writeMediaBlob } from '../utils/boardDatabase'
import { mediaBlobKeysForWidget } from '../utils/widgetMediaKeys'
import { useWidgetStore } from '../store/useWidgetStore'
import type { Widget } from '../types/spatial'

// ---------------------------------------------------------------------------
// Board media travels beside the board, never inside it.
//
// A dropped picture is written to the device's own blob store first and the
// board keeps only its key, exactly as before. This service is the courier
// that carries the bytes to the other devices: after the local write lands it
// uploads a copy to a private bucket at `<canvasId>/<blobKey>`, and a device
// that meets a key it holds no blob for downloads it once and caches it.
//
// Every path here is best-effort by construction. Signed out, offline, over
// the size limit, or refused by the bucket's policy, the media simply stays
// device-local and the board keeps working — cloud failure must never break
// local board work, so nothing here throws at its callers.
// ---------------------------------------------------------------------------

export const MEDIA_BUCKET = 'board-media'
/** Matches the bucket's own ceiling; refusing here saves a doomed upload. */
export const MEDIA_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024

/** A queued upload is retried a few times, then left to the reconcile sweep. */
const MAX_ATTEMPTS = 4
const RETRY_BASE_MS = 2_000
/** The widget that owns a key is written a tick after its blob, so the queue
 *  always waits before asking which canvas a key belongs to. */
const DRAIN_DELAY_MS = 400

export interface MediaSyncEnvironment {
  getClient: () => Promise<SupabaseClient | null>
  readBlob: (key: string) => Promise<Blob | null>
  writeBlob: (key: string, blob: Blob) => Promise<void>
  listWidgets: () => readonly Widget[]
  setTimer: (run: () => void, delayMs: number) => number
  clearTimer: (handle: number) => void
}

export interface MediaSyncService {
  /** Write a blob to this device, then carry a copy to the cloud. */
  store: (key: string, blob: Blob) => Promise<void>
  /** This device's blob, or the cloud's copy cached locally, or null. */
  load: (key: string) => Promise<Blob | null>
  /** Upload every locally-held blob the cloud is missing. */
  reconcile: () => Promise<void>
  /** Settle the queue now — tests await this instead of watching timers. */
  drain: () => Promise<void>
  /** Reopen a disposed instance. The runtime boundary restarts, and the
   *  module-level singleton has to survive that or media sync is dead for the
   *  rest of the page load. */
  start: () => void
  dispose: () => void
}

interface QueueItem {
  key: string
  attempts: number
}

/**
 * `<canvasId>/<userId>/<blobKey>`.
 *
 * The uploader's id is a path segment because Storage policy has to decide who
 * owns these bytes without consulting a table the caller can write. It used to
 * be `<canvasId>/<blobKey>`, authorized by the caller's own `canvas_docs` row —
 * which every account holds for the shared seed canvas id, so every account
 * could read, overwrite and delete every other account's media. Identity in the
 * path is the server's own fact, so it survives a canvas id collision.
 */
function objectPath(canvasId: string, userId: string, key: string): string {
  return `${canvasId}/${userId}/${key}`
}

/** Storage folder listings are untyped; only uuid-shaped entries are uploaders. */
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Storage refuses an object that already exists; that is success, not error.
 *  Everything else is worth another attempt. */
function isAlreadyUploaded(error: { message?: string; statusCode?: string } | null): boolean {
  if (!error) return false
  return error.statusCode === '409' || /already exists|duplicate/i.test(error.message ?? '')
}

export function createMediaSyncService(env: MediaSyncEnvironment): MediaSyncService {
  const queue = new Map<string, QueueItem>()
  let timer: number | null = null
  let draining: Promise<void> | null = null
  let disposed = false

  /** Which canvas a key belongs to, asked of the live board rather than
   *  threaded through every call site — the same enumeration the `.grovepad`
   *  packager uses, so all three blob families resolve the same way. */
  const canvasIdForKey = (key: string): string | null => {
    for (const widget of env.listWidgets()) {
      if (mediaBlobKeysForWidget(widget).includes(key)) return widget.canvasId
    }
    return null
  }

  /** The client plus the id every object path is namespaced under. Both or
   *  neither: an upload with no user id has nowhere legitimate to go. */
  const signedInClient = async (): Promise<{ client: SupabaseClient; userId: string } | null> => {
    const client = await env.getClient().catch(() => null)
    if (!client) return null
    const { data } = await client.auth.getSession()
    const userId = data.session?.user?.id
    return userId ? { client, userId } : null
  }

  const upload = async (
    client: SupabaseClient,
    userId: string,
    canvasId: string,
    key: string,
  ): Promise<boolean> => {
    const blob = await env.readBlob(key).catch(() => null)
    // Nothing local to send is not a failure: the blob may have gone with its
    // widget between the enqueue and the drain.
    if (!blob) return true
    if (blob.size > MEDIA_UPLOAD_LIMIT_BYTES) return true
    const { error } = await client.storage.from(MEDIA_BUCKET).upload(objectPath(canvasId, userId, key), blob, {
      contentType: blob.type || 'application/octet-stream',
      upsert: false,
    })
    return !error || isAlreadyUploaded(error as { message?: string; statusCode?: string })
  }

  const schedule = (delayMs: number): void => {
    if (disposed || timer !== null) return
    timer = env.setTimer(() => {
      timer = null
      draining = drainOnce().catch(() => undefined)
    }, delayMs)
  }

  const drainOnce = async (): Promise<void> => {
    if (disposed || queue.size === 0) return
    const signedIn = await signedInClient()
    // Signed out or cloud unavailable: hold the queue rather than drop it, so
    // signing in later still carries what this session put in.
    if (!signedIn) return
    for (const item of [...queue.values()]) {
      if (disposed) return
      const canvasId = canvasIdForKey(item.key)
      const done = canvasId
        ? await upload(signedIn.client, signedIn.userId, canvasId, item.key).catch(() => false)
        : false
      if (done) {
        queue.delete(item.key)
        continue
      }
      item.attempts += 1
      if (item.attempts >= MAX_ATTEMPTS) queue.delete(item.key)
    }
    if (queue.size > 0) schedule(RETRY_BASE_MS * (1 + queue.size))
  }

  const store = async (key: string, blob: Blob): Promise<void> => {
    // The local write is the one that must not fail; it is awaited and its
    // error belongs to the caller. The upload is a consequence, never a gate.
    await env.writeBlob(key, blob)
    if (disposed || blob.size > MEDIA_UPLOAD_LIMIT_BYTES) return
    queue.set(key, { key, attempts: 0 })
    schedule(DRAIN_DELAY_MS)
  }

  const load = async (key: string): Promise<Blob | null> => {
    const local = await env.readBlob(key).catch(() => null)
    if (local) return local
    const canvasId = canvasIdForKey(key)
    if (!canvasId) return null
    const signedIn = await signedInClient()
    if (!signedIn) return null
    const { client, userId } = signedIn
    const store = client.storage.from(MEDIA_BUCKET)

    const own = await store.download(objectPath(canvasId, userId, key))
    if (own.data) {
      await env.writeBlob(key, own.data).catch(() => undefined)
      return own.data
    }

    // Not ours. On a shared canvas the bytes sit under whichever collaborator
    // uploaded them, and their id is not something this device knows, so the
    // uploader folders are listed and tried. Storage denies the listing outright
    // on a canvas we are not a member of, which is what keeps this from being a
    // way to go fishing through other people's boards.
    const { data: folders } = await store.list(canvasId, { limit: 100 })
    for (const folder of folders ?? []) {
      if (disposed) return null
      if (folder.name === userId || !UUID_SEGMENT.test(folder.name)) continue
      const { data } = await store.download(objectPath(canvasId, folder.name, key))
      if (!data) continue
      await env.writeBlob(key, data).catch(() => undefined)
      return data
    }
    // A miss means the device holding this picture has not uploaded it yet.
    // The card keeps its placeholder and a later read tries again.
    return null
  }

  const reconcile = async (): Promise<void> => {
    const signedIn = await signedInClient()
    if (!signedIn || disposed) return
    const { client, userId } = signedIn
    const byCanvas = new Map<string, string[]>()
    for (const widget of env.listWidgets()) {
      const keys = mediaBlobKeysForWidget(widget)
      if (keys.length === 0) continue
      byCanvas.set(widget.canvasId, [...(byCanvas.get(widget.canvasId) ?? []), ...keys])
    }
    for (const [canvasId, keys] of byCanvas) {
      if (disposed) return
      // Only our own folder is swept. Another collaborator's uploads are their
      // responsibility to reconcile — we could not write them anyway, since the
      // Storage policy pins the owner segment to the caller.
      const { data, error } = await client.storage
        .from(MEDIA_BUCKET)
        .list(objectPath(canvasId, userId, '').replace(/\/$/, ''), { limit: 1000 })
      if (error) continue
      const remote = new Set((data ?? []).map((entry) => entry.name))
      for (const key of keys) {
        if (remote.has(key)) continue
        const blob = await env.readBlob(key).catch(() => null)
        if (!blob || blob.size > MEDIA_UPLOAD_LIMIT_BYTES) continue
        queue.set(key, { key, attempts: 0 })
      }
    }
    if (queue.size > 0) schedule(DRAIN_DELAY_MS)
  }

  return {
    store,
    load,
    reconcile,
    drain: async () => {
      if (timer !== null) {
        env.clearTimer(timer)
        timer = null
        draining = drainOnce().catch(() => undefined)
      }
      await draining
    },
    start: () => {
      disposed = false
    },
    dispose: () => {
      disposed = true
      if (timer !== null) env.clearTimer(timer)
      timer = null
      queue.clear()
    },
  }
}

const service = createMediaSyncService({
  getClient: getSupabaseClient,
  readBlob: readMediaBlob,
  writeBlob: writeMediaBlob,
  listWidgets: () => Object.values(useWidgetStore.getState().widgets),
  // `globalThis`, not `window`: an import path can reach this module from a
  // headless test or the export tooling, where a DOM timer does not exist.
  setTimer: (run, delayMs) => globalThis.setTimeout(run, delayMs) as unknown as number,
  clearTimer: (handle) => globalThis.clearTimeout(handle),
})

/** Write media to this device and carry a copy to the cloud. Every blob write
 *  outside the export packager goes through here. */
export function storeMediaBlob(key: string, blob: Blob): Promise<void> {
  return service.store(key, blob)
}

/** Read media, falling back to the cloud copy on a device that has never held
 *  these bytes. Every blob read goes through here. */
export function loadMediaBlob(key: string): Promise<Blob | null> {
  return service.load(key)
}

/** Upload whatever the cloud is missing — media that predates this service, or
 *  a widget that moved to another canvas and needs its bytes under the new
 *  path. Runtime-owned, so it returns an idempotent disposer. */
export function startMediaSync(): () => void {
  // The service is a module-level singleton but the runtime boundary starts and
  // stops repeatedly — StrictMode remounts it on every dev boot, and signing out
  // and back in remounts it in production. Without this, the second start would
  // leave `disposed` latched and nothing would ever upload again.
  service.start()
  void service.reconcile().catch(() => undefined)
  return () => service.dispose()
}
