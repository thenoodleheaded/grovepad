import { describe, expect, it } from 'vitest'
import type { HydratedPersistedBoard, PersistedBoard } from '../types/persistence'
import currentBoardFixture from './fixtures/boards/v2.json?raw'
import unknownBoardFixture from './fixtures/boards/v2-unknown.json?raw'
import futureBoardFixture from './fixtures/boards/v3.json?raw'
import truncatedBoardFixture from './fixtures/boards/truncated.json.txt?raw'
import {
  getFuturePersistedBoardVersion,
  getOpaqueWidgetType,
  isPersistedBoardFromNewerVersion,
  migrateLegacyBoard,
  parsePersistedBoard,
  serializePersistedBoard,
} from './persistedBoardSchema'

function validBoard(): HydratedPersistedBoard {
  return {
    format: 'grovepad-board',
    v: 2,
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
    glues: {},
    activePacks: [],
    activeWorkspaceId: 'workspace',
    activeCanvasId: 'canvas',
    canvasViews: { canvas: { pan: { x: 10, y: 20 }, zoom: 1 } },
  }
}

function withoutEmbeddedDeviceState(value: Record<string, unknown>): Record<string, unknown> {
  const document = { ...value }
  Reflect.deleteProperty(document, 'activeWorkspaceId')
  Reflect.deleteProperty(document, 'activeCanvasId')
  Reflect.deleteProperty(document, 'canvasViews')
  return document
}

describe('persisted board schema', () => {
  it('reconciles interrupted automations and removes unprotected secret material on hydration', () => {
    const source = validBoard()
    source.widgets.alpha = {
      ...source.widgets.alpha!,
      type: 'http_request',
      data: { label: 'HTTP', input: '', output: '', config: '{}', mode: 'standard', enabled: true, running: true, count: 0, concurrency: 1, lastRunAt: null, lastError: '', items: [] },
    }
    source.widgets.bravo = {
      ...source.widgets.bravo!,
      type: 'secret_reference',
      data: { label: 'Secret', input: 'token-raw', output: 'token-raw', config: '{"secret":"token-raw"}', mode: 'standard', enabled: true, running: false, count: 1, concurrency: 1, lastRunAt: 1, lastError: '', items: [] },
    }
    const parsed = parsePersistedBoard(source)!
    expect(parsed.widgets.alpha?.data).toMatchObject({ running: false })
    expect((parsed.widgets.alpha!.data as unknown as { lastError: string }).lastError).toMatch(/interrupted/i)
    expect(parsed.widgets.bravo?.data).toMatchObject({ input: '', output: '', config: '{}', enabled: false })
    expect(JSON.stringify(parsed.widgets.bravo?.data)).not.toContain('token-raw')
  })

  it('accepts a valid board without changing its canonical entities', () => {
    const source = validBoard()
    const parsed = parsePersistedBoard(source)
    expect(parsed?.widgets).toEqual(source.widgets)
    expect(parsed?.activeCanvasId).toBe('canvas')
  })

  it('retires saved divider widgets and any edges that depended on them', () => {
    const source = validBoard()
    ;(source.widgets as Record<string, unknown>).divider = {
      ...source.widgets.alpha,
      id: 'divider',
      type: 'divider',
      title: 'Old section break',
      data: { label: 'Section' },
    }
    source.relations.toDivider = {
      id: 'toDivider',
      fromId: 'alpha',
      toId: 'divider',
      type: 'parent',
      isResolved: true,
    }

    const parsed = parsePersistedBoard(source)

    expect(parsed?.widgets).not.toHaveProperty('divider')
    expect(parsed?.relations).not.toHaveProperty('toDivider')
  })

  it('grandfathers version-2 payloads written before embedded metadata existed', () => {
    const source: Record<string, unknown> = { ...validBoard() }
    Reflect.deleteProperty(source, 'format')
    Reflect.deleteProperty(source, 'v')

    expect(parsePersistedBoard(source)).toMatchObject({
      format: 'grovepad-board',
      v: 2,
    })
  })

  it('rejects a payload for a different format or reader version', () => {
    expect(parsePersistedBoard({ ...validBoard(), format: 'another-app' })).toBeNull()
    expect(parsePersistedBoard({ ...validBoard(), v: 3 })).toBeNull()
    expect(isPersistedBoardFromNewerVersion({ ...validBoard(), v: 3 })).toBe(true)
    expect(getFuturePersistedBoardVersion({ ...validBoard(), v: 3 })).toBe(3)
    expect(isPersistedBoardFromNewerVersion({ ...validBoard(), v: 1 })).toBe(false)
  })

  it('preserves unknown widget types and future fields without exposing internals', () => {
    const fixture = JSON.parse(unknownBoardFixture) as Record<string, unknown>
    const parsed = parsePersistedBoard(fixture)
    expect(parsed).not.toBeNull()

    const opaqueWidget = parsed!.widgets.future
    expect(opaqueWidget?.type).toBe('notes')
    expect(opaqueWidget && getOpaqueWidgetType(opaqueWidget)).toBe('quantum_planner')
    expect(parsed!.relations.futureRelation).toBeDefined()
    expect(parsed!.relations.futureRelationKind).toBeUndefined()
    expect(parsed!.connections.futureConnectionKind).toBeUndefined()
    expect(parsed!.connections.futureTransform).toBeUndefined()
    expect(parsed!.glues.futureGlue?.widgetIds).toEqual(['alpha', 'future'])
    // A glue with too few surviving members is dropped, and legacy `groups`
    // records are discarded entirely — grouping no longer exists.
    expect(parsed!.glues.malformedGlue).toBeUndefined()
    expect(parsed).not.toHaveProperty('groups')
    expect(parsed!.persistenceUnknownFields).not.toHaveProperty('groups')
    expect(parsed!.activePacks).toEqual(['life'])
    expect(parsed!.persistenceUnknownRelations).toHaveProperty('futureRelationKind')
    expect(parsed!.persistenceUnknownConnections).toHaveProperty('futureConnectionKind')
    expect(parsed!.persistenceUnknownConnections).toHaveProperty('futureTransform')
    expect(Object.keys(parsed!)).not.toContain('persistenceUnknownFields')
    expect(Object.keys(parsed!)).not.toContain('persistenceUnknownRelations')

    // Normal immutable widget updates retain the symbol-backed opaque source.
    parsed!.widgets.future = {
      ...opaqueWidget!,
      position: { x: 999, y: 999 },
    }
    const serialized = serializePersistedBoard(parsed!) as PersistedBoard & Record<string, unknown>
    // The write boundary drops what parsing deliberately discarded: the
    // legacy `groups` record and the malformed one-member glue.
    const expected = withoutEmbeddedDeviceState(fixture)
    Reflect.deleteProperty(expected, 'groups')
    expected.glues = { futureGlue: (expected.glues as Record<string, unknown>).futureGlue }
    expect(serialized).toEqual(expected)
    expect(serialized.futureBoardField).toEqual({ mode: 'tomorrow' })

    parsed!.activePacks = []
    expect(serializePersistedBoard(parsed!).activePacks).toEqual(['quantum_research'])
    parsed!.activePacks = ['software_eng']
    expect(serializePersistedBoard(parsed!).activePacks).toEqual([
      'quantum_research',
      'software_eng',
    ])
  })

  it('recognizes frozen future-version and truncated fixtures without accepting them', () => {
    const future = JSON.parse(futureBoardFixture) as unknown
    expect(isPersistedBoardFromNewerVersion(future)).toBe(true)
    expect(parsePersistedBoard(future)).toBeNull()
    expect(() => JSON.parse(truncatedBoardFixture)).toThrow()
  })

  it('canonicalizes runtime-only widget state before writing', () => {
    const source = validBoard()
    source.widgets.alpha = {
      ...source.widgets.alpha!,
      isHydrating: true,
    }
    source.widgets.bravo = {
      ...source.widgets.bravo!,
      type: 'ai_generator',
      data: { prompt: 'Build a launch plan', status: 'generating' },
    } as unknown as PersistedBoard['widgets'][string]

    const serialized = serializePersistedBoard(source)
    expect(serialized.widgets.alpha).not.toHaveProperty('isHydrating')
    expect(serialized.widgets.bravo?.data).toMatchObject({ status: 'idle' })
    expect(source.widgets.alpha?.isHydrating).toBe(true)
  })

  it('reads the frozen embedded-device fixture and writes a document-only payload', () => {
    const fixture = JSON.parse(currentBoardFixture) as Record<string, unknown>
    const parsed = parsePersistedBoard(fixture)
    expect(parsed).not.toBeNull()
    expect(serializePersistedBoard(parsed!)).toEqual(withoutEmbeddedDeviceState(fixture))
    expect(serializePersistedBoard(parsed!)).not.toHaveProperty('activeWorkspaceId')
    expect(serializePersistedBoard(parsed!)).not.toHaveProperty('activeCanvasId')
    expect(serializePersistedBoard(parsed!)).not.toHaveProperty('canvasViews')
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
    source.glues.glue = {
      id: 'glue',
      widgetIds: ['alpha', 'invalid'],
    }

    const parsed = parsePersistedBoard(source)
    expect(Object.keys(parsed?.widgets ?? {})).toEqual(['alpha', 'bravo'])
    expect(parsed?.relations).toEqual({})
    expect(parsed?.glues).toEqual({})
  })

  it('clamps saved camera zoom during validation', () => {
    const source = validBoard()
    source.canvasViews.canvas!.zoom = Number.MAX_SAFE_INTEGER
    expect(parsePersistedBoard(source)?.canvasViews.canvas?.zoom).toBe(3)
  })

  it('upgrades legacy bullet strings to stable item ids', () => {
    const source = validBoard()
    source.widgets.alpha = {
      ...source.widgets.alpha!,
      type: 'bullets',
      data: { items: ['First', 'Second'] },
    } as unknown as PersistedBoard['widgets'][string]

    expect(parsePersistedBoard(source)?.widgets.alpha?.data).toEqual({
      items: [
        { id: 'alpha:bullet:0', text: 'First' },
        { id: 'alpha:bullet:1', text: 'Second' },
      ],
    })
  })

  it('keeps future fields nested inside known widget data', () => {
    const source = validBoard()
    source.widgets.alpha = {
      ...source.widgets.alpha!,
      type: 'bullets',
      data: { items: [{ id: 'bullet-1', text: 'First', futureColor: 'ultraviolet' }] },
    } as unknown as PersistedBoard['widgets'][string]

    expect(parsePersistedBoard(source)?.widgets.alpha?.data).toEqual({
      items: [{ id: 'bullet-1', text: 'First', futureColor: 'ultraviolet' }],
    })
  })

  it('resets an interrupted generator request during hydration', () => {
    const source = validBoard()
    source.widgets.alpha = {
      ...source.widgets.alpha!,
      type: 'ai_generator',
      data: { prompt: 'Build a launch plan', status: 'generating' },
    } as unknown as PersistedBoard['widgets'][string]

    expect(parsePersistedBoard(source)?.widgets.alpha?.data).toEqual({
      prompt: 'Build a launch plan',
      status: 'idle',
    })
  })

  it('migrates a flat v1 widget into a valid workspace and canvas', () => {
    const source = validBoard()
    const legacyWidget = { ...source.widgets.alpha!, canvasId: undefined }
    const migrated = migrateLegacyBoard({ widgets: { alpha: legacyWidget } })
    expect(migrated?.widgets.alpha?.canvasId).toBe('canvas-origin')
    expect(migrated?.workspaces['ws-default']?.rootCanvasId).toBe('canvas-origin')
  })
})
