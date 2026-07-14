import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOwnedTimeout } from './ownedTimeout'

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('owned timeout', () => {
  it('replaces an older callback when scheduled again', () => {
    vi.useFakeTimers()
    const timeout = createOwnedTimeout()
    const calls: string[] = []
    timeout.schedule(() => calls.push('old'), 100)
    timeout.schedule(() => calls.push('new'), 150)
    vi.advanceTimersByTime(150)
    expect(calls).toEqual(['new'])
  })

  it('never fires after disposal', () => {
    vi.useFakeTimers()
    const timeout = createOwnedTimeout()
    const callback = vi.fn()
    timeout.schedule(callback, 100)
    timeout.dispose()
    vi.advanceTimersByTime(100)
    expect(callback).not.toHaveBeenCalled()
  })
})
