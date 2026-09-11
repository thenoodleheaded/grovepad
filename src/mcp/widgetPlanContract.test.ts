import { describe, expect, it } from 'vitest'
import {
  applyWidgetPlan,
  layoutWidgetPlan,
  McpPlanError,
  MCP_PLAN_LIMITS,
  normalizeWidgetPlan,
  PLANNABLE_WIDGET_TYPES,
  WIDGET_PLAN_JSON_SCHEMA,
  type PlannableWidgetType,
} from './widgetPlanContract'
import { CLOUD_CANVAS_FORMAT, CLOUD_CANVAS_VERSION, type CloudCanvasDocument } from '../utils/cloudDocuments'
import { fieldsFor } from '../widgets/fields'

const CANVAS = 'canvas-test'
const ORIGIN = { x: 0, y: 0 }

function plan(input: unknown) {
  return normalizeWidgetPlan(input, CANVAS, ORIGIN)
}

/** Smallest content each type accepts, so every allowlist entry is exercised. */
const MINIMAL_CONTENT: Record<PlannableWidgetType, unknown> = {
  text: { text: 'hello' },
  bullets: { items: ['one', 'two'] },
  checklist: { items: [{ label: 'do it' }] },
  table: { rows: [['a', 'b'], ['c', 'd']] },
  outline: { items: [{ text: 'top', depth: 0 }] },
  pros_cons: { topic: 'Move house', pros: ['space'], cons: ['cost'] },
  poll: { question: 'Which?', options: ['a', 'b'] },
  habit: { label: 'Read' },
  counter: { label: 'Cups' },
  rating: { label: 'Sleep', value: 4 },
  toggle: { label: 'Done', value: true },
  date_picker: { label: 'Ship', date: '2026-03-14' },
  timekeeper: { label: 'Focus', minutes: 25 },
  bar_chart: { title: 'Sales', bars: [{ label: 'Q1', value: 10 }] },
  metrics: { tiles: [{ label: 'Users', value: '1200', trend: 'up' }] },
}

function widget(type: PlannableWidgetType, id = 'w1') {
  return { id, type, title: `A ${type}`, content: MINIMAL_CONTENT[type] }
}

function emptyDocument(): CloudCanvasDocument {
  return {
    format: CLOUD_CANVAS_FORMAT,
    v: CLOUD_CANVAS_VERSION,
    canvasId: CANVAS,
    widgets: {},
    relations: {},
    connections: {},
    glues: {},
  }
}

describe('the curated subset', () => {
  it('normalizes every plannable type from minimal content', () => {
    for (const type of PLANNABLE_WIDGET_TYPES) {
      const result = plan({ widgets: [widget(type)] })
      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0]!.type).toBe(type)
      expect(result.nodes[0]!.data).toBeTypeOf('object')
    }
  })

  it('names the allowed types when refusing one outside the subset', () => {
    expect(() => plan({ widgets: [{ id: 'a', type: 'sketchpad', title: 'Draw' }] }))
      .toThrow(/not a widget an AI can create/)
    expect(() => plan({ widgets: [{ id: 'a', type: 'sketchpad', title: 'Draw' }] }))
      .toThrow(/checklist/)
  })

  it('starts from registry defaults rather than the model payload', () => {
    const result = plan({ widgets: [widget('counter')] })
    const data = result.nodes[0]!.data as Record<string, unknown>
    // step/count were never supplied; they come from the registry's defaultData.
    expect(data.count).toBe(0)
    expect(data.step).toBe(1)
    expect(data.label).toBe('Cups')
  })

  it('cannot be used to inject unknown data fields', () => {
    const result = plan({
      widgets: [{ id: 'a', type: 'text', title: 'Note', content: { text: 'ok', evil: '<script>' } }],
    })
    expect(result.nodes[0]!.data).not.toHaveProperty('evil')
  })
})

describe('bounds', () => {
  it('rejects an empty plan', () => {
    expect(() => plan({ widgets: [] })).toThrow(/at least one widget/)
  })

  it('rejects more widgets than the limit', () => {
    const widgets = Array.from({ length: MCP_PLAN_LIMITS.maxWidgets + 1 }, (_, i) => widget('text', `w${i}`))
    expect(() => plan({ widgets })).toThrow(new RegExp(`at most ${MCP_PLAN_LIMITS.maxWidgets} widgets`))
  })

  it('reports the offending field and its length when text is too long', () => {
    const long = 'x'.repeat(MCP_PLAN_LIMITS.maxItemTextLength + 1)
    expect(() => plan({ widgets: [{ id: 'a', type: 'checklist', title: 'T', content: { items: [long] } }] }))
      .toThrow(/widgets\[0\]\.content\.items\[0\] is 201 characters and cannot exceed 200/)
  })

  it('rejects more items in one widget than the limit', () => {
    const items = Array.from({ length: MCP_PLAN_LIMITS.maxItemsPerWidget + 1 }, (_, i) => `item ${i}`)
    expect(() => plan({ widgets: [{ id: 'a', type: 'bullets', title: 'T', content: { items } }] }))
      .toThrow(/cannot exceed 50/)
  })
})

describe('structure', () => {
  it('rejects duplicate ids', () => {
    expect(() => plan({ widgets: [widget('text', 'same'), widget('text', 'same')] }))
      .toThrow(/"same" is used twice/)
  })

  it('rejects a missing parent', () => {
    expect(() => plan({ widgets: [{ ...widget('text', 'a'), parentId: 'ghost' }] }))
      .toThrow(/missing parent "ghost"/)
  })

  it('rejects a widget parenting itself', () => {
    expect(() => plan({ widgets: [{ ...widget('text', 'a'), parentId: 'a' }] }))
      .toThrow(/cannot be its own parent/)
  })

  it('rejects a parent loop', () => {
    expect(() => plan({
      widgets: [
        { ...widget('text', 'a'), parentId: 'b' },
        { ...widget('text', 'b'), parentId: 'a' },
      ],
    })).toThrow(/form a loop/)
  })

  it('computes depth from parent links', () => {
    const result = plan({
      widgets: [
        widget('text', 'root'),
        { ...widget('text', 'child'), parentId: 'root' },
        { ...widget('text', 'grand'), parentId: 'child' },
      ],
    })
    expect(result.nodes.map((n) => n.depth)).toEqual([0, 1, 2])
  })

  it('rejects nesting deeper than the limit', () => {
    const widgets = Array.from({ length: MCP_PLAN_LIMITS.maxDepth + 2 }, (_, i) => ({
      ...widget('text', `w${i}`),
      parentId: i === 0 ? null : `w${i - 1}`,
    }))
    expect(() => plan({ widgets })).toThrow(/deeper than 8 levels/)
  })
})

describe('content shapes', () => {
  it('rejects ragged table rows and says which row', () => {
    expect(() => plan({ widgets: [{ id: 'a', type: 'table', title: 'T', content: { rows: [['a', 'b'], ['c']] } }] }))
      .toThrow(/rows\[1\] has 1 cells but row 0 has 2/)
  })

  it('accepts plain strings or objects for list items', () => {
    const asStrings = plan({ widgets: [{ id: 'a', type: 'bullets', title: 'T', content: { items: ['x'] } }] })
    const asObjects = plan({ widgets: [{ id: 'a', type: 'bullets', title: 'T', content: { items: [{ text: 'x' }] } }] })
    const first = (asStrings.nodes[0]!.data as { items: { text: string }[] }).items[0]!.text
    const second = (asObjects.nodes[0]!.data as { items: { text: string }[] }).items[0]!.text
    expect(first).toBe('x')
    expect(second).toBe('x')
  })

  it('rejects a malformed date and explains the format', () => {
    expect(() => plan({ widgets: [{ id: 'a', type: 'date_picker', title: 'T', content: { label: 'x', date: '14/03/2026' } }] }))
      .toThrow(/ISO day like 2026-03-14/)
  })

  it('rejects a malformed time', () => {
    expect(() => plan({
      widgets: [{ id: 'a', type: 'date_picker', title: 'T', content: { label: 'x', date: '2026-03-14', time: '2pm' } }],
    })).toThrow(/24-hour HH:mm/)
  })

  it('rejects a rating outside 0-5', () => {
    expect(() => plan({ widgets: [{ id: 'a', type: 'rating', title: 'T', content: { label: 'x', value: 9 } }] }))
      .toThrow(/between 0 and 5/)
  })

  it('leaves untouched timer legs on their registry defaults', () => {
    const result = plan({ widgets: [widget('timekeeper')] })
    const data = result.nodes[0]!.data as Record<string, Record<string, unknown>>
    expect(data.countdown!.durationSeconds).toBe(1500)
    expect(data.pomodoro).toBeTypeOf('object')
    expect(data.stopwatch).toBeTypeOf('object')
  })

  it('zeroes poll votes regardless of what was sent', () => {
    const result = plan({
      widgets: [{ id: 'a', type: 'poll', title: 'T', content: { question: 'Q', options: [{ label: 'x', votes: 99 }] } }],
    })
    expect((result.nodes[0]!.data as { options: { votes: number }[] }).options[0]!.votes).toBe(0)
  })
})

describe('relations', () => {
  it('accepts valid relations between planned widgets', () => {
    const result = plan({
      widgets: [widget('text', 'a'), widget('text', 'b')],
      relations: [{ fromId: 'a', toId: 'b', type: 'blocker' }],
    })
    expect(result.relations).toEqual([{ fromId: 'a', toId: 'b', type: 'blocker' }])
  })

  it('rejects a relation to a widget outside the plan', () => {
    expect(() => plan({
      widgets: [widget('text', 'a')],
      relations: [{ fromId: 'a', toId: 'ghost', type: 'parent' }],
    })).toThrow(/not in this plan/)
  })

  it('rejects an unknown relation type', () => {
    expect(() => plan({
      widgets: [widget('text', 'a'), widget('text', 'b')],
      relations: [{ fromId: 'a', toId: 'b', type: 'friend' }],
    })).toThrow(/must be one of/)
  })
})

describe('wires', () => {
  it('accepts a value wire between real fields', () => {
    const source = fieldsFor('counter')[0]!
    const target = fieldsFor('rating').find((field) => field.set)
    expect(source).toBeDefined()
    expect(target).toBeDefined()
    const result = plan({
      widgets: [widget('counter', 'c'), widget('rating', 'r')],
      wires: [{ fromId: 'c', fromField: source.key, toId: 'r', kind: 'value', toField: target!.key }],
    })
    expect(result.wires).toHaveLength(1)
  })

  it('rejects an invented source field and lists the real ones', () => {
    expect(() => plan({
      widgets: [widget('counter', 'c'), widget('rating', 'r')],
      wires: [{ fromId: 'c', fromField: 'nonsense', toId: 'r', toField: 'value' }],
    })).toThrow(/not a readable field on a counter widget/)
  })

  it('rejects writing to a read-only field', () => {
    const readOnly = fieldsFor('counter').find((field) => !field.set)
    if (!readOnly) return
    expect(() => plan({
      widgets: [widget('counter', 'c'), widget('counter', 'd')],
      wires: [{ fromId: 'c', fromField: readOnly.key, toId: 'd', toField: readOnly.key }],
    })).toThrow(/not a settable field/)
  })

  it('rejects an unknown trigger command', () => {
    const source = fieldsFor('toggle')[0]!
    expect(() => plan({
      widgets: [widget('toggle', 't'), widget('counter', 'c')],
      wires: [{ fromId: 't', fromField: source.key, toId: 'c', kind: 'trigger', command: 'self_destruct' }],
    })).toThrow(/not a command on a counter widget/)
  })

  it('rejects a wire to a widget outside the plan', () => {
    expect(() => plan({
      widgets: [widget('counter', 'c')],
      wires: [{ fromId: 'c', fromField: 'count', toId: 'ghost', toField: 'value' }],
    })).toThrow(/not in this plan/)
  })
})

describe('layout', () => {
  it('honors explicit positions and lays out the rest by depth', () => {
    const result = plan({
      widgets: [
        { ...widget('text', 'pinned'), position: { x: 999, y: 111 } },
        widget('text', 'a'),
        { ...widget('text', 'b'), parentId: 'a' },
      ],
    })
    const placed = layoutWidgetPlan(result)
    expect(placed.get('pinned')).toEqual({ x: 999, y: 111 })
    expect(placed.get('a')!.x).toBeLessThan(placed.get('b')!.x)
  })

  it('never stacks two laid-out widgets on the same point', () => {
    const result = plan({ widgets: Array.from({ length: 6 }, (_, i) => widget('text', `w${i}`)) })
    const points = [...layoutWidgetPlan(result).values()].map((p) => `${p.x},${p.y}`)
    expect(new Set(points).size).toBe(points.length)
  })
})

describe('applying a plan to a canvas document', () => {
  const ids = () => {
    let n = 0
    return () => `id-${++n}`
  }

  it('adds widgets and returns the created ids', () => {
    const result = applyWidgetPlan(emptyDocument(), plan({ widgets: [widget('text', 'a')] }), ids())
    expect(result.createdWidgetIds).toEqual(['id-1'])
    expect(Object.keys(result.document.widgets)).toEqual(['id-1'])
    expect(result.document.widgets['id-1']!.canvasId).toBe(CANVAS)
  })

  it('turns parent links into real parent relations', () => {
    const applied = applyWidgetPlan(
      emptyDocument(),
      plan({ widgets: [widget('text', 'a'), { ...widget('text', 'b'), parentId: 'a' }] }),
      ids(),
    )
    const relations = Object.values(applied.document.relations)
    expect(relations).toHaveLength(1)
    expect(relations[0]!.type).toBe('parent')
    expect(relations[0]!.fromId).toBe(applied.idMap.a)
    expect(relations[0]!.toId).toBe(applied.idMap.b)
  })

  it('preserves unknown fields already on the document', () => {
    const document = { ...emptyDocument(), somethingNewerWrote: { keep: true } } as CloudCanvasDocument
    const applied = applyWidgetPlan(document, plan({ widgets: [widget('text', 'a')] }), ids())
    expect(applied.document).toHaveProperty('somethingNewerWrote', { keep: true })
  })

  it('keeps widgets that were already on the canvas', () => {
    const shared = ids()
    const first = applyWidgetPlan(emptyDocument(), plan({ widgets: [widget('text', 'a')] }), shared)
    const second = applyWidgetPlan(first.document, plan({ widgets: [widget('text', 'b')] }), shared)
    expect(Object.keys(second.document.widgets)).toHaveLength(2)
  })

  it('refuses rather than overwrite when the id source repeats itself', () => {
    const first = applyWidgetPlan(emptyDocument(), plan({ widgets: [widget('text', 'a')] }), ids())
    expect(() => applyWidgetPlan(first.document, plan({ widgets: [widget('text', 'b')] }), ids()))
      .toThrow(/already exists on this canvas/)
  })

  it('refuses a plan aimed at a different canvas', () => {
    const document = { ...emptyDocument(), canvasId: 'other' }
    expect(() => applyWidgetPlan(document, plan({ widgets: [widget('text', 'a')] }), ids()))
      .toThrow(McpPlanError)
  })

  it('writes wires as enabled connections with mapped ids', () => {
    const source = fieldsFor('counter')[0]!
    const target = fieldsFor('rating').find((field) => field.set)!
    const applied = applyWidgetPlan(
      emptyDocument(),
      plan({
        widgets: [widget('counter', 'c'), widget('rating', 'r')],
        wires: [{ fromId: 'c', fromField: source.key, toId: 'r', kind: 'value', toField: target.key }],
      }),
      ids(),
    )
    const connection = Object.values(applied.document.connections)[0]!
    expect(connection.enabled).toBe(true)
    expect(connection.fromId).toBe(applied.idMap.c)
    expect(connection.toId).toBe(applied.idMap.r)
  })
})

describe('the JSON Schema stays in step with the normalizer', () => {
  it('offers exactly the plannable types', () => {
    const schemaTypes = WIDGET_PLAN_JSON_SCHEMA.properties.widgets.items.properties.type.enum
    expect([...schemaTypes]).toEqual([...PLANNABLE_WIDGET_TYPES])
  })

  it('has a content normalizer for every plannable type', () => {
    for (const type of PLANNABLE_WIDGET_TYPES) {
      expect(() => plan({ widgets: [widget(type)] })).not.toThrow()
    }
  })

  it('declares the same caps the normalizer enforces', () => {
    expect(WIDGET_PLAN_JSON_SCHEMA.properties.widgets.maxItems).toBe(MCP_PLAN_LIMITS.maxWidgets)
    expect(WIDGET_PLAN_JSON_SCHEMA.properties.relations.maxItems).toBe(MCP_PLAN_LIMITS.maxRelations)
    expect(WIDGET_PLAN_JSON_SCHEMA.properties.wires.maxItems).toBe(MCP_PLAN_LIMITS.maxWires)
    expect(WIDGET_PLAN_JSON_SCHEMA.properties.widgets.items.properties.title.maxLength)
      .toBe(MCP_PLAN_LIMITS.maxTitleLength)
  })
})
