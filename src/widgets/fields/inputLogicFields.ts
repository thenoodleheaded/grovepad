import type { ModuleType,
  BranchGateData,
  DatePickerData,
  FormulaData,
  NumberInputData,
  StatusData,
  TextInputData,
  ToggleData,
} from '../../types/spatial'
import type { FieldDescriptor } from '../contracts/fields'
import { num, text, bool, formulaValue, daysUntil } from './valueHelpers'

/** Input and logic widget fields (text_input … date_picker). Extracted verbatim from fields.ts; field order IS port-slot order — never reorder within an entry. */
export const INPUT_LOGIC_FIELDS = {
  text_input: [
    {
      key: 'value',
      label: 'Text value',
      valueType: 'text',
      get: (d) => (d as TextInputData).value,
      set: (d, v) => ({ ...(d as TextInputData), value: text(v) }),
    },
    {
      key: 'has_value',
      label: 'Has value',
      valueType: 'boolean',
      get: (d) => (d as TextInputData).value.trim().length > 0,
    },
  ],
  number_input: [
    {
      key: 'value',
      label: 'Number value',
      valueType: 'number',
      get: (d) => (d as NumberInputData).value,
      set: (d, v) => {
        const nd = d as NumberInputData
        const min = Math.min(nd.min, nd.max)
        const max = Math.max(nd.min, nd.max)
        return { ...nd, value: Math.min(max, Math.max(min, num(v))) }
      },
    },
  ],
  toggle: [
    {
      key: 'value',
      label: 'On / off',
      valueType: 'boolean',
      get: (d) => (d as ToggleData).value,
      set: (d, v) => ({ ...(d as ToggleData), value: bool(v) }),
    },
  ],
  branch_gate: [
    {
      key: 'value',
      label: 'True branch',
      valueType: 'boolean',
      get: (d) => (d as BranchGateData).value,
      set: (d, v) => ({ ...(d as BranchGateData), value: bool(v) }),
    },
    {
      key: 'inverse',
      label: 'False branch',
      valueType: 'boolean',
      get: (d) => !(d as BranchGateData).value,
    },
  ],
  formula: [
    {
      key: 'a',
      label: 'Input A',
      valueType: 'number',
      get: (d) => (d as FormulaData).a,
      set: (d, v) => ({ ...(d as FormulaData), a: num(v) }),
    },
    {
      key: 'b',
      label: 'Input B',
      valueType: 'number',
      get: (d) => (d as FormulaData).b,
      set: (d, v) => ({ ...(d as FormulaData), b: num(v) }),
    },
    {
      key: 'result',
      label: 'Result',
      valueType: 'number',
      get: (d) => formulaValue(d as FormulaData),
    },
  ],
  status: [
    {
      key: 'status',
      label: 'Status',
      valueType: 'text',
      get: (d) => (d as StatusData).value,
      set: (d, v) => {
        const value = text(v)
        const legal = ['not_started', 'in_progress', 'blocked', 'done'] as const
        return legal.includes(value as (typeof legal)[number])
          ? { ...(d as StatusData), value: value as StatusData['value'] }
          : d
      },
    },
    {
      key: 'progress',
      label: 'Progress %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const value = (d as StatusData).value
        return value === 'done' ? 100 : value === 'in_progress' || value === 'blocked' ? 50 : 0
      },
    },
    {
      key: 'complete',
      label: 'Complete',
      valueType: 'boolean',
      get: (d) => (d as StatusData).value === 'done',
    },
  ],
  date_picker: [
    {
      key: 'date',
      label: 'Date',
      valueType: 'text',
      unit: 'date_iso',
      get: (d) => (d as DatePickerData).date,
      set: (d, v) => ({ ...(d as DatePickerData), date: text(v) }),
    },
    {
      key: 'days_until',
      label: 'Days until',
      valueType: 'number',
      unit: 'count',
      get: (d) => daysUntil((d as DatePickerData).date),
      timeSensitive: true,
    },
    {
      key: 'is_due',
      label: 'Is due',
      valueType: 'boolean',
      get: (d) => Boolean((d as DatePickerData).date) && daysUntil((d as DatePickerData).date) <= 0,
      timeSensitive: true,
    },
  ],
} satisfies Partial<Record<ModuleType, FieldDescriptor[]>>
