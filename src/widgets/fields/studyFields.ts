import type { ModuleType,
  CitationData,
  FormulaSheetData,
  GradeCalcData,
} from '../../types/spatial'
import type { FieldDescriptor } from '../contracts/fields'

/** Study widget fields (pomodoro … quiz). Extracted verbatim from fields.ts; field order IS port-slot order — never reorder within an entry. */
export const STUDY_FIELDS = {
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
    {
      key: 'gpa',
      label: 'GPA',
      valueType: 'number',
      get: (d) => {
        const courses = (d as GradeCalcData).gpa?.courses ?? []
        const credits = courses.reduce((sum, course) => sum + course.credits, 0)
        return credits > 0 ? courses.reduce((sum, course) => sum + course.credits * course.points, 0) / credits : 0
      },
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
} satisfies Partial<Record<ModuleType, FieldDescriptor[]>>
