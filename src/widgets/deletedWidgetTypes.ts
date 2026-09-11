// ---------------------------------------------------------------------------
// Deleted widget types — the one list of card names that no longer exist.
//
// These cards were removed from the product outright: they are absent from
// `ModuleType`, from `WIDGET_REGISTRY`, and from every field, renderer, and
// creation surface, so nothing in the app can make one or look one up.
//
// Their names survive here for exactly one reason: a board saved while they
// existed still holds their records, and an unrecognised type would otherwise
// hydrate as a locked placeholder card. Persistence reads this list on both
// hydration paths and DROPS those records, so a deleted card cannot reappear
// on a canvas that once held it. The skin catalogue reads it too, so a
// generated catalogue entry left behind for a deleted name is skipped instead
// of throwing while the registry is being assembled.
//
// This module imports nothing at all, which is what lets the registry read it
// mid-assembly without an import cycle.
// ---------------------------------------------------------------------------

export const DELETED_WIDGET_TYPES: ReadonlySet<string> = new Set([
  // Folded into Notes
  'quote',
  'sticky_note',
  'cornell',
  // Folded into Chart
  'line_chart',
  'pie_chart',
  // Folded into Goal
  'progress',
  'study_goal',
  'okr',
  // Folded into Time
  'timer',
  'pomodoro',
  'stopwatch',
  'countdown',
  'world_clock',
  // Folded into Drawing
  'excalidraw',
  // Folded into a single canonical card each
  'random_picker',
  'gpa',
  'vocab',
  'quiz',
  // Folded into Tasks
  'kanban',
  'assignment',
  'daily_agenda',
  'weekly_planner',
  'timeline',
  'priority_matrix',
  // Removed long before the consolidation, never replaced
  'divider',
])

export function isDeletedWidgetType(type: string): boolean {
  return DELETED_WIDGET_TYPES.has(type)
}
