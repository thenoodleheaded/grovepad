import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// A marquee must box what the user can see. A resting card is drawn as a small
// icon tile, while its stored `size` keeps the full-card dimensions it will
// wear once it has content — so hit-testing the stored box selected cards from
// a patch of canvas that looks completely empty.
//
// Driven through the real attachCanvasGestures against a stand-in element, the
// same way pinchZoomAnchor.test.ts does: the gesture engine only needs a rect,
// listener registration and pointer capture, so no DOM environment is needed.
// ---------------------------------------------------------------------------

class StandInElement {}

function stubDetachedNode() {
  const node: Record<string, unknown> = {
    style: {},
    className: '',
    textContent: '',
    setAttribute: () => {},
    appendChild: () => {},
    remove: () => {},
  }
  return node
}

function stubCanvasElement() {
  const handlers = new Map<string, ((event: unknown) => void)[]>()
  const el = Object.assign(new StandInElement(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, [...(handlers.get(type) ?? []), handler])
    },
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => false,
    dispatchEvent: () => true,
    contains: () => true,
    closest: () => null,
    matches: () => false,
    appendChild: () => {},
    removeChild: () => {},
    style: {},
    classList: { add: () => {}, remove: () => {} },
  })
  const fire = (type: string, event: Record<string, unknown>) => {
    for (const handler of handlers.get(type) ?? []) {
      handler({ preventDefault: () => {}, stopPropagation: () => {}, target: el, button: 0, ...event })
    }
  }
  return { el, fire }
}

let detach: (() => void) | null = null

beforeEach(() => {
  vi.stubGlobal('Element', StandInElement)
  vi.stubGlobal('document', { createElement: () => stubDetachedNode() })
  vi.stubGlobal('window', {
    setTimeout: (handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms) as unknown as number,
    clearTimeout: (id: number) => { globalThis.clearTimeout(id as never) },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

afterEach(() => {
  detach?.()
  detach = null
  vi.unstubAllGlobals()
})

/** Force a widget straight to an exact position/size, bypassing snapping. */
async function place(id: string, x: number, y: number, width: number, height: number) {
  const { useWidgetStore } = await import('../../store/useWidgetStore')
  useWidgetStore.setState((state) => {
    const widget = state.widgets[id]
    if (!widget) return state
    return {
      widgets: { ...state.widgets, [id]: { ...widget, position: { x, y }, size: { width, height } } },
    }
  })
}

/**
 * Shift-drag a marquee between two WORLD points and report what it selected.
 * The camera is parked so world and client coordinates differ by a constant,
 * which keeps the boxed rect exactly where the caller asked for it.
 */
async function marqueeOver(from: { x: number; y: number }, to: { x: number; y: number }, origin: number) {
  const { cameraEngine } = await import('./cameraEngine')
  const { attachCanvasGestures } = await import('./gestureEngine')
  const { useWidgetStore } = await import('../../store/useWidgetStore')
  const { el, fire } = stubCanvasElement()

  cameraEngine.setView({ x: -origin, y: -origin }, 1)
  useWidgetStore.getState().clearSelection()
  detach = attachCanvasGestures(el as unknown as HTMLElement)

  const point = (type: string, world: { x: number; y: number }) =>
    fire(type, {
      pointerType: 'mouse',
      pointerId: 7,
      shiftKey: true,
      clientX: world.x - origin,
      clientY: world.y - origin,
      timeStamp: 0,
    })

  point('pointerdown', from)
  point('pointermove', to)
  point('pointerup', to)

  return [...useWidgetStore.getState().selectedIds]
}

describe('marquee selection measures the drawn footprint', () => {
  it('ignores a resting card whose icon tile the box never touched', async () => {
    const { useWidgetStore } = await import('../../store/useWidgetStore')
    const { restingFootprintWidget } = await import('../../utils/widgetRest')
    // Far from the seed board so nothing else can land inside the box.
    const OX = 500_000
    const id = useWidgetStore.getState().createWidget('Resting', { x: OX, y: OX }, 'text')
    await place(id, OX, OX, 400, 280)

    // The premise: this card is drawn much smaller than its stored box.
    const drawn = restingFootprintWidget(useWidgetStore.getState().widgets[id]!)
    expect(drawn.size.width).toBeLessThan(400)
    expect(drawn.size.height).toBeLessThan(280)

    // A box wholly inside the stored 400x280 rect but clear of the drawn tile.
    const selected = await marqueeOver(
      { x: OX + 320, y: OX + 200 },
      { x: OX + 390, y: OX + 270 },
      OX,
    )
    expect(selected).not.toContain(id)

    useWidgetStore.getState().deleteWidgets([id])
  })

  it('still boxes the card when the marquee crosses the tile it draws', async () => {
    // The control: without it, selecting nothing at all would pass above.
    const { useWidgetStore } = await import('../../store/useWidgetStore')
    const OX = 600_000
    const id = useWidgetStore.getState().createWidget('Resting', { x: OX, y: OX }, 'text')
    await place(id, OX, OX, 400, 280)

    const selected = await marqueeOver(
      { x: OX - 20, y: OX - 20 },
      { x: OX + 40, y: OX + 40 },
      OX,
    )
    expect(selected).toContain(id)

    useWidgetStore.getState().deleteWidgets([id])
  })
})
