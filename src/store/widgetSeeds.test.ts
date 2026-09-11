import { describe, expect, it } from 'vitest'
import {
  SEED_WORKSPACE_ID,
  createSeedCanvases,
  createSeedRelations,
  createSeedRootCanvasId,
  createSeedWidgets,
  createSeedWorkspaces,
} from './widgetSeeds'

describe('new account board seed', () => {
  it('keeps a valid blank canvas without adding demo content', () => {
    const rootCanvasId = createSeedRootCanvasId()
    const workspaces = createSeedWorkspaces(rootCanvasId)
    const canvases = createSeedCanvases(rootCanvasId)

    expect(Object.keys(workspaces)).toEqual([SEED_WORKSPACE_ID])
    expect(workspaces[SEED_WORKSPACE_ID]?.rootCanvasId).toBe(rootCanvasId)
    expect(canvases[rootCanvasId]).toMatchObject({
      workspaceId: SEED_WORKSPACE_ID,
      parentCanvasId: null,
    })
    expect(createSeedWidgets()).toEqual({})
    expect(createSeedRelations()).toEqual({})
  })

  it('mints a fresh root canvas id per board', () => {
    // A constant here would put every install's default canvas in one shared
    // namespace: canvas ids key `canvas_collaborations` and the media folder, so
    // whoever registered the shared literal first owned everyone's root canvas.
    const ids = new Set(Array.from({ length: 50 }, () => createSeedRootCanvasId()))
    expect(ids.size).toBe(50)
    expect([...ids].every((id) => /^[0-9a-f-]{36}$/i.test(id))).toBe(true)
    expect(ids.has('canvas-origin')).toBe(false)
  })
})
