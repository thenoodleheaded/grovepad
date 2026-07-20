import { describe, expect, it } from 'vitest'
import { classifyTier } from './cameraEngine'

describe('camera motion tier classifier', () => {
  it('enters fast only above the entry threshold', () => {
    expect(classifyTier('idle', 30)).toBe('idle')
    expect(classifyTier('idle', 100)).toBe('moving')
    expect(classifyTier('idle', 1399)).toBe('moving')
    expect(classifyTier('idle', 1401)).toBe('fast')
  })

  it('keeps fast down to the lower exit threshold (hysteresis)', () => {
    expect(classifyTier('fast', 800)).toBe('fast')
    expect(classifyTier('fast', 699)).toBe('moving')
  })

  it('never returns to idle from a speed reading alone', () => {
    // Idle is only reachable via the settle timer, so quality never flickers
    // at the moving/idle boundary during slow drift.
    expect(classifyTier('moving', 5)).toBe('moving')
    expect(classifyTier('fast', 5)).toBe('moving')
  })
})
