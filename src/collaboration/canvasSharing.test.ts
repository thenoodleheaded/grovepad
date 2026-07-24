import { describe, expect, it, vi } from 'vitest'
import {
  canToggleCanvasSharing,
  registerCanvasSharing,
  revokeCanvasSharing,
  type CanvasSharingRepository,
} from './canvasSharing'

function repository(role: 'owner' | 'editor' | 'commenter' | 'viewer' = 'owner') {
  return {
    ensureCanvas: vi.fn(async () => role),
    deleteCanvasCollaboration: vi.fn(async () => undefined),
  } satisfies CanvasSharingRepository
}

describe('canvas sharing lifecycle', () => {
  it('keeps an unresolved shared canvas recoverable for a signed-in user', () => {
    expect(canToggleCanvasSharing({
      shared: true,
      hasSession: true,
      configured: true,
      role: null,
      busy: false,
    })).toBe(true)
  })

  it('disables the control only for real prerequisites, active work, or a known non-owner', () => {
    const base = { shared: true, hasSession: true, configured: true, role: 'owner' as const, busy: false }
    expect(canToggleCanvasSharing(base)).toBe(true)
    expect(canToggleCanvasSharing({ ...base, hasSession: false })).toBe(false)
    expect(canToggleCanvasSharing({ ...base, configured: false })).toBe(false)
    expect(canToggleCanvasSharing({ ...base, busy: true })).toBe(false)
    expect(canToggleCanvasSharing({ ...base, role: 'editor' })).toBe(false)
  })

  it('waits for server registration before reporting the owner role', async () => {
    const sharingRepository = repository()
    await expect(registerCanvasSharing(sharingRepository, 'canvas-1', 'Plan')).resolves.toBe('owner')
    expect(sharingRepository.ensureCanvas).toHaveBeenCalledWith('canvas-1', 'Plan')
  })

  it('rechecks an unknown role so an old stuck canvas can be made private', async () => {
    const sharingRepository = repository()
    await revokeCanvasSharing(sharingRepository, 'canvas-1', 'Plan', null)
    expect(sharingRepository.ensureCanvas).toHaveBeenCalledWith('canvas-1', 'Plan')
    expect(sharingRepository.deleteCanvasCollaboration).toHaveBeenCalledWith('canvas-1')
  })

  it('still refuses to revoke sharing for a verified non-owner', async () => {
    const sharingRepository = repository('editor')
    await expect(revokeCanvasSharing(sharingRepository, 'canvas-1', 'Plan', null))
      .rejects.toThrow('Only the canvas owner can stop sharing')
    expect(sharingRepository.deleteCanvasCollaboration).not.toHaveBeenCalled()
  })
})
