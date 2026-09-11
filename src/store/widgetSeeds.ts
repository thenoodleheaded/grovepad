import type { CanvasMeta, Relation, Widget, Workspace } from '../types/spatial'

export const SEED_WORKSPACE_ID = 'ws-default'

/**
 * The root canvas id for a brand-new board.
 *
 * This used to be the constant `'canvas-origin'`, which meant every Grovepad
 * install in the world named its default canvas the same thing. A canvas id is
 * not decoration: it is the primary key of `canvas_collaborations` and the
 * folder board media is filed under, so one shared literal collapsed every
 * account into a single namespace — the first person to register it owned the
 * row everyone else's default board resolved to. Minted per install now, so two
 * boards can never collide.
 *
 * The workspace id stays constant deliberately: it is device-local, never
 * leaves this machine, and nothing keys a shared resource on it.
 */
export function createSeedRootCanvasId(): string {
  return crypto.randomUUID()
}

export function createSeedWorkspaces(rootCanvasId: string): Record<string, Workspace> {
  return {
    [SEED_WORKSPACE_ID]: {
      id: SEED_WORKSPACE_ID,
      name: 'My Workspace',
      rootCanvasId,
      createdAt: Date.now(),
      sortIndex: 0,
      tint: '#84cc16',
    },
  }
}

export function createSeedCanvases(rootCanvasId: string): Record<string, CanvasMeta> {
  return {
    [rootCanvasId]: {
      id: rootCanvasId,
      name: 'Origin',
      workspaceId: SEED_WORKSPACE_ID,
      parentCanvasId: null,
    },
  }
}

export function createSeedWidgets(): Record<string, Widget> {
  return {}
}

export function createSeedRelations(): Record<string, Relation> {
  return {}
}
