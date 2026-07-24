import { describe, expect, it } from 'vitest'
import { createCanvasStoreBridge } from './canvasStoreBridge'
import { LOCAL_STORE_ORIGIN, writeCanvasSnapshot } from './yjsCanvas'
import { useWidgetStore } from '../store/useWidgetStore'
import type { Widget } from '../types/spatial'
import { mergeCanvasIntoBoard } from './canvasStoreBridge'

function widget(id: string, canvasId: string): Widget {
  return {
    id,
    canvasId,
    type: 'notes',
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 240, height: 200 },
    data: { text: id },
    metadata: { badges: [] },
  }
}

describe('mergeCanvasIntoBoard', () => {
  it('replaces one canvas while preserving every other canvas', () => {
    const oldA = widget('old-a', 'a')
    const keepB = widget('keep-b', 'b')
    const state = {
      widgets: { 'old-a': oldA, 'keep-b': keepB },
      relations: {
        old: { id: 'old', fromId: 'old-a', toId: 'old-a', type: 'cousin', isResolved: false },
        keep: { id: 'keep', fromId: 'keep-b', toId: 'keep-b', type: 'cousin', isResolved: false },
      },
      connections: {},
      glues: {},
      selectedIds: new Set(['old-a', 'keep-b']),
      widgetStructureVersion: 4,
      canvases: {
        a: { id: 'a', name: 'Old A', workspaceId: 'workspace', parentCanvasId: null },
        b: { id: 'b', name: 'Keep B', workspaceId: 'workspace', parentCanvasId: null },
      },
    } satisfies Parameters<typeof mergeCanvasIntoBoard>[0]
    const nextA = widget('next-a', 'a')

    const patch = mergeCanvasIntoBoard(state, {
      canvasId: 'a',
      canvas: { id: 'a', name: 'Shared A' },
      widgets: { 'next-a': nextA },
      relations: {},
      connections: {},
      glues: {},
    })

    expect(patch.widgets).toEqual({ 'keep-b': keepB, 'next-a': nextA })
    expect(patch.relations).toEqual({ keep: state.relations.keep })
    expect(patch.selectedIds).toEqual(new Set(['keep-b']))
    expect(patch.widgetStructureVersion).toBe(5)
    expect(patch.canvases?.a?.name).toBe('Shared A')
    expect(patch.canvases?.b?.name).toBe('Keep B')
  })

  it('removes dangling cross-canvas edges when a shared widget disappears', () => {
    const state = {
      widgets: { a: widget('a', 'a'), b: widget('b', 'b') },
      relations: {
        cross: { id: 'cross', fromId: 'a', toId: 'b', type: 'parent', isResolved: false },
      },
      connections: {}, glues: {}, selectedIds: new Set<string>(), widgetStructureVersion: 0,
      canvases: {
        a: { id: 'a', name: 'A', workspaceId: 'workspace', parentCanvasId: null },
        b: { id: 'b', name: 'B', workspaceId: 'workspace', parentCanvasId: null },
      },
    } satisfies Parameters<typeof mergeCanvasIntoBoard>[0]

    const patch = mergeCanvasIntoBoard(state, {
      canvasId: 'a', canvas: { id: 'a', name: 'A' }, widgets: {}, relations: {}, connections: {}, glues: {},
    })
    expect(patch.relations).toEqual({})
  })

  it('publishes collaborative undo as a local transport update', async () => {
    const previousCanvases = useWidgetStore.getState().canvases
    useWidgetStore.setState({
      canvases: {
        ...previousCanvases,
        '__bridge-undo-test__': {
          id: '__bridge-undo-test__', name: 'Undo test',
          workspaceId: useWidgetStore.getState().activeWorkspaceId, parentCanvasId: null,
        },
      },
    })
    const updates: Uint8Array[] = []
    const bridge = createCanvasStoreBridge({
      canvasId: '__bridge-undo-test__',
      onLocalUpdate: (update) => updates.push(update),
    })
    writeCanvasSnapshot(bridge.doc, {
      canvasId: '__bridge-undo-test__',
      canvas: { id: '__bridge-undo-test__', name: 'Undo test' },
      widgets: { note: widget('note', '__bridge-undo-test__') },
      relations: {}, connections: {}, glues: {},
    }, LOCAL_STORE_ORIGIN)
    bridge.undoManager.stopCapturing()

    bridge.undoManager.undo()
    await Promise.resolve()

    expect(updates).toHaveLength(2)
    bridge.destroy()
    useWidgetStore.setState({ canvases: previousCanvases })
  })
})
