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

    expect(resolved).toMatchObject({
      activeWorkspaceId: 'ws',
      activeCanvasId: 'child',
      canvasViews: { child: { pan: { x: 10, y: 20 }, zoom: 3 } },
    })
    // A payload written before tabs existed still opens exactly one tab, on
    // the canvas this device was last looking at.
    expect(resolved.openTabs).toEqual([{ id: resolved.activeTabId, canvasId: 'child' }])
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
      activeTabId: resolved.activeTabId,
      openTabs: [{ id: resolved.activeTabId, canvasId: 'root' }],
    })
  })

  it('round-trips an open tab row', () => {
    const resolved = resolvePersistedDeviceState({
      format: 'grovepad-device',
      v: 1,
      activeWorkspaceId: 'ws',
      activeCanvasId: 'child',
      canvasViews: {},
      activeTabId: 'tab-b',
      openTabs: [{ id: 'tab-a', canvasId: 'root' }, { id: 'tab-b', canvasId: 'child' }],
    }, topology)

    expect(resolved.activeTabId).toBe('tab-b')
    expect(resolved.openTabs).toEqual([
      { id: 'tab-a', canvasId: 'root' },
      { id: 'tab-b', canvasId: 'child' },
    ])
  })

  it('retires tabs whose canvas is gone from the document', () => {
    // The canvas a tab points at can be deleted on another device between
    // sessions, so the saved row is re-checked against the board on every read.
    const resolved = resolvePersistedDeviceState({
      format: 'grovepad-device',
      v: 1,
      activeWorkspaceId: 'ws',
      activeCanvasId: 'deleted',
      canvasViews: {},
      activeTabId: 'tab-b',
      openTabs: [{ id: 'tab-a', canvasId: 'root' }, { id: 'tab-b', canvasId: 'deleted' }],
    }, topology)

    expect(resolved.activeCanvasId).toBe('root')
    expect(resolved.openTabs).toEqual([{ id: 'tab-a', canvasId: 'root' }])
    expect(resolved.activeTabId).toBe('tab-a')
  })

  it('ignores a malformed tab row instead of failing the read', () => {
    const resolved = resolvePersistedDeviceState({
      format: 'grovepad-device',
      v: 1,
      activeWorkspaceId: 'ws',
      activeCanvasId: 'child',
      canvasViews: {},
      activeTabId: 42,
      openTabs: 'not-a-row',
    }, topology)

    expect(resolved.activeCanvasId).toBe('child')
    expect(resolved.openTabs).toEqual([{ id: resolved.activeTabId, canvasId: 'child' }])
  })
})
