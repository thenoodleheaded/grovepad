import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import {
  MOTION_SNAPSHOT_MAX_PIXELS,
  MOTION_SNAPSHOT_MAX_SCALE,
  MOTION_SNAPSHOT_MIN_SCALE,
  motionLocalDetailAlpha,
  motionSnapshotScale,
  motionWidgetIsVisible,
  prioritizeMotionWidgets,
} from './cameraMotionDetail'

function widget(id: string, x: number, y: number, width = 400, height = 240): Widget {
  return {
    id,
    canvasId: 'canvas-a',
    type: 'notes',
    title: id,
    position: { x, y },
    size: { width, height },
    data: { text: '' },
    metadata: { badges: [] },
  }
}

describe('camera motion detail cache', () => {
  it('keeps ordinary cards close to the 80%-zoom screen resolution', () => {
    expect(motionSnapshotScale(400, 240)).toBe(MOTION_SNAPSHOT_MAX_SCALE)
  })

  it('bounds unusually large captures without dropping below the readable floor', () => {
    const scale = motionSnapshotScale(1_600, 1_200)
    expect(scale).toBe(MOTION_SNAPSHOT_MIN_SCALE)
    expect(800 * 600 * motionSnapshotScale(800, 600) ** 2).toBeCloseTo(
      MOTION_SNAPSHOT_MAX_PIXELS,
    )
  })

  it('uses exact camera projection for viewport intersection', () => {
    const viewport = { pan: { x: -100, y: -40 }, zoom: 0.5, width: 500, height: 300 }
    expect(motionWidgetIsVisible(widget('visible', 200, 80), viewport)).toBe(true)
    expect(motionWidgetIsVisible(widget('right', 1_300, 80), viewport)).toBe(false)
    expect(motionWidgetIsVisible(widget('left', -900, 80), viewport)).toBe(false)
  })

  it('prepares visible widgets before nearer off-screen widgets', () => {
    const widgets = {
      nearOffscreen: widget('near-offscreen', -430, 0),
      visibleFar: widget('visible-far', 500, 0),
      visibleCenter: widget('visible-center', 100, 50),
    }
    const ordered = prioritizeMotionWidgets(widgets, 'canvas-a', {
      pan: { x: 0, y: 0 },
      zoom: 0.5,
      width: 500,
      height: 300,
    })
    expect(ordered.map((item) => item.id)).toEqual([
      'visible-center',
      'visible-far',
      'near-offscreen',
    ])
  })

  it('blends extra resolution continuously without a detail-state boundary', () => {
    expect(motionLocalDetailAlpha(0.1)).toBe(0)
    expect(motionLocalDetailAlpha(0.34)).toBe(0)
    expect(motionLocalDetailAlpha(0.46)).toBeCloseTo(0.5)
    expect(motionLocalDetailAlpha(0.58)).toBe(1)
    expect(motionLocalDetailAlpha(0.8)).toBe(1)

    const samples = Array.from({ length: 81 }, (_, index) =>
      motionLocalDetailAlpha(index / 100),
    )
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1]!)).toBe(true)
  })
})
