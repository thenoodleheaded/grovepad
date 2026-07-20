import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersistenceStatusStore } from '../store/usePersistenceStatusStore'
import { initNetworkStatusRuntime, offlineResourceUrls } from './networkStatusRuntime'

describe('network status runtime', () => {
  beforeEach(() => {
    usePersistenceStatusStore.setState({ networkOnline: true, serviceWorkerReady: false })
  })

  it('publishes browser changes and removes both listeners exactly once', () => {
    let online = true
    const listeners = new Map<string, () => void>()
    const stops: Array<ReturnType<typeof vi.fn>> = []
    const dispose = initNetworkStatusRuntime({
      readOnline: () => online,
      listen: (event, listener) => {
        listeners.set(event, listener)
        const stop = vi.fn()
        stops.push(stop)
        return stop
      },
    })

    online = false
    listeners.get('offline')?.()
    expect(usePersistenceStatusStore.getState().networkOnline).toBe(false)
    dispose()
    dispose()
    expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true)
  })

  it('marks the offline shell ready unless disposed before registration settles', async () => {
    let resolveRegistration!: () => void
    const registration = new Promise<void>((resolve) => { resolveRegistration = resolve })
    const dispose = initNetworkStatusRuntime({
      readOnline: () => true,
      listen: () => () => undefined,
      registerServiceWorker: () => registration,
    })
    resolveRegistration()
    await registration
    await Promise.resolve()
    expect(usePersistenceStatusStore.getState().serviceWorkerReady).toBe(true)

    usePersistenceStatusStore.setState({ serviceWorkerReady: false })
    const pending = initNetworkStatusRuntime({
      readOnline: () => true,
      listen: () => () => undefined,
      registerServiceWorker: () => Promise.resolve(),
    })
    pending()
    await Promise.resolve()
    expect(usePersistenceStatusStore.getState().serviceWorkerReady).toBe(false)
    dispose()
  })

  it('keeps local work available when service-worker registration fails', async () => {
    const dispose = initNetworkStatusRuntime({
      readOnline: () => false,
      listen: () => () => undefined,
      registerServiceWorker: () => Promise.reject(new Error('blocked')),
    })
    await Promise.resolve()
    expect(usePersistenceStatusStore.getState()).toMatchObject({
      networkOnline: false,
      serviceWorkerReady: false,
    })
    dispose()
  })

  it('offers only unique same-origin resources to the offline cache', () => {
    expect(offlineResourceUrls([
      { name: 'https://grovepad.test/assets/app.js' },
      { name: 'https://grovepad.test/assets/app.js' },
      { name: 'https://grovepad.test/assets/lazy.js?v=2' },
      { name: 'https://cdn.example/font.woff2' },
      { name: 'https://grovepad.test/service-worker.js' },
    ], 'https://grovepad.test')).toEqual([
      '/assets/app.js',
      '/assets/lazy.js?v=2',
    ])
  })
})
