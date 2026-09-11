import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initAnalyticsRuntime, resetAnalyticsRuntimeForTests } from './analyticsRuntime'

function harness(overrides: { optedIn?: boolean; configured?: boolean; browserRefuses?: boolean } = {}) {
  let optedIn = overrides.optedIn ?? true
  let browserRefuses = overrides.browserRefuses ?? false
  const listeners = new Set<() => void>()
  const capture = vi.fn()
  const stop = vi.fn()
  const dispose = initAnalyticsRuntime({
    readOptedIn: () => optedIn,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    configured: overrides.configured ?? true,
    browserRefuses: () => browserRefuses,
    capture,
    stop,
  })
  return {
    capture,
    stop,
    dispose,
    listenerCount: () => listeners.size,
    set(next: { optedIn?: boolean; browserRefuses?: boolean }) {
      if (next.optedIn !== undefined) optedIn = next.optedIn
      if (next.browserRefuses !== undefined) browserRefuses = next.browserRefuses
      for (const listener of listeners) listener()
    },
  }
}

describe('analytics runtime', () => {
  beforeEach(resetAnalyticsRuntimeForTests)

  it('counts a launch once even when the runtime is torn down and restarted', () => {
    // React's development StrictMode does exactly this on every mount.
    const first = harness()
    first.dispose()
    const second = harness()
    expect(first.capture).toHaveBeenCalledTimes(1)
    expect(second.capture).not.toHaveBeenCalled()
    second.dispose()
  })

  it('sends one app_opened event per start, not one per settings change', () => {
    const run = harness()
    expect(run.capture).toHaveBeenCalledTimes(1)
    expect(run.capture.mock.calls[0]?.[0]).toBe('app_opened')
    expect(run.capture.mock.calls[0]?.[1]).toEqual({ surface: 'web' })

    run.set({})
    run.set({})
    expect(run.capture).toHaveBeenCalledTimes(1)
    run.dispose()
  })

  it('sends nothing while opted out, and stops the client when consent is withdrawn', () => {
    const run = harness({ optedIn: false })
    expect(run.capture).not.toHaveBeenCalled()

    run.set({ optedIn: true })
    expect(run.capture).toHaveBeenCalledTimes(1)

    run.set({ optedIn: false })
    expect(run.stop).toHaveBeenCalledTimes(1)

    // Consent returning within the same run must not double-count the launch.
    run.set({ optedIn: true })
    expect(run.capture).toHaveBeenCalledTimes(1)
    run.dispose()
  })

  it('sends nothing when the build has no key or the browser refuses tracking', () => {
    const unkeyed = harness({ configured: false })
    expect(unkeyed.capture).not.toHaveBeenCalled()
    unkeyed.dispose()

    const refused = harness({ browserRefuses: true })
    expect(refused.capture).not.toHaveBeenCalled()
    refused.set({ browserRefuses: false })
    expect(refused.capture).toHaveBeenCalledTimes(1)
    refused.dispose()
  })

  it('unsubscribes exactly once and ignores later changes after disposal', () => {
    const run = harness({ optedIn: false })
    run.dispose()
    run.dispose()
    expect(run.listenerCount()).toBe(0)
    run.set({ optedIn: true })
    expect(run.capture).not.toHaveBeenCalled()
  })
})
