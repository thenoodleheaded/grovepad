import { describe, expect, it } from 'vitest'
import { useWidgetStore } from './useWidgetStore'

describe('connection lifecycle in the widget store', () => {
  it('creates, enforces single-writer, cascades on delete, and undoes', () => {
    const store = useWidgetStore.getState()
    const a = store.createWidget('Source A', { x: 9000, y: 9000 }, 'counter')
    const b = store.createWidget('Source B', { x: 9000, y: 9400 }, 'counter')
    const target = store.createWidget('Target', { x: 9600, y: 9000 }, 'progress')

    // Rejects self-wires and unknown fields.
    expect(
      useWidgetStore.getState().addConnection({ fromId: a, fromField: 'count', toId: a, kind: 'value', toField: 'count' }),
    ).toBeNull()
    expect(
      useWidgetStore.getState().addConnection({ fromId: a, fromField: 'nope', toId: target, kind: 'value', toField: 'percent' }),
    ).toBeNull()
    expect(
      useWidgetStore.getState().addConnection({ fromId: a, fromField: 'count', toId: target, kind: 'value', toField: 'not_a_field' }),
    ).toBeNull()

    const first = useWidgetStore.getState().addConnection({
      fromId: a, fromField: 'count', toId: target, kind: 'value', toField: 'percent',
    })
    expect(first).toBeTruthy()

    // Single-writer: a second value wire into the same field replaces the first.
    const second = useWidgetStore.getState().addConnection({
      fromId: b, fromField: 'count', toId: target, kind: 'value', toField: 'percent',
    })
    expect(second).toBeTruthy()
    expect(useWidgetStore.getState().connections[first!]).toBeUndefined()
    expect(useWidgetStore.getState().connections[second!]).toBeDefined()

    // Identical trigger wires dedupe to the existing id.
    const trigger = useWidgetStore.getState().addConnection({
      fromId: a, fromField: 'count', toId: target, kind: 'trigger', command: 'reset', edge: 'change',
    })
    const duplicate = useWidgetStore.getState().addConnection({
      fromId: a, fromField: 'count', toId: target, kind: 'trigger', command: 'reset', edge: 'rising',
    })
    expect(duplicate).toBe(trigger)

    // Deleting an endpoint widget cascades its wires away.
    useWidgetStore.getState().deleteWidgets([target])
    expect(useWidgetStore.getState().connections[second!]).toBeUndefined()
    expect(useWidgetStore.getState().connections[trigger!]).toBeUndefined()

    // Undo restores the widget together with its wires.
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[target]).toBeDefined()
    expect(useWidgetStore.getState().connections[second!]).toBeDefined()

    // Leave the board as we found it.
    useWidgetStore.getState().deleteWidgets([a, b, target])
    expect(
      Object.values(useWidgetStore.getState().connections).some(
        (connection) => connection.fromId === a || connection.toId === target,
      ),
    ).toBe(false)
  })
})
