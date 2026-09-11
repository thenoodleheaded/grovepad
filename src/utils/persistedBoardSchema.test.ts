import { describe, expect, it } from 'vitest'
import type { HydratedPersistedBoard, PersistedBoard } from '../types/persistence'
import { makeRelation, makeWidget } from '../test/factories'
import currentBoardFixture from './fixtures/boards/v2.json?raw'
import unknownBoardFixture from './fixtures/boards/v2-unknown.json?raw'
import futureBoardFixture from './fixtures/boards/v3.json?raw'
import truncatedBoardFixture from './fixtures/boards/truncated.json.txt?raw'
import { DELETED_WIDGET_TYPES } from '../widgets/deletedWidgetTypes'
import {
  getFuturePersistedBoardVersion,
  getOpaqueWidgetType,
  isPersistedBoardFromNewerVersion,
  remapLegacyRootCanvasId,
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
      alpha: makeWidget({ id: 'alpha', title: 'Alpha' }),
      bravo: makeWidget({ id: 'bravo', title: 'Bravo', position: { x: 320, y: 0 } }),
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

  it('drops saved divider widgets and any edges that depended on them', () => {
    const source = validBoard()
    ;(source.widgets as Record<string, unknown>).divider = {
      ...source.widgets.alpha,
      id: 'divider',
      type: 'divider',
      title: 'Old section break',
      data: { label: 'Section' },
    }
    source.relations.toDivider = makeRelation({ id: 'toDivider', fromId: 'alpha', toId: 'divider' })

    const parsed = parsePersistedBoard(source)

    expect(parsed?.widgets).not.toHaveProperty('divider')
    expect(parsed?.relations).not.toHaveProperty('toDivider')
  })

  it('drops every deleted card from a board that still holds one', () => {
    // These cards were removed from the product. A board saved while they
    // existed must come back without them — not as a converted card, and not
    // as a locked placeholder. This is the whole contract of the deletion.
    const source = validBoard()
    const widgets = source.widgets as Record<string, unknown>
    for (const type of DELETED_WIDGET_TYPES) {
      widgets[type] = {
        ...source.widgets.alpha,
        id: type,
        type,
        title: `Saved ${type}`,
        data: { text: 'whatever was in it' },
      }
    }

    const parsed = parsePersistedBoard(source)

    expect(parsed).not.toBeNull()
    for (const type of DELETED_WIDGET_TYPES) {
      expect(parsed?.widgets, `${type} survived hydration`).not.toHaveProperty(type)
    }
    // The surviving board is exactly the one that was valid to begin with.
    expect(Object.keys(parsed!.widgets).sort()).toEqual(Object.keys(validBoard().widgets).sort())
  })

  it('drops the edges and glue that named a deleted card', () => {
    const source = validBoard()
    ;(source.widgets as Record<string, unknown>).sticky = {
      ...source.widgets.alpha,
      id: 'sticky',
      type: 'sticky_note',
      title: 'Friday',
      data: { text: 'Ask Dana about the invoice', color: 'pink' },
    }
    source.relations.toSticky = makeRelation({ id: 'toSticky', fromId: 'alpha', toId: 'sticky' })

    const parsed = parsePersistedBoard(source)

    expect(parsed?.widgets).not.toHaveProperty('sticky')
    expect(parsed?.relations).not.toHaveProperty('toSticky')
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
    expect(opaqueWidget?.type).toBe('text')
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
    // The fixture is frozen at the "notes" era; a renamed widget type reads
    // back under its live name, so "alpha" is the one deliberate difference.
    const expectedWidgets = expected.widgets as Record<string, Record<string, unknown>>
    expectedWidgets.alpha = { ...expectedWidgets.alpha, type: 'text' }
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
    // The fixture is frozen at the "notes" era; a renamed widget type is the
    // one deliberate way this round trip is not byte-for-byte — the record
    // reads back under its live name, not the name it was saved under.
    const expectedDocument = withoutEmbeddedDeviceState(fixture)
    const expectedWidgets = expectedDocument.widgets as Record<string, Record<string, unknown>>
    expectedWidgets.alpha = { ...expectedWidgets.alpha, type: 'text' }
    expect(serializePersistedBoard(parsed!)).toEqual(expectedDocument)
    expect(serializePersistedBoard(parsed!)).not.toHaveProperty('activeWorkspaceId')
    expect(serializePersistedBoard(parsed!)).not.toHaveProperty('activeCanvasId')
    expect(serializePersistedBoard(parsed!)).not.toHaveProperty('canvasViews')
  })

  it('drops references to invalid widgets while preserving valid content', () => {
    const source = validBoard()
    ;(source.widgets as Record<string, unknown>).invalid = { id: 'invalid', type: 'not-a-widget' }
    source.relations.relation = makeRelation({ id: 'relation', fromId: 'alpha', toId: 'invalid', isResolved: false })
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
    const rootCanvasId = migrated?.workspaces['ws-default']?.rootCanvasId
    // Minted, not the old shared literal: a constant here put every migrated
    // board's root canvas into one namespace that keys cloud collaboration rows
    // and the media folder.
    expect(rootCanvasId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(migrated?.widgets.alpha?.canvasId).toBe(rootCanvasId)
    expect(migrated?.canvases[rootCanvasId!]?.id).toBe(rootCanvasId)
    expect(migrated?.activeCanvasId).toBe(rootCanvasId)
  })

  it('moves a saved board off the shared root canvas id', () => {
    const board = validBoard()
    const legacy = {
      ...board,
      workspaces: { 'ws-default': { ...board.workspaces['ws-default']!, rootCanvasId: 'canvas-origin' } },
      canvases: {
        'canvas-origin': {
          id: 'canvas-origin',
          name: 'Origin',
          workspaceId: 'ws-default',
          parentCanvasId: null,
        },
      },
      widgets: { alpha: { ...board.widgets.alpha!, canvasId: 'canvas-origin' } },
      activeCanvasId: 'canvas-origin',
    }
    const remapped = remapLegacyRootCanvasId(
      legacy as unknown as Parameters<typeof remapLegacyRootCanvasId>[0],
      () => 'fresh-id',
    )
    expect(remapped.canvases['canvas-origin']).toBeUndefined()
    expect(remapped.canvases['fresh-id']?.id).toBe('fresh-id')
    expect(remapped.workspaces['ws-default']?.rootCanvasId).toBe('fresh-id')
    expect(remapped.widgets.alpha?.canvasId).toBe('fresh-id')
    expect(remapped.activeCanvasId).toBe('fresh-id')
  })

  it('leaves a board that never used the shared id untouched', () => {
    const board = validBoard()
    expect(remapLegacyRootCanvasId(board as unknown as Parameters<typeof remapLegacyRootCanvasId>[0]))
      .toBe(board)
  })
})
