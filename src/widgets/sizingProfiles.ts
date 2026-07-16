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
export type WidgetLayoutTier = 'compact' | 'standard' | 'expanded'

const CONTENT_W = 640
const CONTENT_H = 640

function reviewedSizing(
  defaultWidth: number,
  sizing: Omit<WidgetSizing, 'layoutTiers'>,
  expandedMinWidth = defaultWidth + 80,
): WidgetSizing {
  const minWidth = sizing.minWidth ?? defaultWidth
  const maxWidth = sizing.maxWidth ?? CONTENT_W
  const compactMaxWidth = minWidth < defaultWidth
    ? Math.min(defaultWidth - 4, minWidth + 40)
    : undefined
  return {
    ...sizing,
    layoutTiers: {
      compactMaxWidth,
      expandedMinWidth: Math.min(maxWidth, expandedMinWidth),
    },
  }
}

/**
 * Static safety windows for culled and unmounted cards. The live DOM probe in
 * WidgetCard is authoritative once a renderer mounts, so these values express
 * the smallest useful layout tier rather than pretending all content is fixed.
 */
export const REVIEWED_WIDGET_SIZING = {
  bullets: reviewedSizing(280, { minWidth: 240, minHeight: 120, maxWidth: CONTENT_W, autoHeight: true }),
  checklist: reviewedSizing(280, { minWidth: 240, minHeight: 120, maxWidth: CONTENT_W, autoHeight: true }),
  decision: reviewedSizing(300, { minWidth: 280, minHeight: 160, maxWidth: CONTENT_W, maxHeight: CONTENT_H }),
  priority_matrix: reviewedSizing(380, { minWidth: 320, minHeight: 240, maxWidth: 800, maxHeight: CONTENT_H }),
  pros_cons: reviewedSizing(340, { minWidth: 280, minHeight: 160, maxWidth: 720, maxHeight: CONTENT_H }),

  text_input: reviewedSizing(280, { minWidth: 240, minHeight: 120, maxWidth: CONTENT_W, maxHeight: 520 }),
  number_input: reviewedSizing(280, { minWidth: 260, minHeight: 160, maxWidth: CONTENT_W, autoHeight: true }),
  toggle: reviewedSizing(240, { minWidth: 220, minHeight: 120, maxWidth: 480, autoHeight: true }),
  branch_gate: reviewedSizing(280, { minWidth: 160, minHeight: 120, maxWidth: CONTENT_W, autoHeight: true }),
  formula: reviewedSizing(320, { minWidth: 300, minHeight: 160, maxWidth: 720, autoHeight: true }),
  status: reviewedSizing(280, { minWidth: 240, minHeight: 120, maxWidth: 520, autoHeight: true }),
  date_picker: reviewedSizing(280, { minWidth: 240, minHeight: 160, maxWidth: CONTENT_W, autoHeight: true }),
  outline: reviewedSizing(360, { minWidth: 280, minHeight: 200, maxWidth: 720, maxHeight: CONTENT_H }),
  form: reviewedSizing(400, { minWidth: 300, minHeight: 240, maxWidth: 800, maxHeight: 720 }),
  daily_agenda: reviewedSizing(360, { minWidth: 300, minHeight: 240, maxWidth: 760, maxHeight: 720 }),
  process: reviewedSizing(360, { minWidth: 300, minHeight: 200, maxWidth: 760, maxHeight: CONTENT_H }),
  risk_register: reviewedSizing(440, { minWidth: 360, minHeight: 240, maxWidth: 960, maxHeight: 720 }),
  decision_matrix: reviewedSizing(440, { minWidth: 360, minHeight: 240, maxWidth: 960, maxHeight: 720 }),
  swot: reviewedSizing(400, { minWidth: 320, minHeight: 240, maxWidth: 880, maxHeight: 720 }),
  timesheet: reviewedSizing(400, { minWidth: 320, minHeight: 240, maxWidth: 880, maxHeight: 720 }),
  inventory: reviewedSizing(400, { minWidth: 320, minHeight: 240, maxWidth: 880, maxHeight: 720 }),
  logbook: reviewedSizing(360, { minWidth: 300, minHeight: 200, maxWidth: 760, maxHeight: CONTENT_H }),
  line_chart: reviewedSizing(400, { minWidth: 280, minHeight: 240, maxWidth: 800, maxHeight: CONTENT_H }),
  pie_chart: reviewedSizing(360, { minWidth: 180, minHeight: 280, maxWidth: 760, maxHeight: 720 }),
  unit_converter: reviewedSizing(320, { minWidth: 280, minHeight: 160, maxWidth: CONTENT_W, autoHeight: true }),

  clock_pulse: reviewedSizing(300, { minWidth: 280, minHeight: 200, maxWidth: CONTENT_W, autoHeight: true }, 460),
  comparator: reviewedSizing(320, { minWidth: 200, minHeight: 160, maxWidth: CONTENT_W, autoHeight: true }, 520),
  aggregator: reviewedSizing(300, { minWidth: 240, minHeight: 200, maxWidth: 720, autoHeight: true }),
  range_mapper: reviewedSizing(300, { minWidth: 280, minHeight: 200, maxWidth: 760, maxHeight: 720 }),
  latch: reviewedSizing(280, { minWidth: 240, minHeight: 160, maxWidth: 560, autoHeight: true }),
  random_picker: reviewedSizing(300, { minWidth: 280, minHeight: 200, maxWidth: 720, maxHeight: CONTENT_H }),
  sequencer: reviewedSizing(320, { minWidth: 280, minHeight: 200, maxWidth: 720, maxHeight: CONTENT_H }),
  template: reviewedSizing(320, { minWidth: 280, minHeight: 200, maxWidth: 720, maxHeight: CONTENT_H }),
  recorder: reviewedSizing(320, { minWidth: 280, minHeight: 200, maxWidth: 720, autoHeight: true }),
  notifier: reviewedSizing(320, { minWidth: 280, minHeight: 200, maxWidth: 720, autoHeight: true }),
} satisfies Record<ReviewedType, WidgetSizing>

export function widgetLayoutTier(type: ModuleType, width: number): WidgetLayoutTier {
  const sizing = REVIEWED_WIDGET_SIZING[type as ReviewedType]
  const tiers = sizing?.layoutTiers
  if (!tiers) return 'standard'
  if (tiers.compactMaxWidth !== undefined && width <= tiers.compactMaxWidth) return 'compact'
  if (width >= tiers.expandedMinWidth) return 'expanded'
  return 'standard'
}
