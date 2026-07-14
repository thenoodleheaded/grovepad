import { describe, expect, it } from 'vitest'
import type { Connection } from '../types/circuit'
import { isValidConnectionShape, suggestTransform } from '../types/circuit'
import type { ChecklistData, CounterData, ModuleData, ModuleType, ProgressData, Widget, WorldClockData } from '../types/spatial'
import { commandsFor, fieldDescriptor } from '../widgets/fields'
import {
  buildConnectionIndex,
  runWave,
  timeSensitiveSourceIds,
  type DeliveryState,
} from './circuitEngine'
import { applyTransform, serializeFieldValue } from './transforms'
import {
  findWireTarget,
  hitTestInputPort,
  inputPortsFor,
  outputPortsFor,
  portWorldPosition,
} from '../utils/portGeometry'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let widgetCounter = 0

function widget(type: ModuleType, data: ModuleData, x = 0, y = 0): Widget {
  widgetCounter++
  return {
    id: `w${widgetCounter}`,
    type,
    title: `${type} ${widgetCounter}`,
    canvasId: 'canvas-1',
    position: { x, y },
    size: { width: 280, height: 200 },
    data,
    metadata: { badges: [] },
  }
}

function record(widgets: Widget[]): Record<string, Widget> {
  return Object.fromEntries(widgets.map((item) => [item.id, item]))
}

let connectionCounter = 0

function wire(partial: Omit<Connection, 'id' | 'enabled'> & { enabled?: boolean }): Connection {
  connectionCounter++
  return { id: `c${connectionCounter}`, enabled: true, ...partial }
}

function waveOnce(
  widgets: Record<string, Widget>,
  connections: Connection[],
  seeds: string[],
  lastDelivered = new Map<string, DeliveryState>(),
  options: { baselineOnly?: boolean; damped?: Set<string> } = {},
) {
  const index = buildConnectionIndex(Object.fromEntries(connections.map((c) => [c.id, c])))
  return {
    result: runWave({
      widgets,
      index,
      seeds,
      lastDelivered,
      dampedIds: options.damped ?? new Set(),
      baselineOnly: options.baselineOnly,
    }),
    lastDelivered,
  }
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

describe('wire transforms', () => {
  it('applies each op correctly', () => {
    expect(applyTransform(10, { op: 'identity' })).toBe(10)
    expect(applyTransform(10, { op: 'scale', factor: 2.5 })).toBe(25)
    expect(applyTransform(10, { op: 'offset', amount: -4 })).toBe(6)
    expect(applyTransform(150, { op: 'clamp', min: 0, max: 100 })).toBe(100)
    expect(applyTransform(50, { op: 'map_range', inMin: 0, inMax: 100, outMin: 0, outMax: 1 })).toBe(0.5)
    expect(applyTransform(2.6, { op: 'round' })).toBe(3)
    expect(applyTransform(true, { op: 'invert' })).toBe(false)
    expect(applyTransform(7, { op: 'invert' })).toBe(-7)
    expect(applyTransform(5, { op: 'threshold', value: 5 })).toBe(true)
    expect(applyTransform(4.9, { op: 'threshold', value: 5 })).toBe(false)
    expect(applyTransform(42, { op: 'format', template: 'Score: {value} pts' })).toBe('Score: 42 pts')
  })

  it('never produces NaN or Infinity', () => {
    expect(applyTransform('not a number', { op: 'scale', factor: 3 })).toBe(0)
    expect(applyTransform(10, { op: 'map_range', inMin: 5, inMax: 5, outMin: 0, outMax: 1 })).toBe(0)
    expect(applyTransform(Number.MAX_VALUE, { op: 'scale', factor: Number.MAX_VALUE })).toBe(0)
  })

  it('coerces booleans and text through numeric ops', () => {
    expect(applyTransform(true, { op: 'scale', factor: 5 })).toBe(5)
    expect(applyTransform('12.5', { op: 'offset', amount: 0.5 })).toBe(13)
  })
})

// ---------------------------------------------------------------------------
// Value propagation
// ---------------------------------------------------------------------------

describe('value propagation', () => {
  it('delivers a source change through a wire with a transform', () => {
    const counter = widget('counter', { label: '', count: 4, step: 1 })
    const progress = widget('progress', { label: '', percent: 0 })
    const widgets = record([counter, progress])
    const connection = wire({
      fromId: counter.id,
      fromField: 'count',
      toId: progress.id,
      kind: 'value',
      toField: 'percent',
      transform: { op: 'scale', factor: 10 },
    })

    const { result } = waveOnce(widgets, [connection], [counter.id])
    expect(result.firedIds).toEqual([connection.id])
    expect((result.writes.get(progress.id) as ProgressData).percent).toBe(40)
  })

  it('is silent when the delivered value has not changed (fixpoint)', () => {
    const counter = widget('counter', { label: '', count: 4, step: 1 })
    const progress = widget('progress', { label: '', percent: 0 })
    const widgets = record([counter, progress])
    const connection = wire({
      fromId: counter.id,
      fromField: 'count',
      toId: progress.id,
      kind: 'value',
      toField: 'percent',
    })
    const memory = new Map<string, DeliveryState>()
    const first = waveOnce(widgets, [connection], [counter.id], memory)
    expect(first.result.writes.size).toBe(1)
    // Commit the write, then re-seed: nothing new to say.
    const progressAfter = { ...progress, data: first.result.writes.get(progress.id)! }
    const second = waveOnce(record([counter, progressAfter]), [connection], [counter.id], memory)
    expect(second.result.writes.size).toBe(0)
    expect(second.result.firedIds).toEqual([])
  })

  it('chains across widgets within one wave', () => {
    const counter = widget('counter', { label: '', count: 7, step: 1 })
    const middle = widget('number_input', { label: '', value: 0, min: 0, max: 100, step: 1 })
    const progress = widget('progress', { label: '', percent: 0 })
    const widgets = record([counter, middle, progress])
    const first = wire({ fromId: counter.id, fromField: 'count', toId: middle.id, kind: 'value', toField: 'value' })
    const second = wire({ fromId: middle.id, fromField: 'value', toId: progress.id, kind: 'value', toField: 'percent' })

    const { result } = waveOnce(widgets, [first, second], [counter.id])
    expect(result.firedIds).toEqual([first.id, second.id])
    expect((result.writes.get(progress.id) as ProgressData).percent).toBe(7)
  })

  it('terminates on cycles: each wire fires at most once per wave', () => {
    const a = widget('counter', { label: '', count: 1, step: 1 })
    const b = widget('counter', { label: '', count: 2, step: 1 })
    const widgets = record([a, b])
    const forward = wire({ fromId: a.id, fromField: 'count', toId: b.id, kind: 'value', toField: 'count' })
    const backward = wire({ fromId: b.id, fromField: 'count', toId: a.id, kind: 'value', toField: 'count' })

    const { result } = waveOnce(widgets, [forward, backward], [a.id])
    // forward delivers 1 to b; backward reads b's pending 1, delivers to a
    // which already holds 1 → skipped. Bounded, no infinite loop.
    expect(result.firedIds.length).toBeLessThanOrEqual(2)
    expect((result.writes.get(b.id) as CounterData).count).toBe(1)
  })

  it('skips disabled and damped wires', () => {
    const counter = widget('counter', { label: '', count: 9, step: 1 })
    const progress = widget('progress', { label: '', percent: 0 })
    const widgets = record([counter, progress])
    const disabled = wire({
      fromId: counter.id,
      fromField: 'count',
      toId: progress.id,
      kind: 'value',
      toField: 'percent',
      enabled: false,
    })
    expect(waveOnce(widgets, [disabled], [counter.id]).result.writes.size).toBe(0)

    const active = wire({ fromId: counter.id, fromField: 'count', toId: progress.id, kind: 'value', toField: 'percent' })
    const damped = waveOnce(widgets, [active], [counter.id], new Map(), { damped: new Set([active.id]) })
    expect(damped.result.writes.size).toBe(0)
  })

  it('baseline mode records memory without writing', () => {
    const counter = widget('counter', { label: '', count: 3, step: 1 })
    const progress = widget('progress', { label: '', percent: 0 })
    const widgets = record([counter, progress])
    const connection = wire({ fromId: counter.id, fromField: 'count', toId: progress.id, kind: 'value', toField: 'percent' })
    const memory = new Map<string, DeliveryState>()

    const baseline = waveOnce(widgets, [connection], [counter.id], memory, { baselineOnly: true })
    expect(baseline.result.writes.size).toBe(0)
    expect(memory.get(connection.id)?.serialized).toBe(serializeFieldValue(3))

    // After baselining, an unchanged source stays silent…
    const silent = waveOnce(widgets, [connection], [counter.id], memory)
    expect(silent.result.writes.size).toBe(0)
    // …and a real change flows.
    const bumped = { ...counter, data: { label: '', count: 5, step: 1 } }
    const moved = waveOnce(record([bumped, progress]), [connection], [counter.id], memory)
    expect((moved.result.writes.get(progress.id) as ProgressData).percent).toBe(5)
  })

  it('coerces across value types via the target setter', () => {
    const toggle = widget('toggle', { value: true, onLabel: '', offLabel: '' } as never)
    const counter = widget('counter', { label: '', count: 0, step: 1 })
    const widgets = record([toggle, counter])
    const connection = wire({ fromId: toggle.id, fromField: 'value', toId: counter.id, kind: 'value', toField: 'count' })
    const { result } = waveOnce(widgets, [connection], [toggle.id])
    expect((result.writes.get(counter.id) as CounterData).count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Trigger wires
// ---------------------------------------------------------------------------

describe('trigger wires', () => {
  function checklistPair(allDone: boolean) {
    const checklist = widget('checklist', {
      items: [
        { id: 'i1', label: 'a', done: true },
        { id: 'i2', label: 'b', done: allDone },
      ],
    })
    const timer = widget('timer', { label: '', durationSeconds: 60, remainingSeconds: 30, endAt: 99 })
    return { checklist, timer }
  }

  it('fires a command on the rising edge only', () => {
    const { checklist, timer } = checklistPair(false)
    const connection = wire({
      fromId: checklist.id,
      fromField: 'all_done',
      toId: timer.id,
      kind: 'trigger',
      command: 'reset',
      edge: 'rising',
    })
    const memory = new Map<string, DeliveryState>()

    // Baseline observation (false) — no fire.
    const first = waveOnce(record([checklist, timer]), [connection], [checklist.id], memory)
    expect(first.result.writes.size).toBe(0)

    // false → true: fires, timer resets.
    const done = checklistPair(true)
    done.checklist.id = checklist.id
    done.timer.id = timer.id
    const second = waveOnce(record([done.checklist, timer]), [connection], [checklist.id], memory)
    expect(second.result.firedIds).toEqual([connection.id])
    const timerData = second.result.writes.get(timer.id) as { endAt: number | null; remainingSeconds: number }
    expect(timerData.endAt).toBeNull()
    expect(timerData.remainingSeconds).toBe(60)

    // true → false is a falling edge: rising trigger stays quiet.
    const third = waveOnce(record([checklist, timer]), [connection], [checklist.id], memory)
    expect(third.result.writes.size).toBe(0)
  })

  it('a change-edge trigger fires on any source movement', () => {
    const counter = widget('counter', { label: '', count: 1, step: 1 })
    const target = widget('counter', { label: '', count: 100, step: 1 })
    const connection = wire({
      fromId: counter.id,
      fromField: 'count',
      toId: target.id,
      kind: 'trigger',
      command: 'increment',
      edge: 'change',
    })
    const memory = new Map<string, DeliveryState>()
    waveOnce(record([counter, target]), [connection], [counter.id], memory) // baseline
    const bumped = { ...counter, data: { label: '', count: 2, step: 1 } }
    const { result } = waveOnce(record([bumped, target]), [connection], [counter.id], memory)
    expect((result.writes.get(target.id) as CounterData).count).toBe(101)
  })

  it('routes automation execute to the async executor, not the pure command', () => {
    const toggle = widget('toggle', { value: false, onLabel: '', offLabel: '' } as never)
    const script = widget('script_block', {
      label: 'Script', input: '', output: '', config: 'return 1', mode: 'standard',
      enabled: true, running: false, count: 0, concurrency: 1, lastRunAt: null, lastError: '', items: [],
    })
    const connection = wire({
      fromId: toggle.id,
      fromField: 'value',
      toId: script.id,
      kind: 'trigger',
      command: 'execute',
      edge: 'rising',
    })
    const memory = new Map<string, DeliveryState>()
    waveOnce(record([toggle, script]), [connection], [toggle.id], memory) // baseline false
    const on = { ...toggle, data: { value: true, onLabel: '', offLabel: '' } as never }
    const { result } = waveOnce(record([on, script]), [connection], [toggle.id], memory)
    expect(result.executeRequests).toEqual([script.id])
    expect(result.writes.size).toBe(0)
  })

  it('delivers the source value as the command payload (single-wire add-item)', () => {
    const source = widget('text_input', { label: '', value: '', placeholder: '' } as never)
    const checklist = widget('checklist', { items: [] } as ChecklistData)
    const connection = wire({
      fromId: source.id,
      fromField: 'value',
      toId: checklist.id,
      kind: 'trigger',
      command: 'add_item',
      edge: 'change',
    })
    const memory = new Map<string, DeliveryState>()
    waveOnce(record([source, checklist]), [connection], [source.id], memory) // baseline ""
    const typed = { ...source, data: { label: '', value: 'Buy milk', placeholder: '' } }
    const { result } = waveOnce(record([typed, checklist]), [connection], [source.id], memory)
    const written = result.writes.get(checklist.id) as ChecklistData
    expect(written.items).toHaveLength(1)
    expect(written.items[0]).toMatchObject({ label: 'Buy milk', done: false })
  })

  it('applies the wire transform to the payload before the command reads it', () => {
    const source = widget('text_input', { label: '', value: '', placeholder: '' } as never)
    const checklist = widget('checklist', { items: [] } as ChecklistData)
    const connection = wire({
      fromId: source.id,
      fromField: 'value',
      toId: checklist.id,
      kind: 'trigger',
      command: 'add_item',
      edge: 'change',
      transform: { op: 'format', template: '[wired] {value}' },
    })
    const memory = new Map<string, DeliveryState>()
    waveOnce(record([source, checklist]), [connection], [source.id], memory)
    const typed = { ...source, data: { label: '', value: 'Buy milk', placeholder: '' } }
    const { result } = waveOnce(record([typed, checklist]), [connection], [source.id], memory)
    const written = result.writes.get(checklist.id) as ChecklistData
    expect(written.items[0]?.label).toBe('[wired] Buy milk')
  })

  it('world_clock.add_zone validates, dedupes, and rejects bad payloads', () => {
    const clock = widget('world_clock', { zones: ['UTC'] } as WorldClockData)
    const addZone = commandsFor('world_clock').find((c) => c.key === 'add_zone')!
    expect(addZone.acceptsPayload).toBe(true)
    expect((addZone.run(clock.data, 'Asia/Tokyo') as WorldClockData).zones).toEqual(['UTC', 'Asia/Tokyo'])
    expect((addZone.run(clock.data, 'UTC') as WorldClockData).zones).toEqual(['UTC']) // dedupe
    expect((addZone.run(clock.data, 'Not/AZone') as WorldClockData).zones).toEqual(['UTC']) // invalid IANA name
    expect((addZone.run(clock.data, '') as WorldClockData).zones).toEqual(['UTC']) // empty payload
  })
})

// ---------------------------------------------------------------------------
// Support surfaces
// ---------------------------------------------------------------------------

describe('suggestTransform', () => {
  it('suggests the one obviously-correct conversion for known unit pairs', () => {
    expect(suggestTransform('ratio', 'percent')).toEqual({ op: 'scale', factor: 100 })
    expect(suggestTransform('percent', 'ratio')).toEqual({ op: 'scale', factor: 0.01 })
    expect(suggestTransform('count', 'percent')).toEqual({ op: 'clamp', min: 0, max: 100 })
  })

  it('never suggests anything for unmatched, missing, identical, or none-tagged units', () => {
    expect(suggestTransform('currency', 'count')).toBeUndefined()
    expect(suggestTransform('percent', 'percent')).toBeUndefined()
    expect(suggestTransform(undefined, 'percent')).toBeUndefined()
    expect(suggestTransform('count', undefined)).toBeUndefined()
    expect(suggestTransform('none', 'percent')).toBeUndefined()
  })
})

describe('engine support', () => {
  it('detects time-sensitive sources', () => {
    const countdown = widget('countdown', { targetDate: '2030-01-01', label: '' } as never)
    const notes = widget('notes', { text: '' })
    const connection = wire({
      fromId: countdown.id,
      fromField: 'days_left',
      toId: notes.id,
      kind: 'value',
      toField: 'text',
    })
    const widgets = record([countdown, notes])
    expect(timeSensitiveSourceIds({ [connection.id]: connection }, widgets)).toEqual([countdown.id])
    const staticWire = wire({ fromId: notes.id, fromField: 'text', toId: countdown.id, kind: 'trigger', command: 'reset', edge: 'change' })
    expect(timeSensitiveSourceIds({ [staticWire.id]: staticWire }, widgets)).toEqual([])
  })

  it('validates connection shapes for persistence', () => {
    const good: Connection = wire({
      fromId: 'a', fromField: 'count', toId: 'b', kind: 'value', toField: 'percent',
      transform: { op: 'clamp', min: 0, max: 100 },
    })
    expect(isValidConnectionShape(good)).toBe(true)
    expect(isValidConnectionShape({ ...good, transform: { op: 'clamp', min: 'x', max: 1 } })).toBe(false)
    expect(isValidConnectionShape({ ...good, kind: 'trigger' })).toBe(false) // trigger needs command+edge
    expect(
      isValidConnectionShape(wire({ fromId: 'a', fromField: 'f', toId: 'b', kind: 'trigger', command: 'reset', edge: 'rising' })),
    ).toBe(true)
    expect(isValidConnectionShape({ id: 1 })).toBe(false)
  })

  it('port geometry is deterministic and agrees with hit testing', () => {
    const progress = widget('progress', { label: '', percent: 10 }, 100, 100)
    const outs = outputPortsFor('progress')
    const ins = inputPortsFor('progress')
    expect(outs.length).toBeGreaterThan(0)
    expect(ins.some((port) => port.kind === 'field' && port.key === 'percent')).toBe(true)
    expect(ins.some((port) => port.kind === 'command' && port.key === 'reset')).toBe(true)

    const first = ins[0]!
    const at = portWorldPosition(progress, 'in', first.index, ins.length)
    expect(at.x).toBe(100) // left rail
    expect(hitTestInputPort(progress, at)?.key).toBe(first.key)
    expect(hitTestInputPort(progress, { x: at.x + 200, y: at.y })).toBeNull()

    const hit = findWireTarget(
      { x: progress.position.x + 40, y: progress.position.y + 40 },
      record([progress]),
      'canvas-1',
      'someone-else',
    )
    expect(hit?.widgetId).toBe(progress.id)
  })

  it('every registered field key resolves through fieldDescriptor', () => {
    // The wave engine looks descriptors up by key; the registry must be
    // internally consistent for every port the UI can offer.
    const types: ModuleType[] = ['counter', 'progress', 'checklist', 'toggle', 'formula', 'script_block', 'notes']
    for (const type of types) {
      for (const port of outputPortsFor(type)) {
        expect(fieldDescriptor(type, port.key), `${type}.${port.key}`).toBeDefined()
      }
    }
  })

  it('ports spread across the ENTIRE usable side, not a center cluster', () => {
    // script_block has 11 input ports; on a tall card they must run from the
    // top corner padding to the bottom corner padding, evenly divided.
    const script = widget('script_block', {
      label: '', input: '', output: '', config: '', mode: 'standard',
      enabled: true, running: false, count: 0, concurrency: 1, lastRunAt: null, lastError: '', items: [],
    })
    script.size = { width: 360, height: 480 }
    const ports = inputPortsFor('script_block')
    const first = portWorldPosition(script, 'in', 0, ports.length)
    const last = portWorldPosition(script, 'in', ports.length - 1, ports.length)
    const padding = 26 // RAIL_PADDING — clear of the r0 corner radius
    expect(first.y).toBeCloseTo(script.position.y + padding, 5)
    expect(last.y).toBeCloseTo(script.position.y + script.size.height - padding, 5)
    // Even division: consecutive gaps identical.
    const secondY = portWorldPosition(script, 'in', 1, ports.length).y
    const thirdY = portWorldPosition(script, 'in', 2, ports.length).y
    expect(secondY - first.y).toBeCloseTo(thirdY - secondY, 5)
  })

  it('compresses dense rails inside short cards instead of placing ports outside', () => {
    const script = widget('script_block', {
      label: '', input: '', output: '', config: '', mode: 'standard',
      enabled: true, running: false, count: 0, concurrency: 1, lastRunAt: null, lastError: '', items: [],
    })
    script.size = { width: 240, height: 80 }
    const ports = inputPortsFor('script_block')
    const positions = ports.map((port) => portWorldPosition(script, 'in', port.index, ports.length).y)
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(script.position.y + 26)
    expect(Math.max(...positions)).toBeLessThanOrEqual(script.position.y + script.size.height - 26)
  })
})
