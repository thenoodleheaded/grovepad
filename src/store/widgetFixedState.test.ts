import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'
import { ICONIFIED_SIZE } from '../types/spatial'
import { clearLiveWidgetSizing, setLiveWidgetSizing } from './liveWidgetSizing'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  for (const id of Object.keys(useWidgetStore.getState().widgets)) clearLiveWidgetSizing(id)
  useWidgetStore.getState().loadBoard(baseline)
})

describe('widget scale states', () => {
  it('preserves the full size through pill and icon transitions', () => {
    const id = Object.keys(useWidgetStore.getState().widgets)[0]!
    const widget = useWidgetStore.getState().widgets[id]!
    useWidgetStore.getState().setWidgetScaleState(id, 'pill')
    let scaled = useWidgetStore.getState().widgets[id]!
    expect(scaled.collapsed).toBe(true)
    expect(scaled.expandedSize).toEqual(widget.size)
    expect(scaled.size.height).toBe(40)

    useWidgetStore.getState().setWidgetScaleState(id, 'icon')
    scaled = useWidgetStore.getState().widgets[id]!
    expect(scaled.iconified).toBe(true)
    expect(scaled.collapsed).toBe(false)
    expect(scaled.size).toEqual(ICONIFIED_SIZE)

    useWidgetStore.getState().setWidgetScaleState(id, 'full')
    scaled = useWidgetStore.getState().widgets[id]!
    expect(scaled.collapsed).toBe(false)
    expect(scaled.iconified).toBe(false)
    expect(scaled.expandedSize).toBeUndefined()
    expect(scaled.size.width).toBeGreaterThanOrEqual(widget.size.width)
    expect(scaled.size.height).toBeGreaterThanOrEqual(widget.size.height)
  })

  it('keeps pill geometry inert during ordinary resize attempts', () => {
    const id = Object.keys(useWidgetStore.getState().widgets)[0]!
    useWidgetStore.getState().setWidgetScaleState(id, 'pill')
    const pill = useWidgetStore.getState().widgets[id]!

    useWidgetStore.getState().resizeWidget(id, {
      width: pill.size.width + 200,
      height: pill.size.height + 200,
    })

    expect(useWidgetStore.getState().widgets[id]!.size).toEqual(pill.size)
    expect(useWidgetStore.getState().widgets[id]!.collapsed).toBe(true)
  })

  it('grows the dormant full size when collapsed table content grows', () => {
    const id = useWidgetStore.getState().createWidget('Table', { x: 0, y: 0 }, 'table')
    useWidgetStore.getState().setWidgetScaleState(id, 'pill')
    const before = useWidgetStore.getState().widgets[id]!.expandedSize!
    useWidgetStore.getState().updateWidgetData(id, {
      rows: [
        ['A very long functional heading', 'Owner', 'Status'],
        ['One', 'Amir', 'Ready'],
        ['Two', 'Amir', 'Ready'],
        ['Three', 'Amir', 'Ready'],
        ['Four', 'Amir', 'Ready'],
      ],
    })
    const after = useWidgetStore.getState().widgets[id]!.expandedSize!
    expect(after.width).toBeGreaterThan(before.width)
    expect(after.height).toBeGreaterThan(before.height)
    expect(useWidgetStore.getState().widgets[id]!.size.height).toBe(40)
  })

  it('applies a mounted content floor to programmatic resize paths', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 0, y: 0 }, 'notes')
    setLiveWidgetSizing(id, { minWidth: 444, minHeight: 280 })
    useWidgetStore.getState().resizeWidget(id, { width: 100, height: 100 })
    expect(useWidgetStore.getState().widgets[id]!.size).toEqual({ width: 444, height: 280 })
  })

  it('never auto-shrinks after content becomes shorter', () => {
    const id = useWidgetStore.getState().createWidget('Budget', { x: 0, y: 0 }, 'budget')
    useWidgetStore.getState().updateWidgetData(id, {
      currency: '$',
      items: [{ id: 'row', label: 'A very long infrastructure commitment', amount: 12 }],
    })
    const grown = useWidgetStore.getState().widgets[id]!.size
    useWidgetStore.getState().updateWidgetData(id, {
      currency: '$',
      items: [{ id: 'row', label: 'Hosting', amount: 12 }],
    })
    expect(useWidgetStore.getState().widgets[id]!.size).toEqual(grown)
  })
})
