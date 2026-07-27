import { describe, expect, it } from 'vitest'
import type { GradeCalcData } from '../../../types/spatial'
import {
  computeWeightedGrade,
  curvedGrade,
  curveState,
  droppedComponentIds,
  droppedScoresState,
  gradeLetter,
  gradeSkinMode,
  gradeWithoutDroppedScores,
  passFailState,
  whatIfGrade,
  whatIfState,
} from './gradeSkinModel'

const components: GradeCalcData['components'] = [
  { id: 'exam', name: 'Exam', score: 80, weight: 50 },
  { id: 'essay', name: 'Essay', score: 60, weight: 30 },
  { id: 'quiz', name: 'Quiz', score: 100, weight: 20 },
]

describe('Grades skin maths', () => {
  it('keeps the established weighted-grade calculation', () => {
    expect(computeWeightedGrade(components)).toBe(78)
    expect(computeWeightedGrade([])).toBe(0)
  })

  it('previews a hypothetical score without changing the saved component', () => {
    const state = whatIfState({ componentId: 'essay', score: 90 }, components)
    expect(whatIfGrade(components, state)).toBe(87)
    expect(components[1]!.score).toBe(60)
  })

  it('drops the lowest scores deterministically and keeps at least one', () => {
    expect([...droppedComponentIds(components, 1)]).toEqual(['essay'])
    expect(gradeWithoutDroppedScores(components, 1)).toBeCloseTo(85.714, 3)
    expect(droppedScoresState({ count: 99 }, components.length)).toEqual({ count: 2 })
  })

  it('bounds every persisted scenario control before it reaches the UI', () => {
    expect(passFailState({ threshold: 900 })).toEqual({ threshold: 100 })
    expect(curveState({ points: -90 })).toEqual({ points: -30 })
    expect(curvedGrade(98, 12)).toBe(100)
  })

  it('falls back safely for stale skins and gives edge grades readable letters', () => {
    expect(gradeSkinMode('unknown')).toBe('weighted')
    expect(gradeLetter(97)).toBe('A+')
    expect(gradeLetter(59.9)).toBe('F')
  })
})
