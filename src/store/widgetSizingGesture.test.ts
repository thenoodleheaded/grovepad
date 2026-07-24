import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginWidgetSizingGesture,
  endWidgetSizingGesture,
  isWidgetSizingGestureActive,
  resetWidgetSizingGestures,
  subscribeWidgetSizingGestureEnd,
} from './widgetSizingGesture'

afterEach(() => resetWidgetSizingGestures())

describe('size authority during a pointer gesture', () => {
  it('claims and releases one widget at a time', () => {
    beginWidgetSizingGesture('a')
    expect(isWidgetSizingGestureActive('a')).toBe(true)
    // A gesture on one card must not silence the content floor on every other.
    expect(isWidgetSizingGestureActive('b')).toBe(false)

    endWidgetSizingGesture('a')
    expect(isWidgetSizingGestureActive('a')).toBe(false)
  })

  it('wakes the suspended measurement pass when the gesture ends', () => {
    // The committed box often equals the last dragged one, so no ResizeObserver
    // fires — the end of the gesture has to be its own trigger.
    const seen: string[] = []
    subscribeWidgetSizingGestureEnd((id) => seen.push(id))

    beginWidgetSizingGesture('a')
    expect(seen).toEqual([])
    endWidgetSizingGesture('a')
    expect(seen).toEqual(['a'])
  })

  it('stays silent for a widget that never claimed authority', () => {
    const listener = vi.fn()
    subscribeWidgetSizingGestureEnd(listener)
    endWidgetSizingGesture('never-started')
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not notify twice for one gesture', () => {
    const listener = vi.fn()
    subscribeWidgetSizingGestureEnd(listener)
    beginWidgetSizingGesture('a')
    endWidgetSizingGesture('a')
    endWidgetSizingGesture('a')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying a disposed subscriber', () => {
    const listener = vi.fn()
    const dispose = subscribeWidgetSizingGestureEnd(listener)
    dispose()
    beginWidgetSizingGesture('a')
    endWidgetSizingGesture('a')
    expect(listener).not.toHaveBeenCalled()
  })
})
