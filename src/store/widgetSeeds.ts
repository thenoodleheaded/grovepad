import type { CanvasMeta, Relation, Widget, Workspace } from '../types/spatial'
import { GRID_SIZE } from '../types/spatial'
import { buildWidget } from './widgetSizing'

export const SEED_WORKSPACE_ID = 'ws-default'
export const SEED_ROOT_CANVAS_ID = 'canvas-origin'

export function createSeedWorkspaces(): Record<string, Workspace> {
  return {
    [SEED_WORKSPACE_ID]: {
      id: SEED_WORKSPACE_ID,
      name: 'My Workspace',
      rootCanvasId: SEED_ROOT_CANVAS_ID,
      createdAt: Date.now(),
      sortIndex: 0,
      tint: '#84cc16',
    },
  }
}

export function createSeedCanvases(): Record<string, CanvasMeta> {
  return {
    [SEED_ROOT_CANVAS_ID]: {
      id: SEED_ROOT_CANVAS_ID,
      name: 'Origin',
      workspaceId: SEED_WORKSPACE_ID,
      parentCanvasId: null,
    },
  }
}

export function createSeedWidgets(): Record<string, Widget> {
  const C = GRID_SIZE
  const root = SEED_ROOT_CANVAS_ID
  const seeds: Widget[] = [
    buildWidget('w-notes-1', 'notes', 'Ideas', root, { x: 120, y: 120 }, { width: 320, height: C * 5 }),
    buildWidget('w-ai-1', 'ai_generator', 'AI Generator', root, { x: 480, y: 120 }, { width: 320, height: C * 4 }),
    buildWidget('w-table-1', 'table', 'Project Ledger', root, { x: 120, y: 400 }, { width: 360, height: C * 4 }),
    buildWidget('w-budget-1', 'budget', 'Budget', root, { x: 520, y: 400 }, { width: 320, height: C * 5 }),
    buildWidget('w-timeline-1', 'timeline', 'Roadmap', root, { x: 120, y: 680 }, { width: 400, height: C * 3 }),
  ]
  return Object.fromEntries(seeds.map((w) => [w.id, w]))
}

export function createSeedRelations(): Record<string, Relation> {
  return {
    'rel-seed-parent': {
      id: 'rel-seed-parent',
      fromId: 'w-notes-1',
      toId: 'w-table-1',
      type: 'parent',
      isResolved: true,
    },
    'rel-seed-blocker': {
      id: 'rel-seed-blocker',
      fromId: 'w-table-1',
      toId: 'w-budget-1',
      type: 'blocker',
      isResolved: false,
    },
  }
}

