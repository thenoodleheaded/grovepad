import { describe, expect, it } from 'vitest'
import { canvasPressMoved, resolveCanvasPointerIntent } from './canvasGesturePolicy'

const base = {
  button: 0,
  pointerType: 'touch',
  interactionMode: 'navigate' as const,
  isEmptyCanvas: true,
  isSpaceHeld: false,
  isZHeld: false,
  isShiftHeld: false,
}

describe('canvas pointer intent', () => {
  it('distinguishes a stationary background click from a canvas drag', () => {
    const start = { x: 100, y: 100 }
    expect(canvasPressMoved(start, { x: 103, y: 97 })).toBe(false)
    expect(canvasPressMoved(start, { x: 104, y: 100 })).toBe(true)
    expect(canvasPressMoved(start, { x: 100, y: 106 })).toBe(true)
  })

  it('uses empty-canvas touch for navigation by default', () => {
    expect(resolveCanvasPointerIntent(base)).toBe('pan')
  })

  it('uses the explicit selection tool without requiring a keyboard modifier', () => {
    expect(resolveCanvasPointerIntent({ ...base, interactionMode: 'select' })).toBe('select')
  })

  it('keeps desktop modifiers as temporary tool overrides', () => {
    expect(resolveCanvasPointerIntent({ ...base, pointerType: 'mouse', isShiftHeld: true })).toBe('select')
    expect(resolveCanvasPointerIntent({ ...base, pointerType: 'mouse', isZHeld: true })).toBe('zoom-region')
    expect(resolveCanvasPointerIntent({ ...base, pointerType: 'mouse', interactionMode: 'select', isSpaceHeld: true })).toBe('pan')
  })

  it('does not let canvas navigation steal content or unfinished tool modes', () => {
    expect(resolveCanvasPointerIntent({ ...base, isEmptyCanvas: false })).toBe('none')
    expect(resolveCanvasPointerIntent({ ...base, interactionMode: 'connect' })).toBe('none')
  })

  it('always preserves middle-button panning', () => {
    expect(resolveCanvasPointerIntent({ ...base, button: 1, isEmptyCanvas: false })).toBe('pan')
  })
})
