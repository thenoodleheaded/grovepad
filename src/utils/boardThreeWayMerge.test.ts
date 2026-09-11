import { describe, expect, it } from 'vitest'
import type { PersistedBoard } from '../types/persistence'
import type { Widget } from '../types/spatial'
import { makeWidget } from '../test/factories'
import { mergeBoardsThreeWay } from './boardThreeWayMerge'

// ---------------------------------------------------------------------------
// The whole point of the baseline is that these cases stop looking alike.
// Before it, every one of them was "the two boards differ" and the user was
// asked which to keep; each test below is one of those questions answered
// from evidence instead.
// ---------------------------------------------------------------------------

function board(widgets: Widget[], overrides: Partial<PersistedBoard> = {}): PersistedBoard {
  return {
    format: 'grovepad-board',
    v: 2,
    workspaces: {
      workspace: { id: 'workspace', name: 'Workspace', rootCanvasId: 'canvas', createdAt: 1 },
    },
    canvases: {
      canvas: { id: 'canvas', name: 'Canvas', workspaceId: 'workspace', parentCanvasId: null },
    },
    widgets: Object.fromEntries(widgets.map((widget) => [widget.id, widget])),
    relations: {},
    connections: {},
    glues: {},
    activePacks: [],
    ...overrides,
  }
}

function note(id: string, text: string): Widget {
  return makeWidget({ id, title: id, data: { text } })
}

let nextId = 0
const ids = () => `merged-${++nextId}`

describe('one side moved', () => {
  it('takes this device when only this device edited', () => {
    const base = board([note('a', 'one')])
    const local = board([note('a', 'two')])
    const merged = mergeBoardsThreeWay(base, local, base, ids)
    expect(merged.board.widgets.a?.data).toEqual({ text: 'two' })
    expect(merged.keptBothTitles).toEqual([])
  })

  it('takes the cloud when only another device edited', () => {
    const base = board([note('a', 'one')])
    const cloud = board([note('a', 'three')])
    const merged = mergeBoardsThreeWay(base, base, cloud, ids)
    expect(merged.board.widgets.a?.data).toEqual({ text: 'three' })
  })

  it('keeps a card added here and a card added there', () => {
    const base = board([note('a', 'one')])
    const local = board([note('a', 'one'), note('b', 'mine')])
    const cloud = board([note('a', 'one'), note('c', 'theirs')])
    const merged = mergeBoardsThreeWay(base, local, cloud, ids)
    expect(Object.keys(merged.board.widgets).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('deletion', () => {
  it('honors a delete made here that the cloud never touched', () => {
    const base = board([note('a', 'one'), note('b', 'two')])
    const local = board([note('a', 'one')])
    const merged = mergeBoardsThreeWay(base, local, base, ids)
    expect(merged.board.widgets.b).toBeUndefined()
  })

  it('honors a delete made elsewhere that this device never touched', () => {
    const base = board([note('a', 'one'), note('b', 'two')])
    const cloud = board([note('a', 'one')])
    const merged = mergeBoardsThreeWay(base, base, cloud, ids)
    expect(merged.board.widgets.b).toBeUndefined()
  })

  it('lets an edit beat a delete, in both directions', () => {
    const base = board([note('a', 'one')])
    const deletedHere = mergeBoardsThreeWay(base, board([]), board([note('a', 'edited')]), ids)
    expect(deletedHere.board.widgets.a?.data).toEqual({ text: 'edited' })
    const deletedThere = mergeBoardsThreeWay(base, board([note('a', 'edited')]), board([]), ids)
    expect(deletedThere.board.widgets.a?.data).toEqual({ text: 'edited' })
    // An edit that survives a delete is not a conflict — nothing is duplicated.
    expect(deletedHere.keptBothTitles).toEqual([])
    expect(deletedThere.keptBothTitles).toEqual([])
  })
})

describe('a genuine two-sided edit', () => {
  it('keeps both versions of the card instead of asking', () => {
    const base = board([note('a', 'one')])
    const local = board([note('a', 'mine')])
    const cloud = board([note('a', 'theirs')])
    const merged = mergeBoardsThreeWay(base, local, cloud, ids)
    // The cloud copy holds the shared id so other devices stay coherent.
    expect(merged.board.widgets.a?.data).toEqual({ text: 'theirs' })
    const copies = Object.values(merged.board.widgets).filter((widget) => widget.id !== 'a')
    expect(copies).toHaveLength(1)
    expect(copies[0]?.data).toEqual({ text: 'mine' })
    expect(copies[0]?.title).toBe('a (this device)')
    expect(merged.keptBothTitles).toEqual(['a (this device)'])
  })

  it('places the kept copy clear of the card it came from', () => {
    const base = board([note('a', 'one')])
    const local = board([makeWidget({ id: 'a', position: { x: 100, y: 200 }, data: { text: 'mine' } })])
    const cloud = board([note('a', 'theirs')])
    const copy = Object.values(mergeBoardsThreeWay(base, local, cloud, ids).board.widgets)
      .find((widget) => widget.id !== 'a')
    expect(copy?.position.x).toBe(100)
    expect(copy?.position.y).toBeGreaterThan(200 + 160)
  })

  it('never duplicates a card that both sides changed the same way', () => {
    const base = board([note('a', 'one')])
    const same = board([note('a', 'agreed')])
    const merged = mergeBoardsThreeWay(base, same, same, ids)
    expect(Object.keys(merged.board.widgets)).toEqual(['a'])
    expect(merged.keptBothTitles).toEqual([])
  })

  it('leaves this device in charge of names, so nothing renames under the cursor', () => {
    const base = board([note('a', 'one')])
    const local = board([note('a', 'one')], {
      workspaces: { workspace: { id: 'workspace', name: 'Renamed here', rootCanvasId: 'canvas', createdAt: 1 } },
    })
    const cloud = board([note('a', 'one')], {
      workspaces: { workspace: { id: 'workspace', name: 'Renamed there', rootCanvasId: 'canvas', createdAt: 1 } },
    })
    const merged = mergeBoardsThreeWay(base, local, cloud, ids)
    expect(merged.board.workspaces.workspace?.name).toBe('Renamed here')
  })
})

describe('without lineage', () => {
  it('unions both sides rather than choosing one', () => {
    const local = board([note('a', 'mine')])
    const cloud = board([note('b', 'theirs')], {
      workspaces: { other: { id: 'other', name: 'Theirs', rootCanvasId: 'other-canvas', createdAt: 2 } },
      canvases: { 'other-canvas': { id: 'other-canvas', name: 'Theirs', workspaceId: 'other', parentCanvasId: null } },
    })
    const merged = mergeBoardsThreeWay(null, local, cloud, ids)
    expect(Object.keys(merged.board.widgets).sort()).toEqual(['a', 'b'])
    expect(Object.keys(merged.board.workspaces).sort()).toEqual(['other', 'workspace'])
  })

  it('cannot see a deletion, so nothing is lost by guessing', () => {
    // No base means "deleted here" is indistinguishable from "added there".
    const merged = mergeBoardsThreeWay(null, board([]), board([note('a', 'one')]), ids)
    expect(merged.board.widgets.a).toBeDefined()
  })
})

describe('domain packs', () => {
  it('unions packs turned on independently', () => {
    const base = board([], { activePacks: ['education'] })
    const local = board([], { activePacks: ['education', 'software_eng'] })
    const cloud = board([], { activePacks: ['education', 'life'] })
    expect(mergeBoardsThreeWay(base, local, cloud, ids).board.activePacks.sort())
      .toEqual(['education', 'life', 'software_eng'])
  })

  it('honors a pack switched off on one side', () => {
    const base = board([], { activePacks: ['education', 'software_eng'] })
    const local = board([], { activePacks: ['education'] })
    const cloud = board([], { activePacks: ['education', 'software_eng'] })
    expect(mergeBoardsThreeWay(base, local, cloud, ids).board.activePacks).toEqual(['education'])
  })
})

describe('idempotence', () => {
  it('re-merging an already merged board changes nothing', () => {
    const base = board([note('a', 'one')])
    const local = board([note('a', 'one'), note('b', 'mine')])
    const cloud = board([note('a', 'one'), note('c', 'theirs')])
    const first = mergeBoardsThreeWay(base, local, cloud, ids).board
    const second = mergeBoardsThreeWay(first, first, first, ids).board
    expect(second).toEqual(first)
  })
})
