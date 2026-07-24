import { describe, expect, it } from 'vitest'
import { resolveFollowTarget } from './followTarget'
import type { CollaborationPresence } from './types'

function present(clientId: number, camera: CollaborationPresence['camera'] = null): CollaborationPresence {
  return {
    clientId,
    userId: `user-${clientId}`,
    name: `Person ${clientId}`,
    color: '#60a5fa',
    role: 'editor',
    cursor: null,
    selectedWidgetIds: [],
    editingWidgetId: null,
    camera,
    lastSeenAt: 0,
  }
}

const camera = { pan: { x: 12, y: -40 }, zoom: 0.75 }

describe('resolveFollowTarget', () => {
  it('does nothing when not following', () => {
    expect(resolveFollowTarget([present(1)], null)).toEqual({ followingClientId: null, camera: null })
  })

  it('adopts the followed client camera while they are present', () => {
    expect(resolveFollowTarget([present(1, camera), present(2)], 1)).toEqual({
      followingClientId: 1,
      camera,
    })
  })

  it('keeps following a present client that has no camera yet', () => {
    expect(resolveFollowTarget([present(1)], 1)).toEqual({ followingClientId: 1, camera: null })
  })

  it('stops following when the target disconnects, releasing the camera', () => {
    // Regression: a stale target left the gesture engine routing wheel/touch
    // to a client that no longer exists, so the canvas could never be moved.
    expect(resolveFollowTarget([present(2, camera)], 1)).toEqual({
      followingClientId: null,
      camera: null,
    })
  })

  it('stops following when everyone leaves', () => {
    expect(resolveFollowTarget([], 1)).toEqual({ followingClientId: null, camera: null })
  })

  it('never adopts a different participant camera than the followed one', () => {
    const other = { pan: { x: 999, y: 999 }, zoom: 4 }
    expect(resolveFollowTarget([present(1), present(2, other)], 1).camera).toBeNull()
  })
})
