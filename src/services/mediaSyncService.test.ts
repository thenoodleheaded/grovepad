import { describe, expect, it } from 'vitest'
import {
  MEDIA_BUCKET,
  MEDIA_UPLOAD_LIMIT_BYTES,
  createMediaSyncService,
  type MediaSyncEnvironment,
} from './mediaSyncService'
import type { Widget } from '../types/spatial'

// Media sync is allowed to fail in every direction — signed out, offline,
// refused, oversized — as long as the local board never notices. These cases
// pin that contract without a network or an IndexedDB.

interface FakeCloud {
  uploads: { path: string; size: number }[]
  objects: Map<string, Blob>
  listed: string[]
  failUploads: boolean
}

// Object paths carry the uploader's id — `<canvasId>/<userId>/<blobKey>` — so
// Storage policy can tell whose bytes these are without consulting a table the
// caller writes. They have to be uuid-shaped: the shared-canvas read path only
// follows folders that look like a user id.
const OWNER = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const OTHER = '9c858901-8a57-4791-81fe-4c455b099bc9'
const at = (canvasId: string, userId: string, key: string) => `${canvasId}/${userId}/${key}`

function mediaWidget(id: string, canvasId: string, blobKey: string): Widget {
  return {
    id,
    canvasId,
    type: 'media',
    title: 'Picture',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 200 },
    data: { url: '', caption: '', localBlobKey: blobKey },
  } as unknown as Widget
}

function harness(options: {
  signedIn?: boolean
  configured?: boolean
  widgets?: readonly Widget[]
  local?: Record<string, Blob>
  remote?: Record<string, Blob>
  failUploads?: boolean
} = {}) {
  const cloud: FakeCloud = {
    uploads: [],
    objects: new Map(Object.entries(options.remote ?? {})),
    listed: [],
    failUploads: options.failUploads ?? false,
  }
  const local = new Map<string, Blob>(Object.entries(options.local ?? {}))
  const timers: (() => void)[] = []

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: options.signedIn === false ? null : { user: { id: OWNER } } },
      }),
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe(MEDIA_BUCKET)
        return {
          upload: async (path: string, blob: Blob) => {
            if (cloud.failUploads) return { error: { message: 'network down', statusCode: '500' } }
            if (cloud.objects.has(path)) {
              return { error: { message: 'The resource already exists', statusCode: '409' } }
            }
            cloud.objects.set(path, blob)
            cloud.uploads.push({ path, size: blob.size })
            return { error: null }
          },
          download: async (path: string) => {
            const found = cloud.objects.get(path)
            return found ? { data: found, error: null } : { data: null, error: { message: 'not found' } }
          },
          // Storage lists immediate children only: a nested object surfaces as
          // its folder name, once, not as a full sub-path. The shared-canvas
          // read path depends on that, so the fake has to match it.
          list: async (prefix: string) => {
            cloud.listed.push(prefix)
            const names = new Set(
              [...cloud.objects.keys()]
                .filter((path) => path.startsWith(`${prefix}/`))
                .map((path) => path.slice(prefix.length + 1).split('/')[0]!),
            )
            return { data: [...names].map((name) => ({ name })), error: null }
          },
        }
      },
    },
  }

  const env: MediaSyncEnvironment = {
    getClient: async () => (options.configured === false ? null : (client as never)),
    readBlob: async (key) => local.get(key) ?? null,
    writeBlob: async (key, blob) => { local.set(key, blob) },
    listWidgets: () => options.widgets ?? [],
    setTimer: (run) => { timers.push(run); return timers.length },
    clearTimer: () => {},
  }

  return { service: createMediaSyncService(env), cloud, local }
}

const picture = () => new Blob(['pretend-png'], { type: 'image/png' })

describe('media sync carries blobs beside the board', () => {
  it('writes locally first, then uploads under the owning canvas', async () => {
    const { service, cloud, local } = harness({ widgets: [mediaWidget('w1', 'canvas-a', 'w1')] })
    await service.store('w1', picture())
    expect(local.get('w1')).toBeInstanceOf(Blob)
    await service.drain()
    expect(cloud.uploads.map((entry) => entry.path)).toEqual([at('canvas-a', OWNER, 'w1')])
  })

  it('keeps the local write when the upload is refused', async () => {
    const { service, cloud, local } = harness({
      widgets: [mediaWidget('w1', 'canvas-a', 'w1')],
      failUploads: true,
    })
    await service.store('w1', picture())
    await service.drain()
    expect(local.get('w1')).toBeInstanceOf(Blob)
    expect(cloud.uploads).toEqual([])
  })

  it('uploads nothing while signed out', async () => {
    const { service, cloud, local } = harness({
      signedIn: false,
      widgets: [mediaWidget('w1', 'canvas-a', 'w1')],
    })
    await service.store('w1', picture())
    await service.drain()
    expect(local.get('w1')).toBeInstanceOf(Blob)
    expect(cloud.uploads).toEqual([])
  })

  it('refuses a file past the size limit rather than starting a doomed upload', async () => {
    const { service, cloud, local } = harness({ widgets: [mediaWidget('w1', 'canvas-a', 'w1')] })
    const huge = { size: MEDIA_UPLOAD_LIMIT_BYTES + 1, type: 'video/mp4' } as Blob
    await service.store('w1', huge)
    await service.drain()
    expect(local.get('w1')).toBe(huge)
    expect(cloud.uploads).toEqual([])
  })

  it('treats an object that already exists as carried', async () => {
    const { service, cloud } = harness({
      widgets: [mediaWidget('w1', 'canvas-a', 'w1')],
      remote: { [at('canvas-a', OWNER, 'w1')]: picture() },
    })
    await service.store('w1', picture())
    await service.drain()
    expect(cloud.uploads).toEqual([])
  })

  it('downloads and caches a blob this device has never held', async () => {
    const remote = picture()
    const { service, local } = harness({
      widgets: [mediaWidget('w1', 'canvas-a', 'w1')],
      remote: { [at('canvas-a', OWNER, 'w1')]: remote },
    })
    expect(local.has('w1')).toBe(false)
    await expect(service.load('w1')).resolves.toBe(remote)
    expect(local.get('w1')).toBe(remote)
  })

  it('finds a collaborator’s upload on a shared canvas', async () => {
    // Somebody else's bytes live under their own id, which this device does not
    // know, so the canvas folder is listed and their upload is found there.
    const theirs = picture()
    const { service, local } = harness({
      widgets: [mediaWidget('w1', 'canvas-a', 'w1')],
      remote: { [at('canvas-a', OTHER, 'w1')]: theirs },
    })
    await expect(service.load('w1')).resolves.toBe(theirs)
    expect(local.get('w1')).toBe(theirs)
  })

  it('never writes outside its own owner folder', async () => {
    // The Storage policy pins the owner segment to the caller, so an upload that
    // landed anywhere else would be refused by the server. Pinning it here keeps
    // the client honest about the shape it relies on.
    const { service, cloud } = harness({
      widgets: [mediaWidget('w1', 'canvas-a', 'w1'), mediaWidget('w2', 'canvas-b', 'w2')],
      local: { w1: picture(), w2: picture() },
    })
    await service.reconcile()
    await service.drain()
    expect(cloud.uploads.every((entry) => entry.path.split('/')[1] === OWNER)).toBe(true)
  })

  it('returns null — never throws — when the cloud has no copy yet', async () => {
    const { service } = harness({ widgets: [mediaWidget('w1', 'canvas-a', 'w1')] })
    await expect(service.load('w1')).resolves.toBeNull()
  })

  it('prefers the local blob and never reaches for the cloud', async () => {
    const held = picture()
    const { service, cloud } = harness({
      widgets: [mediaWidget('w1', 'canvas-a', 'w1')],
      local: { w1: held },
    })
    await expect(service.load('w1')).resolves.toBe(held)
    expect(cloud.listed).toEqual([])
  })

  it('reconcile uploads only what the cloud is missing', async () => {
    const { service, cloud } = harness({
      widgets: [mediaWidget('w1', 'canvas-a', 'w1'), mediaWidget('w2', 'canvas-a', 'w2')],
      local: { w1: picture(), w2: picture() },
      remote: { [at('canvas-a', OWNER, 'w1')]: picture() },
    })
    await service.reconcile()
    await service.drain()
    expect(cloud.uploads.map((entry) => entry.path)).toEqual([at('canvas-a', OWNER, 'w2')])
  })

  it('does nothing at all when the cloud is not configured', async () => {
    const { service, local } = harness({
      configured: false,
      widgets: [mediaWidget('w1', 'canvas-a', 'w1')],
    })
    await service.store('w1', picture())
    await service.drain()
    await service.reconcile()
    expect(local.get('w1')).toBeInstanceOf(Blob)
    await expect(service.load('missing')).resolves.toBeNull()
  })

  it('stops carrying anything after disposal', async () => {
    const { service, cloud } = harness({ widgets: [mediaWidget('w1', 'canvas-a', 'w1')] })
    await service.store('w1', picture())
    service.dispose()
    await service.drain()
    expect(cloud.uploads).toEqual([])
  })

  // The exported service is a module-level singleton and the runtime boundary
  // starts it more than once per page load — StrictMode remounts it on every dev
  // boot, and signing out and back in remounts it in production. A one-shot
  // `disposed` flag would leave every later blob stranded on the device.
  it('carries blobs again after being disposed and restarted', async () => {
    const { service, cloud } = harness({ widgets: [mediaWidget('w1', 'canvas-a', 'w1')] })
    service.dispose()

    service.start()
    await service.store('w1', picture())
    await service.drain()
    expect(cloud.uploads.map((entry) => entry.path)).toEqual([at('canvas-a', OWNER, 'w1')])
  })
})
