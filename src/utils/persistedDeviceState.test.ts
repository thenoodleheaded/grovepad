import { describe, expect, it } from 'vitest'
import type { PersistedBoardDocumentState } from '../types/persistence'
import { resolvePersistedDeviceState, serializePersistedDeviceState } from './persistedDeviceState'

const topology: Pick<PersistedBoardDocumentState, 'workspaces' | 'canvases'> = {
  workspaces: {
    ws: { id: 'ws', name: 'Workspace', rootCanvasId: 'root', createdAt: 1 },
  },
  canvases: {
    root: { id: 'root', name: 'Root', workspaceId: 'ws', parentCanvasId: null },
    child: { id: 'child', name: 'Child', workspaceId: 'ws', parentCanvasId: 'root' },
  },
}

describe('persisted device state', () => {
  it('reads current local navigation and clamps valid canvas views', () => {
    const resolved = resolvePersistedDeviceState({
      format: 'grovepad-device',
      v: 1,
      activeWorkspaceId: 'ws',
      activeCanvasId: 'child',
      canvasViews: {
        child: { pan: { x: 10, y: 20 }, zoom: 99 },
        deleted: { pan: { x: 1, y: 2 }, zoom: 1 },
      },
    }, topology)

    expect(resolved).toEqual({
      activeWorkspaceId: 'ws',
      activeCanvasId: 'child',
      canvasViews: { child: { pan: { x: 10, y: 20 }, zoom: 3 } },
    })
  })

  it('migrates legacy embedded navigation when no device document exists', () => {
    expect(resolvePersistedDeviceState(null, topology, {
      activeWorkspaceId: 'ws',
      activeCanvasId: 'child',
      canvasViews: { root: { pan: { x: 4, y: 5 }, zoom: 0.75 } },
    })).toMatchObject({
      activeWorkspaceId: 'ws',
      activeCanvasId: 'child',
      canvasViews: { root: { pan: { x: 4, y: 5 }, zoom: 0.75 } },
    })
  })

  it('falls back to a surviving root and emits a self-describing local payload', () => {
    const resolved = resolvePersistedDeviceState({
      format: 'grovepad-device',
      v: 1,
      activeWorkspaceId: 'deleted',
      activeCanvasId: 'deleted',
      canvasViews: {},
    }, topology)

    expect(serializePersistedDeviceState(resolved)).toEqual({
      format: 'grovepad-device',
      v: 1,
      activeWorkspaceId: 'ws',
      activeCanvasId: 'root',
      canvasViews: {},
    })
  })
})
