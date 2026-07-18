import type { ModuleType,
  DailyAgendaData,
  DecisionMatrixData,
  FormWidgetData,
  InventoryData,
  LineChartData,
  LogbookData,
  ModuleData,
  OutlineData,
  PieChartData,
  ProcessData,
  RiskRegisterData,
  SwotData,
  TimesheetData,
  UnitConverterData,
  WorldClockData,
} from '../../types/spatial'
import type { FieldDescriptor } from '../contracts/fields'
import { num, text, bool, primaryZoneTime, formFieldFilled, decisionWinner, convertedUnit } from './valueHelpers'

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
  daily_agenda: [
    {
      key: 'done_count',
      label: 'Done',
      valueType: 'number',
      get: (d) => (d as DailyAgendaData).items.filter((item) => item.done).length,
    },
    {
      key: 'all_done',
      label: 'All done',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as DailyAgendaData).items
        return items.length > 0 && items.every((item) => item.done)
      },
    },
    {
      key: 'next_item',
      label: 'Next item',
      valueType: 'text',
      get: (d) =>
        [...(d as DailyAgendaData).items]
          .sort((a, b) => a.time.localeCompare(b.time))
          .find((item) => !item.done)?.title ?? '',
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
      get: (d) => [...(d as LogbookData).entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.text ?? '',
    },
  ],
  line_chart: [
    {
      key: 'series',
      label: 'Series',
      valueType: 'series',
      get: (d) => (d as LineChartData).points.map((point, index) => ({ t: index, v: point.value })),
      set: (d, v) => {
        if (!Array.isArray(v)) return d
        return {
          ...(d as LineChartData),
          points: v.slice(-400).map((point) => ({
            id: crypto.randomUUID(),
            label: new Date(point.t).toLocaleDateString(),
            value: point.v,
          })),
        }
      },
    },
    {
      key: 'latest',
      label: 'Latest value',
      valueType: 'number',
      get: (d) => (d as LineChartData).points[(d as LineChartData).points.length - 1]?.value ?? 0,
    },
    {
      key: 'average',
      label: 'Average',
      valueType: 'number',
      get: (d) => {
        const points = (d as LineChartData).points
        return points.length ? points.reduce((sum, point) => sum + (Number.isFinite(point.value) ? point.value : 0), 0) / points.length : 0
      },
    },
    {
      key: 'max',
      label: 'Maximum',
      valueType: 'number',
      get: (d) => {
        const values = (d as LineChartData).points.map((point) => Number.isFinite(point.value) ? point.value : 0)
        return values.length ? Math.max(...values) : 0
      },
    },
  ],
  pie_chart: [
    {
      key: 'total',
      label: 'Total',
      valueType: 'number',
      get: (d) => (d as PieChartData).segments.reduce((sum, segment) => sum + (Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0), 0),
    },
    {
      key: 'largest_share',
      label: 'Largest share %',
      valueType: 'number',
      get: (d) => {
        const segments = (d as PieChartData).segments
        const total = segments.reduce((sum, segment) => sum + (Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0), 0)
        const largest = segments.reduce((max, segment) => Math.max(max, Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0), 0)
        return total > 0 ? (largest / total) * 100 : 0
      },
    },
    {
      key: 'largest_label',
      label: 'Largest segment',
      valueType: 'text',
      get: (d) => {
        const segments = (d as PieChartData).segments
        return segments.reduce<PieChartData['segments'][number] | null>((best, segment) => !best || segment.value > best.value ? segment : best, null)?.label ?? ''
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
  world_clock: [
    {
      key: 'primary_time',
      label: 'Primary time',
      valueType: 'text',
      get: (d) => primaryZoneTime((d as WorldClockData).zones),
      timeSensitive: true,
    },
    {
      key: 'zone_count',
      label: 'Zones',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as WorldClockData).zones.length,
    },
  ],
} satisfies Partial<Record<ModuleType, FieldDescriptor[]>>
