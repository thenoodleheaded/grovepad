import { describe, expect, it } from 'vitest'
import type { GradeCalcData } from '../types/spatial'
import { dataWearingSkin, dataWithSkinState, skinsFor } from '../utils/widgetSkins'
import { STUDY_WIDGET_DEFINITIONS } from './registry/studyWidgets'

const expected = [
  'weighted',
  'gpa',
  'pass_fail',
  'what_if',
  'rubric',
  'dropped_scores',
  'curve_simulator',
]

const card: GradeCalcData = {
  mode: 'weighted',
  components: [{ id: 'exam', name: 'Exam', score: 88, weight: 100 }],
  gpa: { courses: [{ id: 'math', name: 'Math', credits: 3, points: 4 }] },
}

describe('Grades skin registry contract', () => {
  it('offers every designed skin in the reviewed order', () => {
    expect(
      skinsFor({ type: 'grade_calc' }, STUDY_WIDGET_DEFINITIONS.grade_calc).map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with a distinct icon and accessible description', () => {
    const declared = STUDY_WIDGET_DEFINITIONS.grade_calc.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
    expect(declared.every((skin) => Boolean(skin.description))).toBe(true)
  })

  it('changes only appearance and preserves both grade data sets', () => {
    const next = dataWearingSkin(
      { type: 'grade_calc', data: card },
      'what_if',
      STUDY_WIDGET_DEFINITIONS.grade_calc,
    ) as GradeCalcData

    expect(next.mode).toBe('what_if')
    expect(next.components).toEqual(card.components)
    expect(next.gpa).toEqual(card.gpa)
  })

  it('isolates specialist settings and lets the renderer own their controls', () => {
    const next = dataWithSkinState(card as never, 'curve_simulator', { points: 7 }) as GradeCalcData
    expect(next.skinStates?.curve_simulator).toEqual({ points: 7 })
    expect(STUDY_WIDGET_DEFINITIONS.grade_calc.rendererOwnedSkinDetails).toEqual([
      'rubric',
      'dropped_scores',
      'curve_simulator',
    ])
  })
})
