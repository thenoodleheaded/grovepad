import { usePersistenceStatusStore } from '../store/usePersistenceStatusStore'

type NetworkEvent = 'online' | 'offline'

export interface NetworkStatusRuntimeOptions {
  readOnline?: () => boolean
  listen?: (event: NetworkEvent, listener: () => void) => () => void
  /** Production supplies the service-worker registration. Development omits it. */
  registerServiceWorker?: () => Promise<unknown>
}

export function offlineResourceUrls(
  entries: readonly Pick<PerformanceResourceTiming, 'name'>[],
  origin = location.origin,
): string[] {
  const urls = new Set<string>()
  for (const entry of entries) {
    try {
      const url = new URL(entry.name, origin)
      if (url.origin !== origin || url.pathname === '/service-worker.js') continue
      urls.add(`${url.pathname}${url.search}`)
    } catch {
      // Ignore malformed browser performance entries.
    }
  }
  return [...urls]
}

/** Register the production shell and wait until resources used during this
 * visit have been offered to it. The bounded wait avoids holding status in a
 * false pending state when message channels are blocked by a browser policy. */
export async function registerProductionOfflineShell(): Promise<void> {
  const registration = await navigator.serviceWorker.register('/service-worker.js')
  await navigator.serviceWorker.ready
  const worker = registration.active ?? navigator.serviceWorker.controller
  if (!worker) return
  const urls = offlineResourceUrls(
    performance.getEntriesByType('resource') as PerformanceResourceTiming[],
  )
  if (urls.length === 0) return

  await new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      channel.port1.close()
      resolve()
    }
    const timeout = window.setTimeout(finish, 2_000)
    channel.port1.onmessage = finish
    worker.postMessage({ type: 'CACHE_URLS', urls }, [channel.port2])
  })
}

const browserListener = (event: NetworkEvent, listener: () => void) => {
  window.addEventListener(event, listener)
  return () => window.removeEventListener(event, listener)
}

/** Own browser connectivity and optional offline-shell startup at the app
 * runtime boundary. Both listeners and late registration are disposal-safe. */
export function initNetworkStatusRuntime(options: NetworkStatusRuntimeOptions = {}): () => void {
  const readOnline = options.readOnline ?? (() => navigator.onLine)
  const listen = options.listen ?? browserListener
  let disposed = false
  let online = readOnline()
  const publish = () => {
    if (disposed) return
    online = readOnline()
    usePersistenceStatusStore.getState().setNetworkOnline(online)
  }

  usePersistenceStatusStore.getState().setNetworkOnline(online)
  const stopOnline = listen('online', publish)
  const stopOffline = listen('offline', publish)

  if (options.registerServiceWorker) {
    void options.registerServiceWorker()
      .then(() => {
        if (!disposed) usePersistenceStatusStore.getState().setServiceWorkerReady(true)
      })
      .catch(() => {
        // Offline installation is progressive enhancement; local board work
        // must never fail because registration was rejected or unavailable.
      })
  }

  return () => {
    if (disposed) return
    disposed = true
    stopOnline()
    stopOffline()
  }
}
