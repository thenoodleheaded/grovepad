import { describe, expect, it } from 'vitest'
import { safePersistedIslandSize } from './focusModeSizing'

describe('focus-mode persisted sizing', () => {
  it('revalidates stale absolute sizes against the current parent', () => {
    expect(safePersistedIslandSize(
      { width: 420, height: 500 },
      { sizing: 'free', minWidth: 96, minHeight: 32, maxWidth: 640, maxHeight: 420, containerWidth: 248 },
    )).toEqual({ width: 248, height: 420 })
  })

  it('drops geometry when the current parent cannot satisfy the island floor', () => {
    expect(safePersistedIslandSize(
      { width: 160 },
      { sizing: 'width', minWidth: 180, minHeight: 32, maxWidth: 640, maxHeight: 420, containerWidth: 150 },
    )).toBeUndefined()
  })

  it('never restores height onto width-only or fixed islands', () => {
    const common = { minWidth: 96, minHeight: 32, maxWidth: 400, maxHeight: 300, containerWidth: 300 }
    expect(safePersistedIslandSize({ width: 220, height: 200 }, { ...common, sizing: 'width' }))
      .toEqual({ width: 220 })
    expect(safePersistedIslandSize({ width: 220, height: 200 }, { ...common, sizing: 'fixed' }))
      .toBeUndefined()
  })
})
