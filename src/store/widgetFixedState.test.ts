import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'
import { useWidgetRestStore } from './useWidgetRestStore'
import { ICON_MAX_EDGE, ICONIFIED_SIZE, WIDGET_MAX_EDGE } from '../types/spatial'
import { GLUE_GAP } from '../utils/glueGeometry'
import { expandedIconSize, expansionOffsetFor, restingTileSize } from '../utils/widgetRest'
import { clearLiveWidgetSizing, setLiveWidgetSizing } from './liveWidgetSizing'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetRestStore.getState().collapseWidget()
  for (const id of Object.keys(useWidgetStore.getState().widgets)) clearLiveWidgetSizing(id)
  useWidgetStore.getState().loadBoard(baseline)
})

describe('widget scale states', () => {
  it('preserves the full size through an icon round trip', () => {
    const id = Object.keys(useWidgetStore.getState().widgets)[0]!
    const widget = useWidgetStore.getState().widgets[id]!
    useWidgetStore.getState().setWidgetScaleState(id, 'icon')
    let scaled = useWidgetStore.getState().widgets[id]!
    expect(scaled.iconified).toBe(true)
    expect(scaled.expandedSize).toEqual(widget.size)
    expect(scaled.size).toEqual(ICONIFIED_SIZE)

    useWidgetStore.getState().setWidgetScaleState(id, 'full')
    scaled = useWidgetStore.getState().widgets[id]!
    expect(scaled.iconified).toBe(false)
    expect(scaled.expandedSize).toBeUndefined()
    expect(scaled.size.width).toBeGreaterThanOrEqual(widget.size.width)
    expect(scaled.size.height).toBeGreaterThanOrEqual(widget.size.height)
    expect(scaled.position).toEqual(widget.position)
  })

  it('clamps an icon to its own square range during ordinary resize attempts', () => {
    const id = Object.keys(useWidgetStore.getState().widgets)[0]!
    useWidgetStore.getState().setWidgetScaleState(id, 'icon')

    useWidgetStore.getState().resizeWidget(id, { width: 4000, height: 4000 })

    const icon = useWidgetStore.getState().widgets[id]!
    expect(icon.size).toEqual({ width: ICON_MAX_EDGE, height: ICON_MAX_EDGE })
    expect(icon.iconified).toBe(true)
  })

  it('keeps icon scaling continuous until the committed release snaps it', () => {
    const id = Object.keys(useWidgetStore.getState().widgets)[0]!
    useWidgetStore.getState().setWidgetScaleState(id, 'icon')

    useWidgetStore.getState().resizeWidget(id, { width: 97.5, height: 97.5 }, false)
    expect(useWidgetStore.getState().widgets[id]!.size)
      .toEqual({ width: 97.5, height: 97.5 })

    useWidgetStore.getState().resizeWidget(id, { width: 97.5, height: 97.5 }, true)
    expect(useWidgetStore.getState().widgets[id]!.size).toEqual(ICONIFIED_SIZE)

    useWidgetStore.getState().resizeWidget(id, { width: 101.25, height: 101.25 }, false)
    expect(useWidgetStore.getState().widgets[id]!.size)
      .toEqual({ width: 101.25, height: 101.25 })

    useWidgetStore.getState().resizeWidget(id, { width: 101.25, height: 101.25 }, true)
    expect(useWidgetStore.getState().widgets[id]!.size)
      .toEqual({ width: ICON_MAX_EDGE, height: ICON_MAX_EDGE })
    expect(useWidgetStore.getState().widgets[id]!.iconified).toBe(true)
  })

  it('keeps the opposite icon corner pinned when release changes its size', () => {
    const id = Object.keys(useWidgetStore.getState().widgets)[0]!
    useWidgetStore.getState().setWidgetScaleState(id, 'icon')
    const start = useWidgetStore.getState().widgets[id]!
    const pinned = {
      x: start.position.x + start.size.width,
      y: start.position.y + start.size.height,
    }

    useWidgetStore.getState().resizeWidgetFromEdge(
      id,
      { width: 101.25, height: 101.25 },
      { x: -1, y: -1 },
      false,
    )
    useWidgetStore.getState().resizeWidgetFromEdge(
      id,
      { width: 101.25, height: 101.25 },
      { x: -1, y: -1 },
      true,
    )

    const snapped = useWidgetStore.getState().widgets[id]!
    expect(snapped.size).toEqual({ width: ICON_MAX_EDGE, height: ICON_MAX_EDGE })
    expect({
      x: snapped.position.x + snapped.size.width,
      y: snapped.position.y + snapped.size.height,
    }).toEqual(pinned)
  })

  it('grows an iconified table height for rows without widening for long cell text', () => {
    const id = useWidgetStore.getState().createWidget('Table', { x: 0, y: 0 }, 'table')
    useWidgetStore.getState().setWidgetScaleState(id, 'icon')
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
    expect(after.width).toBe(before.width)
    expect(after.height).toBeGreaterThan(before.height)
    expect(useWidgetStore.getState().widgets[id]!.size).toEqual(ICONIFIED_SIZE)
  })

  it('caps a content-fit widget at the absolute ceiling instead of growing forever', () => {
    // autoHeight types used to fall back to an Infinity height ceiling, so a
    // long enough list grew until it swallowed the board.
    const id = useWidgetStore.getState().createWidget('Tasks', { x: 0, y: 0 }, 'checklist')
    useWidgetStore.getState().resizeWidget(id, { width: 99_999, height: 99_999 })

    const capped = useWidgetStore.getState().widgets[id]!
    expect(capped.size.width).toBeLessThanOrEqual(WIDGET_MAX_EDGE)
    expect(capped.size.height).toBeLessThanOrEqual(WIDGET_MAX_EDGE)
    expect(capped.size.height).toBe(WIDGET_MAX_EDGE)
  })

  it('holds the ceiling even when a live content floor demands more', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 0, y: 0 }, 'notes')
    setLiveWidgetSizing(id, { minWidth: 99_999, minHeight: 99_999 })
    useWidgetStore.getState().resizeWidget(id, { width: 400, height: 400 })

    const widget = useWidgetStore.getState().widgets[id]!
    expect(widget.size).toEqual({ width: WIDGET_MAX_EDGE, height: WIDGET_MAX_EDGE })
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

describe('retired name-pill state', () => {
  it('restores a board saved mid-pill to its dormant full card', () => {
    const snapshot = buildBoardSnapshot(useWidgetStore.getState())
    const id = Object.keys(snapshot.widgets)[0]!
    const raw = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot
    const widget = raw.widgets[id]! as typeof snapshot.widgets[string] & { collapsed?: boolean }
    widget.collapsed = true
    widget.size = { width: 200, height: 40 }
    widget.expandedSize = { width: 360, height: 240 }

    const parsed = parsePersistedBoard(raw)!
    const restored = parsed.widgets[id]! as typeof widget

    expect(restored.collapsed).toBeUndefined()
    expect(restored.iconified).not.toBe(true)
    expect(restored.size).toEqual({ width: 360, height: 240 })
    expect(restored.expandedSize).toBeUndefined()
  })
})

describe('edge-anchored resize', () => {
  it('pins the opposite side, so a left drag walks the origin', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')
    const before = useWidgetStore.getState().widgets[id]!
    const right = before.position.x + before.size.width

    useWidgetStore.getState().resizeWidgetFromEdge(
      id,
      { width: before.size.width + 120, height: before.size.height },
      { x: -1, y: 0 },
    )

    const after = useWidgetStore.getState().widgets[id]!
    expect(after.size.width).toBe(before.size.width + 120)
    expect(after.position.x + after.size.width).toBe(right)
    expect(after.position.y).toBe(before.position.y)
  })

  it('leaves the origin alone when the dragged side is the right one', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')
    const before = useWidgetStore.getState().widgets[id]!

    useWidgetStore.getState().resizeWidgetFromEdge(
      id,
      { width: before.size.width + 120, height: before.size.height },
      { x: 1, y: 0 },
    )

    expect(useWidgetStore.getState().widgets[id]!.position).toEqual(before.position)
  })
})

describe('re-centred scale states', () => {
  it('lands an icon on the middle of the box the user could see — the resting tile', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')
    const before = useWidgetStore.getState().widgets[id]!
    // A resting-eligible widget shows its tile (top-left-anchored at the
    // stored position), so that tile — not the dormant full card — is the box
    // the icon must land in the middle of.
    const tile = restingTileSize(before)
    const centre = {
      x: before.position.x + tile.width / 2,
      y: before.position.y + tile.height / 2,
    }

    useWidgetStore.getState().setWidgetScaleState(id, 'icon')

    const icon = useWidgetStore.getState().widgets[id]!
    expect({
      x: icon.position.x + icon.size.width / 2,
      y: icon.position.y + icon.size.height / 2,
    }).toEqual(centre)
  })

  it('re-centres on the tile the user could actually see, not the dormant card', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')
    const before = useWidgetStore.getState().widgets[id]!
    const tile = { width: 40, height: 40 }

    useWidgetStore.getState().setWidgetScaleState(id, 'icon', { fromSize: tile })

    const icon = useWidgetStore.getState().widgets[id]!
    expect(icon.position).toEqual({
      x: before.position.x + (tile.width - icon.size.width) / 2,
      y: before.position.y + (tile.height - icon.size.height) / 2,
    })
  })

  it('returns a widget to its exact starting position across a round trip', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')
    const before = useWidgetStore.getState().widgets[id]!

    useWidgetStore.getState().setWidgetScaleState(id, 'icon')
    useWidgetStore.getState().setWidgetScaleState(id, 'full')

    const after = useWidgetStore.getState().widgets[id]!
    expect(after.position).toEqual(before.position)
    expect(after.size).toEqual(before.size)
  })

  it('lands at an exact remembered icon square instead of the 2×2 floor', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')

    useWidgetStore.getState().setWidgetScaleState(id, 'icon', {
      toSize: { width: 97.5, height: 97.5 },
    })

    const icon = useWidgetStore.getState().widgets[id]!
    expect(icon.iconified).toBe(true)
    expect(icon.size).toEqual({ width: 97.5, height: 97.5 })
  })

  it('clamps a remembered square that has drifted outside the icon range', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')

    useWidgetStore.getState().setWidgetScaleState(id, 'icon', {
      toSize: { width: 4000, height: 4000 },
    })

    expect(useWidgetStore.getState().widgets[id]!.size)
      .toEqual({ width: ICON_MAX_EDGE, height: ICON_MAX_EDGE })
  })
})

/**
 * An icon welded to the left edge of a neighbour, far from the seed board. The
 * card the icon opens into is several times the width of its square, so
 * anything that commits the swap shoves the neighbour visibly aside.
 */
function gluedIconPair(): [string, string] {
  const store = useWidgetStore.getState()
  const icon = store.createWidget('Peek', { x: 60_000, y: 60_000 }, 'notes')
  const mate = store.createWidget('Mate', { x: 62_000, y: 60_000 }, 'notes')
  useWidgetStore.getState().setWidgetScaleState(icon, 'icon')
  const square = useWidgetStore.getState().widgets[icon]!
  const widgets = useWidgetStore.getState().widgets
  useWidgetStore.setState({
    widgets: {
      ...widgets,
      [mate]: {
        ...widgets[mate]!,
        position: { x: square.position.x + square.size.width + GLUE_GAP, y: square.position.y },
      },
    },
  })
  useWidgetStore.getState().glueWidgets(mate, icon)
  return [icon, mate]
}

describe('an expansion returns to the state it opened from', () => {
  /** Open an icon the way WidgetCard.expandFromIcon does: take the expansion
   * slot, centred on the icon square, and touch the board not at all. */
  function peekIconOpen(id: string) {
    const icon = useWidgetStore.getState().widgets[id]!
    useWidgetRestStore.getState().expandWidget(
      id,
      expansionOffsetFor(icon.size, expandedIconSize(icon)),
      { kind: 'icon', size: icon.size },
    )
    return icon
  }

  it('writes nothing to the board when an icon is peeked open and closed', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')
    useWidgetStore.getState().setWidgetScaleState(id, 'icon')
    // Grow the icon to an in-between size — nothing about the peek may round
    // it to 2×2 or 3×3, because nothing about the peek touches it at all.
    useWidgetStore.getState().resizeWidget(id, { width: 97.5, height: 97.5 }, false)
    const icon = peekIconOpen(id)
    expect(icon.size).toEqual({ width: 97.5, height: 97.5 })

    // Open: still an icon in the record, same square, same spot — while the
    // card the user sees comes from the box the icon remembers.
    const open = useWidgetStore.getState().widgets[id]!
    expect(open).toEqual(icon)
    expect(expandedIconSize(open)).toEqual(icon.expandedSize)

    useWidgetRestStore.getState().collapseWidget()

    expect(useWidgetStore.getState().widgets[id]!).toEqual(icon)
    expect(useWidgetRestStore.getState().expandedWidgetId).toBe(null)
  })

  it('costs no undo step, so undo still reverses the click before it', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')
    useWidgetStore.getState().setWidgetScaleState(id, 'icon')
    peekIconOpen(id)
    useWidgetRestStore.getState().collapseWidget()

    // One undo puts the widget back to the full card it was before it was
    // iconified. Opening it used to be an edit of its own sitting in between.
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[id]!.iconified).toBeFalsy()
  })

  it('leaves a peeked icon’s clustermates exactly where they stand', () => {
    // Making space for a card that is only being glanced at is a real board
    // change: undoable, persisted, and on a shared canvas it would shove
    // everyone else's view of the group about as well.
    const [icon, mate] = gluedIconPair()
    const before = useWidgetStore.getState().widgets[mate]!

    peekIconOpen(icon)

    expect(useWidgetStore.getState().widgets[mate]!.position).toEqual(before.position)
    expect(useWidgetStore.getState().widgets[mate]!.size).toEqual(before.size)
  })

  it('leaves a card opened from rest to the resting system on collapse', () => {
    const id = useWidgetStore.getState().createWidget('Notes', { x: 400, y: 400 }, 'notes')
    const before = useWidgetStore.getState().widgets[id]!
    useWidgetRestStore.getState().expandWidget(
      id,
      expansionOffsetFor(restingTileSize(before), before.size),
      { kind: 'rest' },
    )

    useWidgetRestStore.getState().collapseWidget()

    // Nothing durable moved: the stored record is untouched, and the widget
    // simply rests again at its own anchor.
    const closed = useWidgetStore.getState().widgets[id]!
    expect(closed.iconified).not.toBe(true)
    expect(closed.position).toEqual(before.position)
    expect(closed.size).toEqual(before.size)
  })

})
