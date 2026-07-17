import { describe, expect, it, vi } from 'vitest'
import type { HydratedPersistedBoard, PersistedBoard } from '../types/persistence'
import { restoreWithProtectedSnapshot } from './snapshotRestore'

describe('protected snapshot restore', () => {
  it('protects the current board before replacement and returns a rollback', async () => {
    const events: string[] = []
    const current = { name: 'current' } as unknown as PersistedBoard
    const currentRecovery = { name: 'current' } as unknown as HydratedPersistedBoard
    const target = { name: 'older' } as unknown as HydratedPersistedBoard
    const rollback = await restoreWithProtectedSnapshot({
      currentBoard: current,
      currentRecovery,
      target,
      protect: async () => { events.push('protected') },
      load: (board) => events.push((board as unknown as { name: string }).name),
    })
    expect(events).toEqual(['protected', 'older'])
    rollback()
    expect(events).toEqual(['protected', 'older', 'current'])
  })

  it('does not replace anything when protection fails', async () => {
    const load = vi.fn()
    await expect(restoreWithProtectedSnapshot({
      currentBoard: {} as PersistedBoard,
      currentRecovery: {} as HydratedPersistedBoard,
      target: {} as HydratedPersistedBoard,
      protect: async () => { throw new Error('disk full') },
      load,
    })).rejects.toThrow('disk full')
    expect(load).not.toHaveBeenCalled()
  })
})
