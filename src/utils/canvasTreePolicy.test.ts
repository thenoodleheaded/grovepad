import { describe, expect, it } from 'vitest'
import type { CanvasMeta } from '../types/spatial'
import { canvasParentTargets } from './canvasTreePolicy'

const canvases: Record<string, CanvasMeta> = {
  root: { id: 'root', name: 'Origin', workspaceId: 'one', parentCanvasId: null },
  parent: { id: 'parent', name: 'Parent', workspaceId: 'one', parentCanvasId: 'root' },
  child: { id: 'child', name: 'Child', workspaceId: 'one', parentCanvasId: 'parent' },
  peer: { id: 'peer', name: 'Peer', workspaceId: 'one', parentCanvasId: 'root' },
  remote: { id: 'remote', name: 'Remote', workspaceId: 'two', parentCanvasId: null },
}

describe('canvas tree touch move policy', () => {
  it('offers same-workspace parents while excluding self and descendants', () => {
    expect(canvasParentTargets(canvases, 'parent').map((canvas) => canvas.id)).toEqual(['peer'])
  })
})
