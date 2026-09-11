import { describe, expect, it } from 'vitest'
import { GRID_SIZE, type ModuleType, type Widget } from '../../types/spatial'
import { WIDGET_REGISTRY } from '../../widgets/registry'
import { ATLAS_TYPES } from '../../widgets/atlasCatalog'
import { AUTOMATION_CORE_TYPES } from '../../widgets/automationCoreCatalog'
import { skinsFor } from '../widgetSkins'
import { restingFace } from '../restingFace'

// ---------------------------------------------------------------------------
// The four families that used to fold through the generic ladder — the fifty
// Atlas systems, the automation nodes, the Expansion cards, and the rest of
// the catalogue — now each fold to their own body. These are the readings a
// folded card has to keep: not "two items", but the risk's score, the guest's
// RSVP, the medication's doses, the converter's other unit.
// ---------------------------------------------------------------------------

function card(type: ModuleType, data: unknown): Widget {
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

const face = (type: ModuleType, data: unknown) => restingFace(card(type, data)).model

describe('the Atlas systems fold through their own shapes', () => {
  const fuelLog = {
    trackerMode: 'fuel_log',
    label: 'Fuel Log',
    primary: 12_000,
    secondary: 7.4,
    target: 100,
    items: [{ id: 'a', label: 'Shell', value: 62, done: false }],
    history: [{ t: 1, v: 6 }, { t: 2, v: 7 }, { t: 3, v: 8 }],
    times: {},
  }

  it('gives a standalone Atlas type the same six shapes the Tracker has', () => {
    expect(face('fuel_log', { ...fuelLog, skin: 'dial' })).toMatchObject({ kind: 'gauge' })
    expect(face('fuel_log', { ...fuelLog, skin: 'compact' })).toMatchObject({ kind: 'metric' })
    expect(face('fuel_log', { ...fuelLog, skin: 'trend' })).toMatchObject({
      kind: 'chart',
      series: [6, 7, 8],
    })
    // Ledger is only offered to the types whose hero already draws their
    // items, so it is asked of one of those rather than of the Fuel Log.
    expect(face('price_book', {
      trackerMode: 'price_book',
      skin: 'ledger',
      primary: 0,
      target: 0,
      items: [{ id: 'a', label: 'Rice 1kg', value: 62, done: false }],
      history: [],
      times: {},
    })).toMatchObject({
      kind: 'rows',
      rows: [{ label: 'Rice 1kg', value: '62' }],
    })
  })

  it('names itself by its own type when the record never stored one', () => {
    // An old board can hold an Atlas card with no `trackerMode`; the type is
    // still a Prayer Times, and must not fall back to the Tracker's default.
    const model = face('prayer_times', {
      label: 'Prayer Times',
      skin: 'schedule',
      primary: 0,
      target: 0,
      items: [],
      history: [],
      times: { fajr: '05:10', maghrib: '19:42' },
    })
    expect(model).toMatchObject({ kind: 'rows' })
    expect(JSON.stringify(model)).toContain('19:42')
  })

  it('never leaks a private Atlas reading, whatever shape it wears', () => {
    for (const skin of ['object', 'dial', 'compact'] as const) {
      expect(face('cycle_tracker', {
        trackerMode: 'cycle_tracker',
        skin,
        privateMode: true,
        primary: 12,
        target: 28,
        items: [],
        history: [],
        times: {},
      })).toMatchObject({ kind: 'metric', primary: '•••' })
    }
  })

  it('covers every Atlas type and every shape it offers', () => {
    for (const type of ATLAS_TYPES) {
      for (const skin of skinsFor({ type }, WIDGET_REGISTRY[type])) {
        const data = { ...WIDGET_REGISTRY[type].defaultData(), skin: skin.value }
        const { model, size } = restingFace(card(type, data))
        expect(model.kind, `${type}/${skin.value}`).not.toBe('icon')
        expect(size.width % GRID_SIZE, `${type}/${skin.value}`).toBe(0)
      }
    }
  })
})

describe('an automation node folds to its status island', () => {
  const node = {
    label: 'Queue',
    input: '',
    output: '',
    config: '{}',
    mode: 'standard',
    enabled: true,
    running: false,
    count: 0,
    concurrency: 1,
    lastRunAt: null,
    lastError: '',
    items: [],
  }

  it('leads with what the node is doing, then what it holds', () => {
    expect(face('queue', { ...node, count: 3, items: [{ id: 'a', label: 'Draft post' }] })).toMatchObject({
      kind: 'rows',
      rows: [
        { key: 'status', label: '3 runs', tone: 'good', value: 'Store' },
        { key: 'held-1', label: 'Draft post' },
      ],
    })
  })

  it('shows an error in place of the output, the way the open card does', () => {
    const model = face('http_request', { ...node, output: 'ok', lastError: 'timed out' })
    expect(model).toMatchObject({
      kind: 'rows',
      rows: [{ label: 'Needs attention', tone: 'bad' }, { key: 'result', label: 'timed out' }],
    })
    expect(JSON.stringify(model)).not.toContain('"ok"')
  })

  it('covers every skinned automation node', () => {
    for (const type of AUTOMATION_CORE_TYPES) {
      const skins = skinsFor({ type }, WIDGET_REGISTRY[type])
      if (skins.length === 0) continue
      expect(face(type, WIDGET_REGISTRY[type].defaultData()), type).toMatchObject({ kind: 'rows' })
    }
  })
})

describe('an Expansion card folds to its headline reading and its own rows', () => {
  it('ends a guest row in its RSVP and a medication row in its doses', () => {
    expect(face('guest_list', {
      rows: [{ id: 'g1', name: 'Ada', status: 'yes', plusOnes: 2, dietary: '' }],
    })).toMatchObject({
      kind: 'rows',
      rows: [{ tone: 'accent' }, { label: 'Ada', value: 'yes +2', tone: 'good' }],
    })

    expect(face('medications', {
      rows: [{ id: 'm1', name: 'Iron', timesPerDay: 3, takenToday: [true, true, false], pillsLeft: 9, dailyUse: 3 }],
    })).toMatchObject({
      kind: 'rows',
      rows: [{ tone: 'accent' }, { label: 'Iron', value: '2/3', done: false }],
    })
  })

  it('scales a recipe the way the open card scales it', () => {
    const model = face('recipe', {
      title: 'Soup',
      servings: 4,
      baseServings: 2,
      cookMinutes: 30,
      steps: [],
      ingredients: [{ id: 'i1', qty: 3, unit: 'g', item: 'Salt' }],
    })
    expect(JSON.stringify(model)).toContain('6 g')
  })

  it('keeps the sequencer window around the step that is running', () => {
    const steps = Array.from({ length: 8 }, (_, index) => ({ id: `s${index}`, text: `Step ${index}` }))
    expect(face('sequencer', { label: 'Run', steps, activeIndex: 5, loop: false })).toMatchObject({
      kind: 'chain',
      shape: 'linear',
      nodes: [
        { label: 'Step 4', current: false },
        { label: 'Step 5', current: true },
        { label: 'Step 6', current: false },
        { label: 'Step 7', current: false },
      ],
    })
  })

  it('reads a workflow card by field NAME, not by port position', () => {
    // A field's index is its port slot on the card edge, so a Comparator's
    // first field is its A operand and its verdict is `result`; an
    // Aggregator's first six are its own input slots, not the answer.
    expect(face('comparator', { label: 'Compare', op: 'gte', a: 82, b: 70, low: 0, high: 100 }))
      .toMatchObject({ kind: 'split', divider: '\u2265', left: { primary: '82', tone: 'good' } })
    expect(face('comparator', { label: 'Compare', op: 'gte', a: 12, b: 70, low: 0, high: 100 }))
      .toMatchObject({ left: { tone: 'bad' } })

    expect(face('aggregator', { label: 'Combine', mode: 'avg', slots: [4, 8, 0, 0, 0, 0] }))
      .toMatchObject({
        kind: 'lines',
        lines: [{ left: '1', right: '4' }, { left: '2', right: '8' }],
        // The card averages over every slot it has, empty ones included, so
        // the tile prints the card's own answer rather than recomputing one
        // from the slots it had room to show.
        total: { left: 'Average', right: '2' },
      })
  })

  it('marks the band a range mapper is currently reading, and its open end', () => {
    expect(face('range_mapper', {
      label: 'Bands',
      input: 40,
      bands: [
        { id: 'a', upTo: 25, label: 'Low', emoji: '🟢' },
        { id: 'b', upTo: 75, label: 'Medium', emoji: '🟡' },
        { id: 'c', upTo: Number.MAX_SAFE_INTEGER, label: 'High', emoji: '🔴' },
      ],
    })).toMatchObject({
      kind: 'rows',
      rows: [
        { key: 'input', value: '40' },
        { label: 'Low', tone: 'muted' },
        { label: 'Medium', tone: 'good' },
        { label: 'High', value: '∞' },
      ],
    })
  })

  it('never prints a broken derived reading', () => {
    // A half-migrated record can make a card's own derived string come out as
    // "NaN" or "undefined"; a tile must show nothing rather than that.
    const model = face('recipe', {
      title: 'Soup',
      servings: 2,
      baseServings: 2,
      cookMinutes: 0,
      steps: [],
      ingredients: [{ id: 'i1' }],
    })
    expect(JSON.stringify(model)).not.toMatch(/NaN|undefined|\[object/)
  })
})

describe('the rest of the catalogue folds to its own body', () => {
  it('ranks risks by score and keeps the score as the row lead', () => {
    expect(face('risk_register', {
      items: [
        { id: 'a', risk: 'Low one', likelihood: 1, impact: 2, mitigation: '', status: 'open' },
        { id: 'b', risk: 'Bad one', likelihood: 5, impact: 4, mitigation: '', status: 'open' },
      ],
    })).toMatchObject({
      kind: 'rows',
      rows: [
        { lead: '20', label: 'Bad one', tone: 'bad' },
        { lead: '2', label: 'Low one', tone: 'good' },
      ],
    })
  })

  it('keeps a SWOT square rather than flattening it into four columns', () => {
    expect(face('swot', {
      strengths: ['Team'],
      weaknesses: ['Runway'],
      opportunities: [],
      threats: [],
    })).toMatchObject({ kind: 'columns', wrap: 2 })
  })

  it('runs the procedure meter and numbers the spine', () => {
    expect(face('process', {
      steps: [
        { id: 'a', label: 'Gather', status: 'done' },
        { id: 'b', label: 'Review', status: 'active' },
      ],
    })).toMatchObject({
      kind: 'rows',
      meter: 0.5,
      rows: [
        { lead: '01', label: 'Gather', done: true },
        { lead: '02', label: 'Review', tone: 'accent' },
      ],
    })
  })

  it('re-presents a KPI board the way each of its skins does', () => {
    const tiles = [
      { id: 't1', label: 'Users', value: '128', unit: '', trend: 'up' },
      { id: 't2', label: 'Revenue', value: '3.2k', unit: '', trend: 'flat' },
    ]
    expect(face('metrics', { tiles, skin: 'big_number' })).toMatchObject({
      kind: 'metric',
      primary: '128',
      secondary: 'Users',
    })
    expect(face('metrics', { tiles, skin: 'traffic_lights' })).toMatchObject({ kind: 'chips' })
    expect(face('metrics', { tiles, skin: 'target' })).toMatchObject({ kind: 'bars' })
    expect(face('metrics', { tiles, skin: 'kpi_tiles' })).toMatchObject({
      kind: 'rows',
      rows: [
        { label: 'Users', value: '↑128', tone: 'good' },
        { label: 'Revenue', value: '→3.2k', tone: 'muted' },
      ],
    })
  })

  it('folds a status to the shape its skin is for', () => {
    expect(face('status', { label: 'Launch', value: 'done', skin: 'badge' })).toMatchObject({
      kind: 'metric',
      primary: 'Done',
      tone: 'good',
    })
    expect(face('status', { label: 'Launch', value: 'done', skin: 'progress' })).toMatchObject({
      kind: 'gauge',
      progress: 1,
    })
    expect(face('status', { label: 'Launch', value: 'blocked', skin: 'pipeline' })).toMatchObject({
      kind: 'chain',
      nodes: [
        { key: 'not_started', current: false },
        { key: 'in_progress', current: false },
        { key: 'blocked', current: true },
        { key: 'done', current: false },
      ],
    })
  })

  it('gives the chart skins the ladder the base face cannot serve', () => {
    const bars = [
      { id: 'a', label: 'A', value: 3 },
      { id: 'b', label: 'B', value: 5 },
    ]
    expect(face('bar_chart', { title: '', unit: '', bars, mode: 'sparkline' })).toMatchObject({
      kind: 'chart',
      series: [3, 5],
    })
    expect(face('bar_chart', { title: '', unit: '', bars, mode: 'gauge' })).toMatchObject({ kind: 'gauge' })
    expect(face('bar_chart', { title: '', unit: '', bars, mode: 'heatmap' })).toMatchObject({
      kind: 'grid',
      dense: true,
    })
    // Bar and line are drawn from the card's own series by the face renderer,
    // so their model stays the plain chart reading.
    expect(face('bar_chart', { title: '', unit: '', bars, mode: 'bar' })).toMatchObject({ kind: 'chart' })
  })

  it('shows a unit converter as both of its units', () => {
    expect(face('unit_converter', {
      category: 'length',
      value: 1,
      from: 'm',
      to: 'ft',
      precision: 2,
      skin: 'general',
    })).toMatchObject({
      kind: 'split',
      divider: '→',
      left: { secondary: 'm' },
      right: { secondary: 'ft' },
    })
  })

  it('gives a terminal its prompt and a diff its gutter colours', () => {
    const terminal = face('code', { language: 'sh', code: 'npm run check\n', skin: 'terminal' })
    expect(JSON.stringify(terminal)).toContain('$ npm run check')
    expect(face('code', { language: 'diff', code: '+ added\n- removed\n', skin: 'diff' })).toMatchObject({
      kind: 'lines',
      lines: [{ tone: 'good' }, { tone: 'bad' }],
    })
  })

  it('folds a bookmark grid to tiles and every other Links skin to rows', () => {
    const items = [{ id: 'l1', label: 'Docs', url: 'https://example.com/docs' }]
    expect(face('links', { items, skin: 'bookmark_grid' })).toMatchObject({ kind: 'chips' })
    expect(face('links', { items, skin: 'reading_queue' })).toMatchObject({ kind: 'rows' })
  })

  it('names the Canvas view without ever printing a student record', () => {
    expect(face('canvas_lms', { skin: 'grades' })).toMatchObject({
      kind: 'rows',
      eyebrow: { label: 'Grades', note: 'Private' },
      rows: [{ label: 'Marks and feedback' }, { label: 'Student data', value: 'This device' }],
    })
  })
})
