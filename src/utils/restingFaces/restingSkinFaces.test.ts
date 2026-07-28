import { describe, expect, it } from 'vitest'
import { GRID_SIZE, type ModuleType, type Widget } from '../../types/spatial'
import { MODULE_PACK_REQUIREMENTS } from '../../types/modulePacks'
import { WIDGET_REGISTRY } from '../../widgets/registry'
import { dataWearingSkin, skinsFor } from '../../utils/widgetSkins'
import { restingFace } from '../restingFace'
import {
  REST_BAR_LIMIT,
  REST_CHIP_LIMIT,
  REST_COLUMN_ITEM_LIMIT,
  REST_LANE_LIMIT,
  REST_LINE_LIMIT,
  REST_NODE_LIMIT,
  REST_ROW_LIMIT,
  REST_STROKE_LIMIT,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Every skin an essential widget can wear has to fold to something. These are
// the contracts that hold across all of them at once — one skin at a time is
// covered by that family's own skin test.
// ---------------------------------------------------------------------------

const MAX_TILE_WIDTH = 360

/** The essentials: everything that is not behind a domain pack. */
const ESSENTIAL_TYPES = (Object.keys(WIDGET_REGISTRY) as ModuleType[])
  .filter((type) => !(type in MODULE_PACK_REQUIREMENTS))
  .toSorted()

function widget(type: ModuleType, data: unknown): Widget {
  return {
    id: `w-${type}`,
    type,
    title: 'Card',
    canvasId: 'canvas-1',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 200 },
    data,
    metadata: {},
  } as unknown as Widget
}

/** Starter data plus enough content that every grammar has something to draw:
 * a card with nothing in it is allowed to rest as its icon, which would make
 * these contracts vacuous. */
function seeded(type: ModuleType): Record<string, unknown> {
  const definition = WIDGET_REGISTRY[type]
  const base = definition.defaultData() as unknown as Record<string, unknown>
  const filled: Record<string, unknown> = { ...base }
  // "Empty" includes a starter row with no words in it: several widgets ship
  // one blank entry so the card opens with a cursor, and a face built from it
  // is correctly a bare icon.
  const blank = (value: unknown[]) => value.every((entry) => {
    const item = entry as { label?: unknown; text?: unknown; value?: unknown } | null
    return !item
      || !(String(item.label ?? '').trim() || String(item.text ?? '').trim() || String(item.value ?? '').trim())
  })
  for (const [key, value] of Object.entries(base)) {
    if (!Array.isArray(value) || !blank(value)) continue
    if (key === 'items') {
      filled.items = [
        { id: 'a', label: 'First thing', text: 'First thing', value: 3, done: false, url: 'https://example.com/a' },
        { id: 'b', label: 'Second thing', text: 'Second thing', value: 5, done: true, url: 'https://example.com/b' },
      ]
    }
    if (key === 'milestones') {
      filled.milestones = [
        { id: 'a', label: 'First step', done: true },
        { id: 'b', label: 'Second step', done: false },
      ]
    }
    if (key === 'nodes') filled.nodes = [{ id: 'a', value: 'Alpha' }, { id: 'b', value: 'Beta' }]
  }
  if (base.text === '') filled.text = 'A short line of writing, kept as it was typed.'
  if (type === 'code') filled.code = 'const answer = 42\nexport default answer\n'
  if (type === 'calculator') { filled.expression = '25 * 3'; filled.result = '75' }
  if (type === 'text_input') filled.value = 'design, release, canvas'
  if (type === 'media') filled.url = 'https://example.com/photo.png'
  if (type === 'location') { filled.latitude = 51.5; filled.longitude = -0.12 }
  if (type === 'calendar') {
    filled.markedDates = ['2026-07-04', '2026-08-02']
    // Occasions live in their skin's own pocket, so seeding the shared marked
    // dates alone would leave that one skin with nothing to draw.
    filled.skinStates = {
      birthday_and_anniversary: {
        occasions: [{ id: 'o1', name: 'Mum', date: '08-14', kind: 'birthday' }],
      },
    }
  }
  return filled
}

/** Every countable list a face can carry, with the ceiling it must obey. */
function boundedRuns(model: RestingFaceModel): Array<{ what: string; length: number; limit: number }> {
  switch (model.kind) {
    case 'rows':
      return [{ what: 'rows', length: model.rows.length, limit: REST_ROW_LIMIT }]
    case 'columns':
      return model.columns.map((column, index) => ({
        what: `column ${index}`,
        length: column.items.length,
        limit: REST_COLUMN_ITEM_LIMIT,
      }))
    case 'bars':
      return [{ what: 'bars', length: model.bars.length, limit: REST_BAR_LIMIT }]
    case 'chips':
      return [{ what: 'chips', length: model.chips.length, limit: REST_CHIP_LIMIT }]
    case 'lines':
      return [{ what: 'lines', length: model.lines.length, limit: REST_LINE_LIMIT }]
    case 'chain':
      // A stacked chain is a row list; a drawn one is the narrower node run.
      return [{
        what: 'nodes',
        length: model.nodes.length,
        limit: model.shape === 'stack' ? REST_ROW_LIMIT : REST_NODE_LIMIT,
      }]
    case 'timeline':
      return [{ what: 'lanes', length: model.lanes.length, limit: REST_LANE_LIMIT }]
    case 'paper':
      return [{ what: 'strokes', length: model.strokes.length, limit: REST_STROKE_LIMIT }]
    default:
      return []
  }
}

describe('every skin an essential widget wears has a resting face', () => {
  const cases = ESSENTIAL_TYPES.flatMap((type) => {
    const definition = WIDGET_REGISTRY[type]
    const skins = skinsFor({ type }, definition)
    const data = seeded(type)
    return skins.length === 0
      ? [{ type, skin: '(none)', data }]
      : skins.map((skin) => ({
        type,
        skin: skin.value,
        data: dataWearingSkin({ type, data }, skin.value, definition) as unknown as Record<string, unknown>,
      }))
  })

  it('covers every essential type and skin', () => {
    // A guard on the guard: if the registry loses its skins this suite would
    // quietly stop testing anything.
    expect(cases.length).toBeGreaterThan(200)
    expect(ESSENTIAL_TYPES).toContain('checklist')
    expect(ESSENTIAL_TYPES).not.toContain('budget')
  })

  it('measures every face onto the grid lattice and inside the width cap', () => {
    for (const { type, skin, data } of cases) {
      const { size } = restingFace(widget(type, data))
      const where = `${type}/${skin}`
      expect(size.width % GRID_SIZE, `${where} width off-lattice`).toBe(0)
      expect(size.height % GRID_SIZE, `${where} height off-lattice`).toBe(0)
      expect(size.width, `${where} too wide`).toBeLessThanOrEqual(MAX_TILE_WIDTH)
      expect(size.width, `${where} too narrow`).toBeGreaterThanOrEqual(GRID_SIZE)
    }
  })

  it('keeps every face bounded, so render cost never grows with data', () => {
    for (const { type, skin, data } of cases) {
      const { model } = restingFace(widget(type, data))
      for (const run of boundedRuns(model)) {
        expect(run.length, `${type}/${skin} ${run.what}`).toBeLessThanOrEqual(run.limit)
      }
    }
  })

  it('never rests a filled card as a bare icon', () => {
    // The exceptions are cards whose starter data really is empty: nothing to
    // draw is the one honest reason for the icon tile.
    const allowedIcons = new Set(['excalidraw', 'kanban', 'quote', 'sticky_note', 'weekly_planner'])
    for (const { type, skin, data } of cases) {
      if (allowedIcons.has(type)) continue
      const { model } = restingFace(widget(type, data))
      expect(model.kind, `${type}/${skin} rests as a bare icon`).not.toBe('icon')
    }
  })
})

describe('a skin folds to the shape it is worn as', () => {
  const face = (type: ModuleType, data: Record<string, unknown>) =>
    restingFace(widget(type, data)).model

  const tasks = [
    { id: 'a', label: 'Draft', done: true, status: 'done', day: 0, quadrant: 0, start: 0, span: 2 },
    { id: 'b', label: 'Review', done: false, status: 'doing', day: 2, quadrant: 1, start: 2, span: 1 },
  ]

  it('folds a Tasks board to columns and its timeline to spans', () => {
    expect(face('checklist', { items: tasks, mode: 'board' })).toMatchObject({
      kind: 'columns',
      columns: [{ label: 'To do' }, { label: 'Doing' }, { label: 'Done' }],
    })
    expect(face('checklist', { items: tasks, mode: 'timeline' })).toMatchObject({
      kind: 'timeline',
      lanes: [
        { label: 'Draft', start: 0, span: 2 },
        { label: 'Review', start: 2, span: 1 },
      ],
    })
    // A 2×2 matrix stays 2×2 rather than flattening into four columns.
    expect(face('checklist', { items: tasks, mode: 'matrix' })).toMatchObject({
      kind: 'columns',
      wrap: 2,
    })
  })

  it('folds a Calendar month to its own lattice and a heat map to its year', () => {
    const month = face('calendar', { year: 2026, month: 6, markedDates: ['2026-07-04'], skin: 'month' })
    expect(month).toMatchObject({ kind: 'grid', cols: 7, dense: true })
    const year = face('calendar', { year: 2026, month: 6, markedDates: ['2026-07-04'], skin: 'year_heatmap' })
    expect(year).toMatchObject({ kind: 'grid', cols: 12, dense: true })
  })

  it('folds a calculator tape to its tape and its total', () => {
    expect(face('calculator', {
      expression: '25 * 3',
      result: '75',
      skin: 'tape',
      skinStates: { tape: { entries: [{ id: 't1', expression: '20 + 5', result: '25' }] } },
    })).toMatchObject({
      kind: 'lines',
      mono: true,
      total: { left: 'Σ', right: '25' },
    })
  })

  it('never leaks a private Tracker reading onto the board', () => {
    const model = face('tracker', {
      label: 'Cycle',
      trackerMode: 'cycle_tracker',
      mode: 'cycle_tracker',
      primary: 12,
      target: 28,
      privateMode: true,
      items: [],
      history: [],
      times: {},
      text: '',
      date: '',
      timeStart: '',
      timeEnd: '',
      secondary: 0,
      enabled: true,
      actionCount: 0,
      lastActionAt: null,
    })
    expect(model).toMatchObject({ kind: 'metric', primary: '•••' })
    expect(JSON.stringify(model)).not.toContain('follicular')
  })
})
