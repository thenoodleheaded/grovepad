import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import {
  relationAnchorRegion,
  relationDropEndpoints,
  strictParentHasVerticalCorridor,
  strictParentGeometryOrder,
  usesStrictParentGeometry,
  usesStrictRelations,
} from './relationPolicy'

const widget = (id: string, y: number): Widget => ({
  id,
  type: 'notes',
  title: id,
  canvasId: 'canvas',
  position: { x: 0, y },
  size: { width: 200, height: 120 },
  data: { text: '' },
  metadata: { badges: [] },
})

describe('relation strictness', () => {
  it('keeps every canvas free-form, including boards with the legacy flag', () => {
    expect(usesStrictRelations(undefined)).toBe(false)
    expect(usesStrictRelations({
      id: 'canvas',
      name: 'Canvas',
      workspaceId: 'workspace',
      parentCanvasId: null,
    })).toBe(false)
    expect(usesStrictRelations({
      id: 'canvas',
      name: 'Canvas',
      workspaceId: 'workspace',
      parentCanvasId: null,
      relationStrict: true,
    })).toBe(false)
    expect(usesStrictRelations({
      id: 'canvas',
      name: 'Canvas',
      workspaceId: 'workspace',
      parentCanvasId: null,
      relationStrict: false,
    })).toBe(false)
  })

  it('assigns the upper widget as parent only in strict mode', () => {
    const lowerSource = widget('source', 400)
    const upperTarget = widget('target', 0)
    expect(relationDropEndpoints(lowerSource, upperTarget, true)).toEqual(['target', 'source'])
    expect(relationDropEndpoints(lowerSource, upperTarget, false)).toEqual(['source', 'target'])
  })

  it('opens the whole widget border to parent links in free mode', () => {
    expect(relationAnchorRegion('parent', 'from', true)).toBe('lower')
    expect(relationAnchorRegion('parent', 'to', true)).toBe('upper')
    expect(relationAnchorRegion('parent', 'from', false)).toBe('any')
    expect(relationAnchorRegion('parent', 'to', false)).toBe('any')
    expect(relationAnchorRegion('cousin', 'from', true)).toBe('any')
    expect(usesStrictParentGeometry('parent', true)).toBe(true)
    expect(usesStrictParentGeometry('parent', false)).toBe(false)
  })

  it('orders strict paint from upper to lower even for a reversed free-form record', () => {
    const lower = { center: { x: 0, y: 500 }, id: 'lower' }
    const upper = { center: { x: 400, y: 100 }, id: 'upper' }
    expect(strictParentGeometryOrder(lower, upper)).toEqual([upper, lower])
  })

  it('uses strict rails only when the parent and child have a visible corridor', () => {
    const parent = { center: { y: 100 }, halfH: 60 }
    expect(strictParentHasVerticalCorridor(
      parent,
      { center: { y: 260 }, halfH: 60 },
      12,
    )).toBe(true)
    expect(strictParentHasVerticalCorridor(
      parent,
      { center: { y: 190 }, halfH: 60 },
      12,
    )).toBe(false)
  })

})
