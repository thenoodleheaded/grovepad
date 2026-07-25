import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

let cursor = 0

/** Two pinned notes far from the seed board, placed side by side with a gap so
 * they start clear of each other. Pinned so their footprint is the stored box. */
function pair(gap = 200): [string, string] {
  const store = useWidgetStore.getState()
  const baseX = 60_000 + cursor * 6_000
  cursor += 1
  const a = store.createWidget('Overlap A', { x: baseX, y: 60_000 }, 'notes')
  const b = store.createWidget('Overlap B', { x: baseX + 1_000, y: 60_000 }, 'notes')
  for (const id of [a, b]) {
    const s = useWidgetStore.getState()
    useWidgetStore.setState({
      widgets: { ...s.widgets, [id]: { ...s.widgets[id]!, metadata: { ...s.widgets[id]!.metadata, pinned: true } } },
    })
  }
  const first = useWidgetStore.getState().widgets[a]!
  place(b, first.position.x + first.size.width + gap, first.position.y)
  return [a, b]
}

function place(id: string, x: number, y: number): void {
  const s = useWidgetStore.getState()
  useWidgetStore.setState({
    widgets: { ...s.widgets, [id]: { ...s.widgets[id]!, position: { x, y } } },
  })
}

const w = (id: string) => useWidgetStore.getState().widgets[id]!

function overlaps(aId: string, bId: string): boolean {
  const a = w(aId)
  const b = w(bId)
  return (
    a.position.x < b.position.x + b.size.width &&
    a.position.x + a.size.width > b.position.x &&
    a.position.y < b.position.y + b.size.height &&
    a.position.y + a.size.height > b.position.y
  )
}

describe('every geometry-changing action runs the overlap check', () => {
  it('a committed resize pushes the neighbour it grew into', () => {
    const [a, b] = pair(40)
    const start = w(b).position.x
    // Grow `a` past the gap so it would land on `b`. The type's own max width
    // clamps the request, so assert the card actually grew before judging the
    // check — otherwise a clamped no-op would pass for the wrong reason.
    const before = w(a).size.width
    useWidgetStore.getState().resizeWidget(a, { width: before + 200, height: w(a).size.height })
    expect(w(a).size.width).toBeGreaterThan(before + 40)
    expect(overlaps(a, b)).toBe(false)
    expect(w(b).position.x).not.toBe(start)
  })

  it('typing into a card whose size does not change disturbs nothing', () => {
    // updateWidgetData compared a freshly built size object against the stored
    // one by REFERENCE, so the guard was always true and a full-board settle
    // ran on every keystroke — shoving neighbours around while you type, and
    // grid-snapping the card being typed in because the pass was unanchored.
    const [a, b] = pair(40)
    // Park them deliberately overlapping: a settle would have to pull them
    // apart, so if nothing moves, no settle ran.
    place(b, w(a).position.x + 20, w(a).position.y + 20)
    expect(overlaps(a, b)).toBe(true)
    const start = { ...w(b).position }
    const size = { ...w(a).size }

    useWidgetStore.getState().updateWidgetData(a, { text: 'typing' })

    expect(w(a).size).toEqual(size)
    expect(w(b).position).toEqual(start)
  })

  it('a LIVE resize frame does not disturb anything', () => {
    // snap:false is one animation frame of a drag — settling here would shove
    // neighbours around under the pointer.
    const [a, b] = pair(200)
    const start = { ...w(b).position }
    useWidgetStore.getState().resizeWidget(a, { width: w(a).size.width + 600, height: w(a).size.height }, false)
    expect(w(b).position).toEqual(start)
  })

  it('an edge resize holds the grabbed card still and moves the neighbour', () => {
    const [a, b] = pair(200)
    const anchored = { ...w(a).position }
    useWidgetStore.getState().resizeWidgetFromEdge(
      a,
      { width: w(a).size.width + 600, height: w(a).size.height },
      { x: 1, y: 0 },
      true,
    )
    expect(w(a).position).toEqual(anchored)
    expect(overlaps(a, b)).toBe(false)
  })

  it('swapping an icon back to a full card clears the room it needs', () => {
    const [a, b] = pair(60)
    useWidgetStore.getState().setWidgetScaleState(a, 'icon')
    // Tuck `b` right up against the small icon, then re-open `a`.
    place(b, w(a).position.x + w(a).size.width + 20, w(a).position.y)
    useWidgetStore.getState().setWidgetScaleState(a, 'full')
    expect(overlaps(a, b)).toBe(false)
  })

  it('pinning a card open clears the room its full box needs', () => {
    const [a, b] = pair(200)
    // Unpin `a` so it rests as a compact tile, tuck `b` in close, then pin it
    // open — the full card is far bigger than the tile it replaces.
    useWidgetStore.getState().toggleWidgetPinned(a)
    place(b, w(a).position.x + 100, w(a).position.y)
    useWidgetStore.getState().toggleWidgetPinned(a)
    expect(overlaps(a, b)).toBe(false)
  })

  it('snapping to the grid resolves any overlap it lands in', () => {
    const [a, b] = pair(200)
    place(a, w(b).position.x - 30, w(b).position.y)
    expect(overlaps(a, b)).toBe(true)
    useWidgetStore.getState().snapWidgetToGrid(a)
    expect(overlaps(a, b)).toBe(false)
  })
})
