import { describe, expect, it } from 'vitest'
import { quickAddStatusPresentation } from './quickAddStatus'

describe('Quick Add engine status copy', () => {
  it('distinguishes compatibility, readiness, and deterministic fallback', () => {
    expect(quickAddStatusPresentation({ phase: 'available', progress: 0 }).label).toBe('Compatible')
    expect(quickAddStatusPresentation({ phase: 'ready', progress: 1 }).label).toBe('Model ready')
    expect(quickAddStatusPresentation({ phase: 'heuristic', progress: 0 }).label).toBe('Deterministic')
  })
})
