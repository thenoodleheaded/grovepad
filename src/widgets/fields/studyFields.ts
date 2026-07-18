import type { ModuleType,
  AssignmentData,
  CitationData,
  CornellData,
  FormulaSheetData,
  GpaData,
  GradeCalcData,
  PomodoroData,
  QuizData,
  StudyGoalData,
  VocabData,
} from '../../types/spatial'
import type { FieldDescriptor } from '../contracts/fields'
import { text } from './valueHelpers'

/** Study widget fields (pomodoro … quiz). Extracted verbatim from fields.ts; field order IS port-slot order — never reorder within an entry. */
export const STUDY_FIELDS = {
  pomodoro: [
    {
      key: 'completed',
      label: 'Sessions done',
      valueType: 'number',
      get: (d) => (d as PomodoroData).completed,
    },
    {
      key: 'running',
      label: 'Running',
      valueType: 'boolean',
      get: (d) => (d as PomodoroData).endAt !== null,
    },
  ],
  vocab: [
    {
      key: 'known_count',
      label: 'Known',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as VocabData).terms.filter((t) => t.known).length,
    },
    {
      key: 'mastered',
      label: 'All known',
      valueType: 'boolean',
      get: (d) => {
        const terms = (d as VocabData).terms
        return terms.length > 0 && terms.every((t) => t.known)
      },
    },
  ],
  grade_calc: [
    {
      key: 'grade',
      label: 'Grade %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const cs = (d as GradeCalcData).components
        const w = cs.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0)
        if (w <= 0) return 0
        const sum = cs.reduce(
          (s, c) => s + (Number.isFinite(c.score) ? c.score : 0) * (Number.isFinite(c.weight) ? c.weight : 0),
          0,
        )
        return Math.round((sum / w) * 10) / 10
      },
    },
    {
      key: 'passing',
      label: 'Passing',
      valueType: 'boolean',
      get: (d) => {
        const cs = (d as GradeCalcData).components
        const w = cs.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0)
        if (w <= 0) return false
        const sum = cs.reduce(
          (s, c) => s + (Number.isFinite(c.score) ? c.score : 0) * (Number.isFinite(c.weight) ? c.weight : 0),
          0,
        )
        return sum / w >= 60
      },
    },
  ],
  gpa: [
    {
      key: 'gpa',
      label: 'GPA',
      valueType: 'number',
      get: (d) => {
        const cs = (d as GpaData).courses
        const cr = cs.reduce((s, c) => s + (Number.isFinite(c.credits) ? c.credits : 0), 0)
        if (cr <= 0) return 0
        const sum = cs.reduce(
          (s, c) => s + (Number.isFinite(c.credits) ? c.credits : 0) * (Number.isFinite(c.points) ? c.points : 0),
          0,
        )
        return Math.round((sum / cr) * 100) / 100
      },
    },
  ],
  assignment: [
    {
      key: 'done_count',
      label: 'Done',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as AssignmentData).items.filter((i) => i.status === 'done').length,
    },
    {
      key: 'all_done',
      label: 'All done',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as AssignmentData).items
        return items.length > 0 && items.every((i) => i.status === 'done')
      },
    },
  ],
  cornell: [
    {
      key: 'notes',
      label: 'Notes',
      valueType: 'text',
      get: (d) => (d as CornellData).notes,
      set: (d, v) => ({ ...(d as CornellData), notes: text(v) }),
    },
    {
      key: 'summary',
      label: 'Summary',
      valueType: 'text',
      get: (d) => (d as CornellData).summary,
      set: (d, v) => ({ ...(d as CornellData), summary: text(v) }),
    },
  ],
  formula_sheet: [
    {
      key: 'count',
      label: 'Formulas',
      valueType: 'number',
      get: (d) => (d as FormulaSheetData).formulas.filter((f) => f.name.trim() || f.expression.trim()).length,
    },
  ],
  citation: [
    {
      key: 'count',
      label: 'Sources',
      valueType: 'number',
      get: (d) => (d as CitationData).sources.filter((s) => s.title.trim()).length,
    },
  ],
  study_goal: [
    {
      key: 'percent',
      label: 'Progress %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const sd = d as StudyGoalData
        return sd.targetHours > 0
          ? Math.min(100, Math.round((sd.loggedHours / sd.targetHours) * 100))
          : 0
      },
    },
    {
      key: 'complete',
      label: 'Goal met',
      valueType: 'boolean',
      get: (d) => {
        const sd = d as StudyGoalData
        return sd.targetHours > 0 && sd.loggedHours >= sd.targetHours
      },
    },
  ],
  quiz: [
    {
      key: 'correct',
      label: 'Answered right',
      valueType: 'boolean',
      get: (d) => {
        const q = d as QuizData
        return q.picked !== null && (q.options.find((o) => o.id === q.picked)?.correct ?? false)
      },
    },
  ],
} satisfies Partial<Record<ModuleType, FieldDescriptor[]>>
