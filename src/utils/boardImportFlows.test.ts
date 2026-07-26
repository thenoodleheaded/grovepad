import { describe, expect, it } from 'vitest'
import type { HydratedPersistedBoard, PersistedBoard } from '../types/persistence'
import type { Widget } from '../types/spatial'
import { makeWidget } from '../test/factories'
import { planBoardCanvasEmbedding } from './boardCanvasEmbedding'
import { mergePersistedBoardWorkspaces } from './boardWorkspaceMerge'
import {
  getOpaqueWidgetType,
  parsePersistedBoard,
  serializePersistedBoard,
} from './persistedBoardSchema'

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
      note: makeWidget({ id: 'note', title: `${name} note`, data: { text: name } }),
    },
    relations: {},
    connections: {},
    glues: {},
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

/** A package from a newer build: one known widget plus one unknown type. */
function senderBoardWithFutureWidget(): HydratedPersistedBoard {
  const sender = board('Sender')
  sender.widgets.future = {
    id: 'future',
    canvasId: 'canvas',
    type: 'quantum_planner',
    title: 'Quantum planner',
    position: { x: 40, y: 40 },
    size: { width: 320, height: 200 },
    data: { horizon: 12 },
    metadata: { badges: [] },
  } as unknown as Widget

  return sender
}

function transported<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

function opaqueTypes(widgets: Record<string, Widget>): (string | null)[] {
  return Object.values(widgets).map(getOpaqueWidgetType).filter(Boolean)
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

  it('keeps an imported future-type widget alive across the next save and reload', () => {
    const current = board('Current')
    const imported = parsePersistedBoard(transported(senderBoardWithFutureWidget()))
    expect(imported).not.toBeNull()
    expect(opaqueTypes(imported!.widgets)).toEqual(['quantum_planner'])

    const embedding = planBoardCanvasEmbedding(current, imported!, {
      title: 'Sender archive',
      position: { x: 0, y: 0 },
      idFactory: ids(),
    })
    const saved = serializePersistedBoard({
      ...current,
      canvases: { ...current.canvases, ...embedding.canvases },
      widgets: { ...current.widgets, ...embedding.widgets },
      relations: embedding.relations,
      connections: embedding.connections,
      glues: embedding.glues,
    })

    // Relocating a placeholder must not leave its persisted record pointing at
    // the sender's ids: the reader drops any row that disagrees with its key.
    for (const [id, widget] of Object.entries(saved.widgets)) {
      expect(widget.id).toBe(id)
      expect(saved.canvases[widget.canvasId]).toBeDefined()
    }

    const reloaded = parsePersistedBoard(transported(saved))
    expect(reloaded).not.toBeNull()
    expect(Object.keys(reloaded!.widgets)).toHaveLength(Object.keys(saved.widgets).length)
    expect(opaqueTypes(reloaded!.widgets)).toEqual(['quantum_planner'])
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
