import type { ModuleType } from '../types/spatial'
import type { WidgetSizing } from './contracts/registry'

/**
 * The first content-safety calibration set. These 35 widgets cover every
 * renderer in EssentialWidgets, the ten automation expansion widgets, and
 * the five core multi-island cards. Values are unmounted fallbacks: a mounted
 * card may report a larger live minimum when its real content needs it.
 */
export const SIZING_REVIEW_TYPES = [
  'bullets', 'checklist', 'decision', 'priority_matrix', 'pros_cons',
  'text_input', 'number_input', 'toggle', 'branch_gate', 'formula',
  'status', 'date_picker', 'outline', 'form', 'daily_agenda',
  'process', 'risk_register', 'decision_matrix', 'swot', 'timesheet',
  'inventory', 'logbook', 'line_chart', 'pie_chart', 'unit_converter',
  'clock_pulse', 'comparator', 'aggregator', 'range_mapper', 'latch',
  'random_picker', 'sequencer', 'template', 'recorder', 'notifier',
] as const satisfies readonly ModuleType[]
type ReviewedType = (typeof SIZING_REVIEW_TYPES)[number]

const CONTENT_W = 640
const CONTENT_H = 640

function reviewedSizing(sizing: WidgetSizing): WidgetSizing {
  return sizing
}

/**
 * Static safety windows for culled and unmounted cards. The live DOM probe in
 * WidgetCard is authoritative once a renderer mounts, so these values express
 * the smallest useful full-card size rather than pretending all content is fixed.
 */
export const REVIEWED_WIDGET_SIZING = {
  bullets: reviewedSizing({ minWidth: 240, minHeight: 120, maxWidth: CONTENT_W, autoHeight: true }),
  checklist: reviewedSizing({ minWidth: 240, minHeight: 120, maxWidth: CONTENT_W, autoHeight: true }),
  decision: reviewedSizing({ minWidth: 280, minHeight: 160, maxWidth: CONTENT_W, maxHeight: CONTENT_H }),
  priority_matrix: reviewedSizing({ minWidth: 320, minHeight: 240, maxWidth: 800, maxHeight: CONTENT_H }),
  pros_cons: reviewedSizing({ minWidth: 280, minHeight: 160, maxWidth: 720, maxHeight: CONTENT_H }),

  text_input: reviewedSizing({ minWidth: 240, minHeight: 120, maxWidth: CONTENT_W, maxHeight: 520 }),
  number_input: reviewedSizing({ minWidth: 260, minHeight: 160, maxWidth: CONTENT_W, autoHeight: true }),
  toggle: reviewedSizing({ minWidth: 220, minHeight: 120, maxWidth: 480, autoHeight: true }),
  branch_gate: reviewedSizing({ minWidth: 160, minHeight: 120, maxWidth: CONTENT_W, autoHeight: true }),
  formula: reviewedSizing({ minWidth: 300, minHeight: 160, maxWidth: 720, autoHeight: true }),
  status: reviewedSizing({ minWidth: 240, minHeight: 120, maxWidth: 520, autoHeight: true }),
  date_picker: reviewedSizing({ minWidth: 240, minHeight: 160, maxWidth: CONTENT_W, autoHeight: true }),
  outline: reviewedSizing({ minWidth: 280, minHeight: 200, maxWidth: 720, maxHeight: CONTENT_H }),
  form: reviewedSizing({ minWidth: 300, minHeight: 240, maxWidth: 800, maxHeight: 720 }),
  daily_agenda: reviewedSizing({ minWidth: 300, minHeight: 240, maxWidth: 760, maxHeight: 720 }),
  process: reviewedSizing({ minWidth: 300, minHeight: 200, maxWidth: 760, maxHeight: CONTENT_H }),
  risk_register: reviewedSizing({ minWidth: 360, minHeight: 240, maxWidth: 960, maxHeight: 720 }),
  decision_matrix: reviewedSizing({ minWidth: 360, minHeight: 240, maxWidth: 960, maxHeight: 720 }),
  swot: reviewedSizing({ minWidth: 320, minHeight: 240, maxWidth: 880, maxHeight: 720 }),
  timesheet: reviewedSizing({ minWidth: 320, minHeight: 240, maxWidth: 880, maxHeight: 720 }),
  inventory: reviewedSizing({ minWidth: 320, minHeight: 240, maxWidth: 880, maxHeight: 720 }),
  logbook: reviewedSizing({ minWidth: 300, minHeight: 200, maxWidth: 760, maxHeight: CONTENT_H }),
  line_chart: reviewedSizing({ minWidth: 280, minHeight: 240, maxWidth: 800, maxHeight: CONTENT_H }),
  pie_chart: reviewedSizing({ minWidth: 180, minHeight: 280, maxWidth: 760, maxHeight: 720 }),
  unit_converter: reviewedSizing({ minWidth: 280, minHeight: 160, maxWidth: CONTENT_W, autoHeight: true }),

  clock_pulse: reviewedSizing({ minWidth: 280, minHeight: 200, maxWidth: CONTENT_W, autoHeight: true }),
  comparator: reviewedSizing({ minWidth: 200, minHeight: 160, maxWidth: CONTENT_W, autoHeight: true }),
  aggregator: reviewedSizing({ minWidth: 240, minHeight: 200, maxWidth: 720, autoHeight: true }),
  range_mapper: reviewedSizing({ minWidth: 280, minHeight: 200, maxWidth: 760, maxHeight: 720 }),
  latch: reviewedSizing({ minWidth: 240, minHeight: 160, maxWidth: 560, autoHeight: true }),
  random_picker: reviewedSizing({ minWidth: 280, minHeight: 200, maxWidth: 720, maxHeight: CONTENT_H }),
  sequencer: reviewedSizing({ minWidth: 280, minHeight: 200, maxWidth: 720, maxHeight: CONTENT_H }),
  template: reviewedSizing({ minWidth: 280, minHeight: 200, maxWidth: 720, maxHeight: CONTENT_H }),
  recorder: reviewedSizing({ minWidth: 280, minHeight: 200, maxWidth: 720, autoHeight: true }),
  notifier: reviewedSizing({ minWidth: 280, minHeight: 200, maxWidth: 720, autoHeight: true }),
} satisfies Record<ReviewedType, WidgetSizing>
