import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clampZoom } from '../../types/spatial'

// The limits themselves are private to types/canvas; ask clampZoom for them so
// this test cannot drift out of step with the engine it is checking.
const ZOOM_CEILING = clampZoom(Number.POSITIVE_INFINITY)
const ZOOM_FLOOR = clampZoom(0)

// ---------------------------------------------------------------------------
// A pinch has one job beyond changing scale: the world point under the fingers
// stays under the fingers. cameraEngine.commit() clamps the zoom it is given
// but keeps the pan verbatim, so the pan has to be derived from the CLAMPED
// zoom — otherwise, the moment a pinch crosses a zoom limit, the board slides
// away by world * (raw - clamped) and stays there on release.
//
// Driven through the real attachCanvasGestures against a stand-in element:
// the gesture engine only needs a rect, listener registration and pointer
// capture from it, so no DOM environment is required.
// ---------------------------------------------------------------------------

class StandInElement {}

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

/**
 * Pinch from `startGap` to `endGap` about a fixed midpoint, and report where
 * the world point that began under that midpoint ends up on screen.
 */
async function pinchAbout(
  startZoom: number,
  startGap: number,
  endGap: number,
  midpoint = { x: 500, y: 400 },
) {
  const { cameraEngine } = await import('./cameraEngine')
  const { attachCanvasGestures } = await import('./gestureEngine')
  const { el, fire } = stubCanvasElement()

  cameraEngine.setView({ x: 0, y: 0 }, startZoom)
  const start = cameraEngine.getFrame()
  const anchorWorld = {
    x: (midpoint.x - start.pan.x) / start.zoom,
    y: (midpoint.y - start.pan.y) / start.zoom,
  }

  detach = attachCanvasGestures(el as unknown as HTMLElement)
  const touch = (type: string, pointerId: number, clientX: number) =>
    fire(type, { pointerType: 'touch', pointerId, clientX, clientY: midpoint.y, timeStamp: 0 })

  touch('pointerdown', 1, midpoint.x - startGap / 2)
  touch('pointerdown', 2, midpoint.x + startGap / 2)
  touch('pointermove', 1, midpoint.x - endGap / 2)
  touch('pointermove', 2, midpoint.x + endGap / 2)

  const frame = cameraEngine.getFrame()
  return {
    frame,
    anchorOnScreen: {
      x: frame.pan.x + anchorWorld.x * frame.zoom,
      y: frame.pan.y + anchorWorld.y * frame.zoom,
    },
    midpoint,
  }
}

describe('a pinch keeps the world point under the fingers', () => {
  it('holds the anchor for an ordinary pinch inside the zoom range', async () => {
    // The control. Without it, refusing to move at all would pass every case.
    const { frame, anchorOnScreen, midpoint } = await pinchAbout(1, 100, 150)
    expect(frame.zoom).toBeCloseTo(1.5, 5)
    expect(anchorOnScreen.x).toBeCloseTo(midpoint.x, 5)
    expect(anchorOnScreen.y).toBeCloseTo(midpoint.y, 5)
  })

  it('holds it when the pinch is pushed past the maximum zoom', async () => {
    // Spreading to 3x from zoom 2 asks for 6, which the engine caps at 3.
    // Deriving the pan from the uncapped 6 moved the anchor to (-250, -200):
    // every card off-screen, and it stayed there once the fingers lifted.
    const { frame, anchorOnScreen, midpoint } = await pinchAbout(2, 100, 300)
    expect(frame.zoom).toBe(ZOOM_CEILING)
    expect(anchorOnScreen.x).toBeCloseTo(midpoint.x, 5)
    expect(anchorOnScreen.y).toBeCloseTo(midpoint.y, 5)
  })

  it('holds it when the pinch is pushed below the minimum zoom', async () => {
    const { frame, anchorOnScreen, midpoint } = await pinchAbout(0.2, 400, 40)
    expect(frame.zoom).toBe(ZOOM_FLOOR)
    expect(anchorOnScreen.x).toBeCloseTo(midpoint.x, 5)
    expect(anchorOnScreen.y).toBeCloseTo(midpoint.y, 5)
  })
})
