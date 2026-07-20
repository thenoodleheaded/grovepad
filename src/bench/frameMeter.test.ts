import { describe, expect, it } from 'vitest'
import { evaluateFrameGates, summarizeFrames } from './frameMeter'

describe('frame meter summary and gates', () => {
  it('summarizes clean 60Hz frames as zero-drop and passes the gate', () => {
    const deltas = Array.from({ length: 1200 }, () => 16.7)
    const report = summarizeFrames(deltas, [])
    expect(report.droppedAt60).toBe(0)
    expect(report.longestMs).toBeCloseTo(16.7)
    const gates = evaluateFrameGates(report)
    expect(gates.find((g) => g.gate.includes('60Hz'))?.pass).toBe(true)
    // 16.7ms frames are a 60Hz display — the 120Hz gate must fail honestly.
    expect(gates.find((g) => g.gate.includes('120Hz'))?.pass).toBe(false)
  })

  it('counts every frame beyond 25ms as dropped and fails the gate', () => {
    const deltas = [...Array.from({ length: 100 }, () => 16.7), 26, 48, 120]
    const report = summarizeFrames(deltas, [80])
    expect(report.droppedAt60).toBe(3)
    expect(report.longestMs).toBe(120)
    expect(report.longTasks).toBe(1)
    expect(report.longTaskTotalMs).toBe(80)
    expect(evaluateFrameGates(report).find((g) => g.gate.includes('60Hz'))?.pass).toBe(false)
  })

  it('passes the 120Hz budget on true 120Hz frames', () => {
    const deltas = Array.from({ length: 2400 }, () => 8.3)
    const gates = evaluateFrameGates(summarizeFrames(deltas, []))
    expect(gates.find((g) => g.gate.includes('120Hz'))?.pass).toBe(true)
  })

  it('handles empty input without dividing by zero', () => {
    const report = summarizeFrames([], [])
    expect(report.frames).toBe(0)
    expect(report.meanMs).toBe(0)
    expect(report.within120Share).toBe(1)
  })
})
