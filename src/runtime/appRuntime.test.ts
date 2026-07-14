import { describe, expect, it, vi } from 'vitest'
import { composeRuntimeDisposer, createRuntimeBoundary } from './appRuntime'

describe('application runtime boundary', () => {
  it('disposes services once in reverse startup order', () => {
    const order: string[] = []
    const dispose = composeRuntimeDisposer([
      vi.fn(() => order.push('persistence')),
      vi.fn(() => order.push('circuit')),
    ])

    dispose()
    dispose()
    expect(order).toEqual(['circuit', 'persistence'])
  })

  it('starts once, then permits a clean restart after disposal', () => {
    const serviceDispose = vi.fn()
    const startServices = vi.fn(() => [serviceDispose])
    const runtime = createRuntimeBoundary(startServices)

    const first = runtime.start()
    expect(runtime.start()).toBe(first)
    expect(startServices).toHaveBeenCalledTimes(1)

    first()
    first()
    expect(serviceDispose).toHaveBeenCalledTimes(1)

    expect(runtime.start()).not.toBe(first)
    expect(startServices).toHaveBeenCalledTimes(2)
  })
})
