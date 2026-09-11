import type { ModuleType,
  DecisionMatrixData,
  FormWidgetData,
  InventoryData,
  LogbookData,
  ModuleData,
  OutlineData,
  ProcessData,
  RiskRegisterData,
  SwotData,
  TimesheetData,
  UnitConverterData,
} from '../../types/spatial'
import type { FieldDescriptor } from '../contracts/fields'
import { num, text, bool, formFieldFilled, decisionWinner, convertedUnit } from './valueHelpers'
import {
  appendLogbookEntry,
  latestLogbookEntry,
  logbookWarningCount,
} from '../../components/widgets/modules/logbookSkinModel'

/** Professional and ops widget fields (outline … world_clock). Extracted verbatim from fields.ts; field order IS port-slot order — never reorder within an entry. */
export const PROFESSIONAL_FIELDS = {
  outline: [
    {
      key: 'item_count',
      label: 'Items',
      valueType: 'number',
      get: (d) => (d as OutlineData).items.filter((item) => item.text.trim()).length,
    },
    {
      key: 'top_level_count',
      label: 'Top-level items',
      valueType: 'number',
      get: (d) => (d as OutlineData).items.filter((item) => item.depth === 0 && item.text.trim()).length,
    },
  ],
  form: [
    {
      key: 'filled_count',
      label: 'Filled fields',
      valueType: 'number',
      get: (d) => (d as FormWidgetData).fields.filter(formFieldFilled).length,
    },
    {
      key: 'complete',
      label: 'Required complete',
      valueType: 'boolean',
      get: (d) => {
        const fields = (d as FormWidgetData).fields
        return fields.length > 0 && fields.every((field) => !field.required || formFieldFilled(field))
      },
    },
    {
      key: 'first_value',
      label: 'First response',
      valueType: 'text',
      get: (d) => String((d as FormWidgetData).fields[0]?.value ?? ''),
      set: (d, v) => {
        const form = d as FormWidgetData
        const first = form.fields[0]
        if (!first) return form
        const value = first.type === 'checkbox' ? bool(v) : first.type === 'number' ? num(v) : text(v)
        return { ...form, fields: form.fields.map((field, index) => index === 0 ? { ...field, value } : field) }
      },
    },
  ],
  process: [
    {
      key: 'progress',
      label: 'Progress %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const steps = (d as ProcessData).steps
        return steps.length ? Math.round((steps.filter((step) => step.status === 'done').length / steps.length) * 100) : 0
      },
    },
    {
      key: 'complete',
      label: 'Complete',
      valueType: 'boolean',
      get: (d) => {
        const steps = (d as ProcessData).steps
        return steps.length > 0 && steps.every((step) => step.status === 'done')
      },
    },
    {
      key: 'current_step',
      label: 'Current step',
      valueType: 'text',
      get: (d) => (d as ProcessData).steps.find((step) => step.status === 'active')?.label ?? '',
    },
  ],
  risk_register: [
    {
      key: 'open_count',
      label: 'Open risks',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as RiskRegisterData).items.filter((item) => item.status === 'open').length,
    },
    {
      key: 'highest_score',
      label: 'Highest score',
      valueType: 'number',
      get: (d) =>
        (d as RiskRegisterData).items.reduce(
          (highest, item) => item.status === 'open' ? Math.max(highest, item.likelihood * item.impact) : highest,
          0,
        ),
    },
    {
      key: 'all_resolved',
      label: 'All resolved',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as RiskRegisterData).items
        return items.length > 0 && items.every((item) => item.status === 'resolved')
      },
    },
  ],
  decision_matrix: [
    {
      key: 'winner',
      label: 'Winner',
      valueType: 'text',
      get: (d) => decisionWinner(d as DecisionMatrixData).label,
    },
    {
      key: 'winner_score',
      label: 'Winner score',
      valueType: 'number',
      get: (d) => decisionWinner(d as DecisionMatrixData).score,
    },
  ],
  swot: [
    ...(
      [
        ['strength_count', 'Strengths', 'strengths'],
        ['weakness_count', 'Weaknesses', 'weaknesses'],
        ['opportunity_count', 'Opportunities', 'opportunities'],
        ['threat_count', 'Threats', 'threats'],
      ] as const
    ).map(([key, label, property]) => ({
      key,
      label,
      valueType: 'number' as const,
      unit: 'count' as const,
      get: (d: ModuleData) => (d as SwotData)[property].filter((item) => item.trim()).length,
    })),
  ],
  timesheet: [
    {
      key: 'total_hours',
      label: 'Total hours',
      valueType: 'number',
      get: (d) => (d as TimesheetData).entries.reduce((sum, entry) => sum + (Number.isFinite(entry.hours) ? Math.max(0, entry.hours) : 0), 0),
    },
    {
      key: 'billable_hours',
      label: 'Billable hours',
      valueType: 'number',
      get: (d) => (d as TimesheetData).entries.reduce((sum, entry) => sum + (entry.billable && Number.isFinite(entry.hours) ? Math.max(0, entry.hours) : 0), 0),
    },
    {
      key: 'amount',
      label: 'Billable amount',
      unit: 'currency',
      valueType: 'number',
      get: (d) => {
        const sheet = d as TimesheetData
        const hours = sheet.entries.reduce((sum, entry) => sum + (entry.billable && Number.isFinite(entry.hours) ? Math.max(0, entry.hours) : 0), 0)
        return hours * (Number.isFinite(sheet.hourlyRate) ? Math.max(0, sheet.hourlyRate) : 0)
      },
    },
  ],
  inventory: [
    {
      key: 'total_units',
      label: 'Total units',
      valueType: 'number',
      get: (d) => (d as InventoryData).items.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0), 0),
    },
    {
      key: 'low_stock_count',
      label: 'Low stock',
      valueType: 'number',
      get: (d) => (d as InventoryData).items.filter((item) => item.quantity <= item.minimum).length,
    },
    {
      key: 'all_stocked',
      label: 'All stocked',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as InventoryData).items
        return items.length > 0 && items.every((item) => item.quantity > item.minimum)
      },
    },
  ],
  logbook: [
    {
      key: 'entry_count',
      label: 'Entries',
      valueType: 'number',
      get: (d) => (d as LogbookData).entries.length,
    },
    {
      key: 'latest',
      label: 'Latest entry',
      valueType: 'text',
      get: (d) => latestLogbookEntry((d as LogbookData).entries)?.text ?? '',
    },
    {
      key: 'warning_count',
      label: 'Warnings',
      valueType: 'number',
      get: (d) => logbookWarningCount((d as LogbookData).entries),
    },
    {
      key: 'latest_level',
      label: 'Latest level',
      valueType: 'text',
      get: (d) => latestLogbookEntry((d as LogbookData).entries)?.level ?? '',
    },
    {
      key: 'append',
      label: 'Append entry',
      valueType: 'text',
      get: () => '',
      set: (d, v) => {
        const value = text(v).trim()
        return value ? appendLogbookEntry(d as LogbookData, value) : d
      },
    },
  ],
  unit_converter: [
    {
      key: 'input',
      label: 'Input',
      valueType: 'number',
      get: (d) => (d as UnitConverterData).value,
      set: (d, v) => ({ ...(d as UnitConverterData), value: num(v) }),
    },
    {
      key: 'output',
      label: 'Converted output',
      valueType: 'number',
      get: (d) => convertedUnit(d as UnitConverterData),
    },
  ],
} satisfies Partial<Record<ModuleType, FieldDescriptor[]>>
