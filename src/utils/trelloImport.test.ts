import { describe, expect, it } from 'vitest'
import type { ChecklistData, LinksData, TextData } from '../types/widgetDataCore'
import type { Widget } from '../types/spatial'
import { GLUE_GAP } from './glueGeometry'
import { describeTrelloImport, isTrelloExport, mapTrelloBoard } from './trelloImport'

const CANVAS_ID = 'canvas-1'

/**
 * A synthetic export in the shape Trello writes: lists and cards ordered by a
 * float `pos` rather than array order, one archived list, one archived card,
 * one card orphaned from its list, and one card carrying every kind of detail
 * a kanban column cannot hold.
 */
function fixture(): unknown {
  return {
    id: 'b1',
    name: 'Launch board',
    desc: 'Everything shipping this quarter.',
    closed: false,
    members: [{ id: 'm1', fullName: 'Ada Lovelace' }, { id: 'm2', initials: 'GH' }],
    lists: [
      { id: 'l2', name: 'Doing', closed: false, pos: 200 },
      { id: 'l1', name: 'To do', closed: false, pos: 100 },
      { id: 'l9', name: 'Old sprint', closed: true, pos: 50 },
    ],
    cards: [
      {
        id: 'c2',
        name: 'Write launch post',
        desc: 'Draft in the shared doc, then review.',
        closed: false,
        idList: 'l1',
        pos: 200,
        due: '2026-08-01T12:00:00.000Z',
        idMembers: ['m1', 'm2'],
        labels: [{ id: 'lab1', name: 'Marketing', color: 'green' }],
        attachments: [
          { id: 'a1', name: 'brief.pdf', url: 'https://example.com/brief.pdf' },
          { id: 'a2', name: 'sketchy', url: 'javascript:alert(1)' },
        ],
      },
      { id: 'c1', name: 'Pick a launch date', desc: '', closed: false, idList: 'l1', pos: 100 },
      { id: 'c3', name: 'Record the demo', desc: '', closed: false, idList: 'l2', pos: 100 },
      { id: 'c8', name: 'Abandoned idea', desc: '', closed: true, idList: 'l1', pos: 400 },
      { id: 'c9', name: 'Stray card', desc: '', closed: false, idList: 'l9', pos: 100 },
    ],
    checklists: [
      {
        id: 'ch1',
        idCard: 'c3',
        name: 'Recording steps',
        pos: 100,
        checkItems: [
          { id: 'ci2', name: 'Export the file', state: 'incomplete', pos: 200 },
          { id: 'ci1', name: 'Set up the screen', state: 'complete', pos: 100 },
        ],
      },
    ],
    actions: [
      { id: 'ac1', type: 'commentCard' },
      { id: 'ac2', type: 'updateCard' },
    ],
  }
}

function widgetsOfType(widgets: Record<string, Widget>, type: string): Widget[] {
  return Object.values(widgets).filter((widget) => widget.type === type)
}

/** The board spine. Kanban was retired into the Checklist's Board skin, so the
 * spine is the Checklist titled with the board's own name — promoted card
 * checklists are Checklists too, and are titled after their card. */
function board(widgets: Record<string, Widget>, name = 'Launch board'): Widget {
  const spine = widgetsOfType(widgets, 'checklist').find((widget) => widget.title === name)
  if (!spine) throw new Error(`no board widget named "${name}" was created`)
  return spine
}

/** The spine's cards as [label, lane] pairs, in order. */
function boardLanes(widgets: Record<string, Widget>, name?: string): Array<[string, string | undefined]> {
  const data = board(widgets, name).data as ChecklistData
  return data.items.map((item) => [item.label, item.status])
}

describe('isTrelloExport', () => {
  it('accepts a board export', () => {
    expect(isTrelloExport(fixture())).toBe(true)
  })

  it('rejects the other shapes the importer may be handed', () => {
    // An Obsidian canvas, a Notion-style page object, and raw scalars.
    expect(isTrelloExport({ nodes: [], edges: [] })).toBe(false)
    expect(isTrelloExport({ name: 'Page', blocks: [] })).toBe(false)
    expect(isTrelloExport([{ name: 'x', lists: [], cards: [] }])).toBe(false)
    expect(isTrelloExport(null)).toBe(false)
    expect(isTrelloExport('{"name":"x"}')).toBe(false)
  })
})

describe('mapTrelloBoard — the board spine', () => {
  it('returns null for anything that is not a Trello board', () => {
    expect(mapTrelloBoard({ nodes: [] }, CANVAS_ID)).toBeNull()
  })

  it('maps open lists to columns in pos order, skipping archived ones', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)
    expect(result).not.toBeNull()
    // "To do" (pos 100) precedes "Doing" (pos 200) despite the array order, and
    // the archived list never appears. The Board skin owns three lanes, so the
    // first list lands in to-do and the last in done — list NAMES do not cross.
    expect(boardLanes(result!.widgets)).toEqual([
      ['Pick a launch date', 'todo'],
      ['Write launch post', 'todo'],
      ['Record the demo', 'doing'],
      ['Stray card', 'done'],
    ])
    expect(result!.report.columns).toBe(3)
    expect(result!.report.archivedLists).toBe(1)
  })

  it('orders cards by pos and drops archived ones', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    const lanes = boardLanes(result.widgets)
    expect(lanes.filter(([, lane]) => lane === 'todo').map(([label]) => label)).toEqual([
      'Pick a launch date',
      'Write launch post',
    ])
    expect(result.report.archivedCards).toBe(1)
    expect(lanes.some(([label]) => label === 'Abandoned idea')).toBe(false)
  })

  it('keeps a card whose list is archived instead of losing it', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    // The Unfiled column is the board's last, so its cards arrive in the last
    // lane rather than being dropped.
    expect(boardLanes(result.widgets)).toContainEqual(['Stray card', 'done'])
    expect(result.report.unfiledCards).toBe(1)
  })

  it('leaves a one-column board in to-do instead of marking every card done', () => {
    // Index 0 is both the first and the last column here, so `done` has to be
    // read off the lane rather than decided beside it.
    const result = mapTrelloBoard(
      {
        name: 'Single lane',
        lists: [{ id: 'l1', name: 'To do' }],
        cards: [
          { id: 'c1', name: 'Write spec', idList: 'l1', pos: 100 },
          { id: 'c2', name: 'Ship it', idList: 'l1', pos: 200 },
        ],
      },
      CANVAS_ID,
    )!
    const items = (board(result.widgets, 'Single lane').data as ChecklistData).items
    expect(items.map((item) => [item.label, item.status, item.done])).toEqual([
      ['Write spec', 'todo', false],
      ['Ship it', 'todo', false],
    ])
  })

  it('leaves a title-only card in its column rather than promoting it', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    const titles = Object.values(result.widgets).map((widget) => widget.title)
    expect(titles).not.toContain('Pick a launch date')
    expect(result.report.promotedCards).toBe(2)
  })
})

describe('mapTrelloBoard — detail a kanban card cannot hold', () => {
  it('carries a due date, labels and members as badges on the promoted card', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    const lead = Object.values(result.widgets).find(
      (widget) => widget.type === 'text' && widget.title === 'Write launch post',
    )!
    expect(lead.metadata.badges).toEqual([
      { type: 'deadline_countdown', dueDate: '2026-08-01T12:00:00.000Z' },
      { type: 'tag_pill', tags: [{ label: 'Marketing', color: '#61bd4f' }] },
      { type: 'assignee_avatars', initials: ['AL', 'GH'] },
    ])
    expect(result.report.carriedDueDates).toBe(1)
    expect(result.report.carriedLabels).toBe(1)
    expect(result.report.carriedMembers).toBe(2)
  })

  it('carries attachments into a links card, refusing non-http urls', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    const [links] = widgetsOfType(result.widgets, 'links')
    const items = (links!.data as LinksData).items
    expect(items.map((item) => [item.label, item.url])).toEqual([
      ['brief.pdf', 'https://example.com/brief.pdf'],
    ])
    expect(items.some((item) => item.url.startsWith('javascript:'))).toBe(false)
    expect(result.report.carriedAttachments).toBe(1)
  })

  it('turns a card checklist into a checklist widget with completion carried', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    const checklist = widgetsOfType(result.widgets, 'checklist')
      .find((widget) => widget.title !== 'Launch board')
    expect(checklist?.title).toBe('Record the demo · Recording steps')
    expect((checklist!.data as ChecklistData).items.map((item) => [item.label, item.done])).toEqual([
      ['Set up the screen', true],
      ['Export the file', false],
    ])
  })

  it('gives a card with only a deadline a readable face instead of a blank note', () => {
    const result = mapTrelloBoard(
      {
        name: 'Dated',
        lists: [{ id: 'l1', name: 'Only' }],
        cards: [{ id: 'c1', name: 'Ship it', idList: 'l1', due: '2026-09-01T00:00:00.000Z' }],
      },
      CANVAS_ID,
    )!
    const note = widgetsOfType(result.widgets, 'text')[0]!
    expect((note.data as TextData).text).toBe('Ship it')
    expect(note.metadata.badges).toHaveLength(1)
    // One widget is enough to hold it, so nothing is welded.
    expect(result.glues).toHaveLength(0)
  })
})

describe('mapTrelloBoard — clusters and connections', () => {
  it('welds a card that needed more than one widget, naming the cluster', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    expect(result.glues).toHaveLength(1)
    const [glue] = result.glues
    expect(glue!.name).toBe('Write launch post')
    expect(glue!.widgetIds).toHaveLength(2)
    expect(glue!.widgetIds.map((id) => result.widgets[id]!.type)).toEqual(['text', 'links'])
  })

  it('stacks welded members exactly one seam apart in one column', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    const [glue] = result.glues
    const [first, second] = glue!.widgetIds.map((id) => result.widgets[id]!)
    expect(second!.position.x).toBe(first!.position.x)
    expect(second!.position.y - (first!.position.y + first!.size.height)).toBe(GLUE_GAP)
  })

  it('connects the board to each promotion, and never to a welded follower', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    const kanban = board(result.widgets)
    const follower = result.glues[0]!.widgetIds[1]!
    expect(result.relations.every((relation) => relation.fromId === kanban.id)).toBe(true)
    expect(result.relations.every((relation) => relation.type === 'parent')).toBe(true)
    // Board description, the welded lead, and the standalone checklist.
    expect(result.relations).toHaveLength(3)
    expect(result.relations.some((relation) => relation.toId === follower)).toBe(false)
  })

  it('places every widget on the target canvas at a distinct spot', () => {
    const result = mapTrelloBoard(fixture(), CANVAS_ID)!
    const widgets = Object.values(result.widgets)
    expect(widgets).toHaveLength(5)
    expect(widgets.every((widget) => widget.canvasId === CANVAS_ID)).toBe(true)
    expect(widgets.every((widget) => widget.size.width > 0 && widget.size.height > 0)).toBe(true)
    const seen = new Set(widgets.map((widget) => `${widget.position.x},${widget.position.y}`))
    expect(seen.size).toBe(widgets.length)
  })
})

describe('mapTrelloBoard — hostile input', () => {
  it('survives a board whose collections are missing or the wrong type', () => {
    const result = mapTrelloBoard(
      {
        name: 'Half-written export',
        lists: [null, { id: 'l1', name: 'Only list' }, 'nonsense'],
        cards: [{ id: 'c1', name: 'Kept', idList: 'l1' }, 42],
        checklists: 'not an array',
        members: null,
        actions: null,
      },
      CANVAS_ID,
    )
    expect(result).not.toBeNull()
    expect(boardLanes(result!.widgets, 'Half-written export')).toEqual([['Kept', 'todo']])
  })

  it('bounds a hostile export and reports what it trimmed', () => {
    const cards = Array.from({ length: 260 }, (_, index) => ({
      id: `c${index}`,
      name: `Card ${index}`,
      closed: false,
      idList: 'l1',
      pos: index,
    }))
    const result = mapTrelloBoard(
      { name: 'Huge', lists: [{ id: 'l1', name: 'All' }], cards },
      CANVAS_ID,
    )!
    expect(boardLanes(result.widgets, 'Huge')).toHaveLength(200)
    expect(result.report.truncatedCards).toBe(60)
    expect(result.report.cards).toBe(200)
  })

  it('counts every detailed card the side-widget cap turned away', () => {
    // 200 cards that each carry a description, against a 120-widget ceiling:
    // the 80 that do not fit are all reported, not just the first one refused.
    const cards = Array.from({ length: 200 }, (_, index) => ({
      id: `c${index}`,
      name: `Card ${index}`,
      desc: `Details for card ${index}`,
      closed: false,
      idList: 'l1',
      pos: index,
    }))
    const result = mapTrelloBoard(
      { name: 'Detailed', lists: [{ id: 'l1', name: 'All' }], cards },
      CANVAS_ID,
    )!
    expect(result.report.promotedCards).toBe(120)
    expect(result.report.truncatedSideWidgets).toBe(80)
    expect(result.report.promotedCards + result.report.truncatedSideWidgets).toBe(200)
  })

  it('gives an empty board one board card and nothing else', () => {
    const result = mapTrelloBoard({ name: 'Empty', lists: [], cards: [] }, CANVAS_ID)!
    expect(Object.keys(result.widgets)).toHaveLength(1)
    expect(result.relations).toHaveLength(0)
    expect(result.glues).toHaveLength(0)
    expect(boardLanes(result.widgets, 'Empty')).toEqual([])
  })
})

describe('describeTrelloImport', () => {
  it('names what was built, what was kept, and what was left behind', () => {
    const { report } = mapTrelloBoard(fixture(), CANVAS_ID)!
    const summary = describeTrelloImport(report)
    expect(summary).toContain('4 cards in 3 columns')
    expect(summary).toContain('2 detailed cards opened out beside it')
    expect(summary).toContain('Kept 1 due dates, 1 labels, 2 members, 1 attachments')
    expect(summary).toContain('Not carried over: 2 archived, 1 comments')
  })

  it('says nothing about losses when there were none', () => {
    const { report } = mapTrelloBoard(
      {
        name: 'Clean',
        lists: [{ id: 'l1', name: 'Only' }],
        cards: [{ id: 'c1', name: 'One', idList: 'l1' }],
      },
      CANVAS_ID,
    )!
    expect(describeTrelloImport(report)).toBe('Imported 1 card in 1 column.')
  })
})
