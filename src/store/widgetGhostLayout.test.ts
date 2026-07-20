import { describe, expect, it } from 'vitest'
import type { GhostTreeNode } from '../types/spatial'
import { ghostNodeGrid } from '../utils/ghostTreePresentation'
import { layoutGhostTree } from './widgetGhostLayout'

function node(
  id: string,
  parentId: string | null,
  order: number,
  count: number,
): GhostTreeNode {
  return {
    id,
    parentId,
    order,
    x: 0,
    y: 0,
    widgetTypes: Array.from({ length: count }, () => 'notes'),
  }
}

describe('variable-size ghost tree layout', () => {
  it('centers the root and reserves room for square icon bundles', () => {
    const laidOut = layoutGhostTree([
      node('root', null, 0, 3),
      node('left', 'root', -1, 5),
      node('middle', 'root', 0, 1),
      node('right', 'root', 1, 7),
    ], 1_000, 2_000)
    const byId = new Map(laidOut.map((item) => [item.id, item]))
    const root = byId.get('root')!
    const rootSize = ghostNodeGrid(root.widgetTypes.length)
    expect(root.x + rootSize.width / 2).toBe(1_020)

    const children = ['left', 'middle', 'right'].map((id) => byId.get(id)!)
    for (let index = 1; index < children.length; index += 1) {
      const previous = children[index - 1]!
      const current = children[index]!
      const previousSize = ghostNodeGrid(previous.widgetTypes.length)
      expect(current.x).toBeGreaterThan(previous.x + previousSize.width)
    }
    expect(new Set(children.map((child) => child.y)).size).toBe(1)
    expect(children[0]!.y).toBeGreaterThan(root.y + rootSize.height)
  })

  it('anchors the original root while spacing top-level sibling subtrees', () => {
    const laidOut = layoutGhostTree([
      node('root', null, 0, 1),
      node('right-root', null, 1, 3),
      node('right-child', 'right-root', 0, 7),
    ], 2_000, 3_000)
    const byId = new Map(laidOut.map((item) => [item.id, item]))
    const root = byId.get('root')!
    const rightRoot = byId.get('right-root')!
    const rightChild = byId.get('right-child')!

    expect(root.x + ghostNodeGrid(1).width / 2).toBe(2_020)
    expect(rightRoot.x).toBeGreaterThan(root.x + ghostNodeGrid(1).width)
    expect(rightRoot.y).toBe(root.y)
    expect(rightChild.y).toBeGreaterThan(rightRoot.y + ghostNodeGrid(3).height)
  })
})
