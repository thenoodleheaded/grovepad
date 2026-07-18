import { describe, expect, it } from 'vitest'
import type { HydratedPersistedBoard, PersistedBoard } from '../types/persistence'
import { planBoardCanvasEmbedding } from './boardCanvasEmbedding'
import { mergePersistedBoardWorkspaces } from './boardWorkspaceMerge'

function board(name: string): HydratedPersistedBoard {
  return {
    format: 'grovepad-board',
    v: 2,
    workspaces: {
      workspace: {
        id: 'workspace',
        name,
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
      note: {
        id: 'note',
        type: 'notes',
        title: `${name} note`,
        canvasId: 'canvas',
        position: { x: 0, y: 0 },
        size: { width: 240, height: 160 },
        data: { text: name },
        metadata: { badges: [] },
      },
    },
    relations: {},
    connections: {},
    groups: {},
    activePacks: [],
    activeWorkspaceId: 'workspace',
    activeCanvasId: 'canvas',
    canvasViews: {},
  }
}

function ids(): () => string {
  let index = 0
  return () => `fresh-${++index}`
}

describe('board import flows', () => {
  it('keeps both versions when merging workspaces with colliding ids', () => {
    const cloud = board('Cloud')
    const local = board('Local')
    const merged = mergePersistedBoardWorkspaces(
      cloud as PersistedBoard,
      local as PersistedBoard,
      { incomingLabel: 'Local', idFactory: ids() },
    )

    expect(Object.values(merged.workspaces).map((workspace) => workspace.name)).toEqual([
      'Cloud',
      'Local (Local copy)',
    ])
    expect(Object.keys(merged.widgets)).toHaveLength(2)
    for (const widget of Object.values(merged.widgets)) {
      expect(merged.canvases[widget.canvasId]).toBeDefined()
    }
  })

  it('embeds a one-workspace board directly behind one Canvas card', () => {
    const current = board('Current')
    const imported = board('Imported')
    const embedding = planBoardCanvasEmbedding(current, imported, {
      title: 'Project archive',
      position: { x: 123, y: 77 },
      idFactory: ids(),
    })

    const root = embedding.widgets[embedding.rootWidgetId]!
    expect(root.type).toBe('canvas_node')
    expect(root.title).toBe('Project archive')
    expect(root.canvasId).toBe(current.activeCanvasId)
    expect(root.position).toEqual({ x: 120, y: 80 })
    const importedCanvasId = (root.data as { canvasId: string }).canvasId
    expect(embedding.canvases[importedCanvasId]?.parentCanvasId).toBe(current.activeCanvasId)
    expect(Object.values(embedding.widgets).some((widget) => (
      widget.title === 'Imported note' && widget.canvasId === importedCanvasId
    ))).toBe(true)
  })

  it('puts every workspace in a multi-workspace package behind the wrapper Canvas', () => {
    const current = board('Current')
    const imported = board('First')
    imported.workspaces.second = {
      id: 'second',
      name: 'Second',
      rootCanvasId: 'second-canvas',
      createdAt: 2,
    }
    imported.canvases['second-canvas'] = {
      id: 'second-canvas',
      name: 'Origin',
      workspaceId: 'second',
      parentCanvasId: null,
    }

    const embedding = planBoardCanvasEmbedding(current, imported, {
      title: 'Two projects',
      position: { x: 0, y: 0 },
      idFactory: ids(),
    })
    const root = embedding.widgets[embedding.rootWidgetId]!
    const wrapperId = (root.data as { canvasId: string }).canvasId
    const workspaceCards = Object.values(embedding.widgets).filter(
      (widget) => widget.canvasId === wrapperId && widget.type === 'canvas_node',
    )

    expect(workspaceCards.map((widget) => widget.title)).toEqual(['First', 'Second'])
    for (const card of workspaceCards) {
      const targetId = (card.data as { canvasId: string }).canvasId
      expect(embedding.canvases[targetId]?.parentCanvasId).toBe(wrapperId)
    }
  })
})
