import { describe, expect, it } from 'vitest'
import type { Relation } from '../types/relations'
import type { Widget } from '../types/spatial'
import {
  canvasOutline,
  MCP_TREE_LIMITS,
  normalizeMcpTreeDraft,
  thoughtPlanFromMcpTree,
} from './treeContract'

describe('MCP tree contract', () => {
  it('normalizes a tree and produces Note widgets with parent relations', () => {
    const draft = normalizeMcpTreeDraft({
      nodes: [
        { id: 'root', title: ' Launch plan ' },
        { id: 'research', title: 'Research', parentId: 'root', note: 'Talk to users' },
        { id: 'interviews', title: 'Interviews', parentId: 'research' },
      ],
    }, 'canvas-1', { x: 40, y: 80 })

    expect(draft.nodes.map((node) => node.depth)).toEqual([0, 1, 2])
    expect(draft.nodes[0]?.title).toBe('Launch plan')
    const plan = thoughtPlanFromMcpTree(draft)
    expect(plan.nodes.map((node) => node.widgetType)).toEqual(['notes', 'notes', 'notes'])
    expect(plan.relations).toEqual([
      { fromTemporaryId: 'root', toTemporaryId: 'research', type: 'parent' },
      { fromTemporaryId: 'research', toTemporaryId: 'interviews', type: 'parent' },
    ])
  })

  it('rejects missing parents, cycles, and trees deeper than the limit', () => {
    expect(() => normalizeMcpTreeDraft({
      nodes: [{ id: 'a', title: 'A', parentId: 'missing' }],
    }, 'canvas-1', { x: 0, y: 0 })).toThrow(/missing parent/)

    expect(() => normalizeMcpTreeDraft({
      nodes: [
        { id: 'a', title: 'A', parentId: 'b' },
        { id: 'b', title: 'B', parentId: 'a' },
      ],
    }, 'canvas-1', { x: 0, y: 0 })).toThrow(/cycle/)

    const nodes = Array.from({ length: MCP_TREE_LIMITS.maxDepth + 2 }, (_, index) => ({
      id: `node-${index}`,
      title: `Node ${index}`,
      parentId: index === 0 ? null : `node-${index - 1}`,
    }))
    expect(() => normalizeMcpTreeDraft({ nodes }, 'canvas-1', { x: 0, y: 0 })).toThrow(/depth/)
  })

  it('returns a bounded semantic outline instead of raw board state', () => {
    const note = (id: string, y: number): Widget => ({
      id,
      canvasId: 'canvas-1',
      type: 'notes',
      title: id,
      position: { x: 0, y },
      size: { width: 320, height: 200 },
      data: { text: `${id} text`, mode: 'plain' },
      metadata: { badges: [] },
    })
    const widgets = { child: note('child', 20), root: note('root', 0) }
    const relation: Relation = {
      id: 'relation-1', fromId: 'root', toId: 'child', type: 'parent', isResolved: false,
    }

    expect(canvasOutline(widgets, { [relation.id]: relation }, 'canvas-1')).toEqual({
      nodes: [
        { id: 'root', title: 'root', type: 'notes', parentIds: [], note: 'root text' },
        { id: 'child', title: 'child', type: 'notes', parentIds: ['root'], note: 'child text' },
      ],
      truncated: false,
    })
  })
})
