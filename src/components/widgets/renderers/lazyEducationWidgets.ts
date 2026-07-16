import { lazy } from 'react'

export const AssignmentWidget = lazy(async () => ({ default: (await import('../modules/AssignmentWidget')).AssignmentWidget }))
export const CitationWidget = lazy(async () => ({ default: (await import('../modules/CitationWidget')).CitationWidget }))
export const CornellWidget = lazy(async () => ({ default: (await import('../modules/CornellWidget')).CornellWidget }))
export const FormulaSheetWidget = lazy(async () => ({ default: (await import('../modules/FormulaSheetWidget')).FormulaSheetWidget }))
export const GpaWidget = lazy(async () => ({ default: (await import('../modules/GpaWidget')).GpaWidget }))
export const GradeCalcWidget = lazy(async () => ({ default: (await import('../modules/GradeCalcWidget')).GradeCalcWidget }))
export const PomodoroWidget = lazy(async () => ({ default: (await import('../modules/PomodoroWidget')).PomodoroWidget }))
export const QuizWidget = lazy(async () => ({ default: (await import('../modules/QuizWidget')).QuizWidget }))
export const StudyGoalWidget = lazy(async () => ({ default: (await import('../modules/StudyGoalWidget')).StudyGoalWidget }))
export const VocabWidget = lazy(async () => ({ default: (await import('../modules/VocabWidget')).VocabWidget }))
