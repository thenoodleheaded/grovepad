import type { GpaData, GradeCalcData } from '../../../types/spatial'
import type { WidgetSkinState } from '../../../utils/widgetSkins'

export type GradeSkinMode =
  | 'weighted'
  | 'gpa'
  | 'pass_fail'
  | 'what_if'
  | 'rubric'
  | 'dropped_scores'
  | 'curve_simulator'

const GRADE_SKINS = new Set<GradeSkinMode>([
  'weighted',
  'gpa',
  'pass_fail',
  'what_if',
  'rubric',
  'dropped_scores',
  'curve_simulator',
])

export function gradeSkinMode(raw: unknown): GradeSkinMode {
  return typeof raw === 'string' && GRADE_SKINS.has(raw as GradeSkinMode)
    ? raw as GradeSkinMode
    : 'weighted'
}

export function clampGradeNumber(raw: unknown, min: number, max: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Weighted grade: Σ(score × weight) / Σ(weight). */
export function computeWeightedGrade(components: GradeCalcData['components']): number {
  const totalWeight = components.reduce(
    (sum, component) => sum + clampGradeNumber(component.weight, 0, 100),
    0,
  )
  if (totalWeight <= 0) return 0
  return components.reduce(
    (sum, component) => (
      sum
      + clampGradeNumber(component.score, 0, 100)
      * clampGradeNumber(component.weight, 0, 100)
    ),
    0,
  ) / totalWeight
}

/** GPA: Σ(credits × points) / Σ(credits). */
export function computeGpa(courses: GpaData['courses']): number {
  const totalCredits = courses.reduce(
    (sum, course) => sum + clampGradeNumber(course.credits, 0, 99),
    0,
  )
  if (totalCredits <= 0) return 0
  return courses.reduce(
    (sum, course) => (
      sum
      + clampGradeNumber(course.credits, 0, 99)
      * clampGradeNumber(course.points, 0, 4.3)
    ),
    0,
  ) / totalCredits
}

export function totalGradeWeight(components: GradeCalcData['components']): number {
  return components.reduce(
    (sum, component) => sum + clampGradeNumber(component.weight, 0, 100),
    0,
  )
}

export function gradeLetter(grade: number): string {
  if (grade >= 97) return 'A+'
  if (grade >= 93) return 'A'
  if (grade >= 90) return 'A−'
  if (grade >= 87) return 'B+'
  if (grade >= 83) return 'B'
  if (grade >= 80) return 'B−'
  if (grade >= 77) return 'C+'
  if (grade >= 73) return 'C'
  if (grade >= 70) return 'C−'
  if (grade >= 67) return 'D+'
  if (grade >= 63) return 'D'
  if (grade >= 60) return 'D−'
  return 'F'
}

export type GradeTone = 'strong' | 'steady' | 'risk'

export function gradeTone(grade: number, threshold = 60): GradeTone {
  if (grade < threshold) return 'risk'
  return grade >= Math.max(85, threshold + 15) ? 'strong' : 'steady'
}

export interface PassFailState {
  threshold: number
}

export function passFailState(raw: WidgetSkinState): PassFailState {
  return { threshold: clampGradeNumber(raw.threshold ?? 60, 0, 100) }
}

export interface WhatIfState {
  componentId: string
  score: number
}

export function whatIfState(
  raw: WidgetSkinState,
  components: GradeCalcData['components'],
): WhatIfState {
  const requestedId = typeof raw.componentId === 'string' ? raw.componentId : ''
  const component = components.find((item) => item.id === requestedId) ?? components[0]
  return {
    componentId: component?.id ?? '',
    score: clampGradeNumber(raw.score ?? component?.score ?? 0, 0, 100),
  }
}

export function whatIfGrade(
  components: GradeCalcData['components'],
  state: WhatIfState,
): number {
  return computeWeightedGrade(components.map((component) => (
    component.id === state.componentId ? { ...component, score: state.score } : component
  )))
}

export interface DroppedScoresState {
  count: number
}

export function droppedScoresState(
  raw: WidgetSkinState,
  componentCount: number,
): DroppedScoresState {
  return {
    count: Math.round(clampGradeNumber(raw.count ?? 1, 0, Math.max(0, componentCount - 1))),
  }
}

export function droppedComponentIds(
  components: GradeCalcData['components'],
  count: number,
): ReadonlySet<string> {
  return new Set(
    [...components]
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, Math.min(count, components.length - 1)))
      .map((component) => component.id),
  )
}

export function gradeWithoutDroppedScores(
  components: GradeCalcData['components'],
  count: number,
): number {
  const dropped = droppedComponentIds(components, count)
  return computeWeightedGrade(components.filter((component) => !dropped.has(component.id)))
}

export interface CurveState {
  points: number
}

export function curveState(raw: WidgetSkinState): CurveState {
  return { points: clampGradeNumber(raw.points ?? 5, -30, 30) }
}

export function curvedGrade(grade: number, points: number): number {
  return clampGradeNumber(grade + points, 0, 100)
}
