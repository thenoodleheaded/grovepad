import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCircuitStore } from './useCircuitStore'

describe('circuit interaction mode', () => {
  afterEach(() => {
    useCircuitStore.setState({ circuitMode: false, wireDrag: null, pendingDrop: null })
    vi.unstubAllGlobals()
  })

  it('sets document presentation and canonical circuit state idempotently', () => {
    const attributes = new Set<string>()
    vi.stubGlobal('document', {
      body: {
        toggleAttribute(name: string, active: boolean) {
          if (active) attributes.add(name)
          else attributes.delete(name)
        },
      },
    })

    useCircuitStore.getState().setCircuitMode(true)
    useCircuitStore.getState().setCircuitMode(true)
    expect(useCircuitStore.getState().circuitMode).toBe(true)
    expect(attributes.has('data-circuit-mode')).toBe(true)

    useCircuitStore.getState().toggleCircuitMode()
    expect(useCircuitStore.getState().circuitMode).toBe(false)
    expect(attributes.has('data-circuit-mode')).toBe(false)
  })
})
