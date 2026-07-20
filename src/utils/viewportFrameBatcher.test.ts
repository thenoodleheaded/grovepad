import { describe, expect, it } from 'vitest'
import { createViewportFrameBatcher, type ViewportFrameView } from './viewportFrameBatcher'

function makeBatcher(initial: ViewportFrameView) {
  let view = { pan: { ...initial.pan }, zoom: initial.zoom }
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1
  let commits = 0
  const batcher = createViewportFrameBatcher({
    getView: () => view,
    commitView: (pan, zoom) => {
      commits += 1
      view = { pan: { ...pan }, zoom }
    },
    requestFrame: (callback) => {
      const id = nextFrameId++
      callbacks.set(id, callback)
      return id
    },
    cancelFrame: (id) => callbacks.delete(id),
  })
  return {
    batcher,
    get view() { return view },
    get commits() { return commits },
    runFrame() {
      const queued = [...callbacks.values()]
      callbacks.clear()
      queued.forEach((callback) => callback(0))
    },
    get queuedFrames() { return callbacks.size },
  }
}

describe('viewport frame batcher', () => {
  it('commits thousands of wheel inputs once per animation frame', () => {
    const harness = makeBatcher({ pan: { x: 10, y: -20 }, zoom: 1 })

    for (let index = 0; index < 1_000; index += 1) {
      harness.batcher.zoomBy(Math.exp(-0.0022), { x: 480, y: 270 })
    }

    expect(harness.queuedFrames).toBe(1)
    expect(harness.commits).toBe(0)
    harness.runFrame()
    expect(harness.commits).toBe(1)
  })

  it('keeps the focal world point stationary across a staged zoom', () => {
    const harness = makeBatcher({ pan: { x: 100, y: 80 }, zoom: 0.5 })
    const focal = { x: 420, y: 280 }
    const worldBefore = {
      x: (focal.x - harness.view.pan.x) / harness.view.zoom,
      y: (focal.y - harness.view.pan.y) / harness.view.zoom,
    }

    harness.batcher.zoomBy(1.6, focal)
    harness.runFrame()

    expect((focal.x - harness.view.pan.x) / harness.view.zoom).toBeCloseTo(worldBefore.x)
    expect((focal.y - harness.view.pan.y) / harness.view.zoom).toBeCloseTo(worldBefore.y)
  })

  it('preserves input order when pan and zoom land in the same frame', () => {
    const harness = makeBatcher({ pan: { x: 0, y: 0 }, zoom: 1 })
    harness.batcher.panBy({ x: 20, y: -10 })
    harness.batcher.zoomBy(2, { x: 100, y: 50 })
    harness.runFrame()

    expect(harness.view).toEqual({ pan: { x: -60, y: -70 }, zoom: 2 })
  })

  it('can atomically replace a pending view for pinch updates', () => {
    const harness = makeBatcher({ pan: { x: 0, y: 0 }, zoom: 1 })
    harness.batcher.panBy({ x: 12, y: 8 })
    harness.batcher.setView({ x: -30, y: 40 }, 0.4)
    harness.runFrame()

    expect(harness.commits).toBe(1)
    expect(harness.view).toEqual({ pan: { x: -30, y: 40 }, zoom: 0.4 })
  })
})
