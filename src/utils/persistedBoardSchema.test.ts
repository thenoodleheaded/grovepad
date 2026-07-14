import { describe, expect, it } from 'vitest'
import type { PersistedBoard } from '../types/persistence'
import { migrateLegacyBoard, parsePersistedBoard } from './persistedBoardSchema'

function validBoard(): PersistedBoard {
  return {
    workspaces: {
      workspace: {
        id: 'workspace',
        name: 'Workspace',
        rootCanvasId: 'canvas',
        createdAt: 1,
      },
    },
    canvases: {
      canvas: {
        id: 'canvas',
        name: 'Origin',
        workspaceId: 'workspace',
        parentCanvasId: null,
      },
    },
    widgets: {
      alpha: {
        id: 'alpha',
        type: 'notes',
        title: 'Alpha',
        canvasId: 'canvas',
        position: { x: 0, y: 0 },
        size: { width: 240, height: 160 },
        data: { text: '' },
        metadata: { badges: [] },
      },
      bravo: {
        id: 'bravo',
        type: 'notes',
        title: 'Bravo',
        canvasId: 'canvas',
        position: { x: 320, y: 0 },
        size: { width: 240, height: 160 },
        data: { text: '' },
        metadata: { badges: [] },
      },
    },
    relations: {},
    connections: {},
    groups: {},
    activePacks: [],
    activeWorkspaceId: 'workspace',
    activeCanvasId: 'canvas',
    canvasViews: { canvas: { pan: { x: 10, y: 20 }, zoom: 1 } },
  }
}

describe('persisted board schema', () => {
  it('accepts a valid board without changing its canonical entities', () => {
    const source = validBoard()
    const parsed = parsePersistedBoard(source)
    expect(parsed?.widgets).toEqual(source.widgets)
    expect(parsed?.activeCanvasId).toBe('canvas')
  })

  it('drops references to invalid widgets while preserving valid content', () => {
    const source = validBoard()
    ;(source.widgets as Record<string, unknown>).invalid = { id: 'invalid', type: 'not-a-widget' }
    source.relations.relation = {
      id: 'relation',
      fromId: 'alpha',
      toId: 'invalid',
      type: 'parent',
      isResolved: false,
    }
    source.groups.group = {
      id: 'group',
      label: 'Broken group',
      widgetIds: ['alpha', 'invalid'],
      color: '#6366f1',
    }

    const parsed = parsePersistedBoard(source)
    expect(Object.keys(parsed?.widgets ?? {})).toEqual(['alpha', 'bravo'])
    expect(parsed?.relations).toEqual({})
    expect(parsed?.groups).toEqual({})
  })

  it('clamps saved camera zoom during validation', () => {
    const source = validBoard()
    source.canvasViews.canvas!.zoom = Number.MAX_SAFE_INTEGER
    expect(parsePersistedBoard(source)?.canvasViews.canvas?.zoom).toBe(3)
  })

  it('migrates a flat v1 widget into a valid workspace and canvas', () => {
    const source = validBoard()
    const legacyWidget = { ...source.widgets.alpha!, canvasId: undefined }
    const migrated = migrateLegacyBoard({ widgets: { alpha: legacyWidget } })
    expect(migrated?.widgets.alpha?.canvasId).toBe('canvas-origin')
    expect(migrated?.workspaces['ws-default']?.rootCanvasId).toBe('canvas-origin')
  })
})
