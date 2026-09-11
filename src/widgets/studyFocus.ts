import type { ModuleType } from '../types/spatial'

/**
 * The widget types a study session actually reaches for.
 *
 * This is a VIEW filter and nothing else. Every other type stays registered,
 * stays hydratable, and stays on every board that already holds one; turning
 * study focus off restores the full picker with no migration and no write.
 * Nothing in this file is ever consulted when a board is loaded or saved —
 * see deletedWidgetTypes.ts for the mechanism that actually drops records,
 * which this deliberately is not.
 *
 * The set crosses `category` lines on purpose. Study Deck is filed under
 * `notes` and Pomodoro is a skin inside `timekeeper`, so a plain
 * `category === 'study'` filter would hide the two cards a student uses most.
 */
export const STUDY_FOCUS_TYPES: ReadonlySet<ModuleType> = new Set<ModuleType>([
  // Coursework and marks
  'canvas_lms',
  'grade_calc',
  'past_papers',
  'citation',
  // Learning, recall, and review
  'flashcards',
  'memorization_ladder',
  'formula_sheet',
  'skill_tree',
  'reading_list',
  'experiments',
  'mistake_bank',
  // The general tools a session runs on
  'text',
  'outline',
  'checklist',
  'calendar',
  'timekeeper',
  'calculator',
  'unit_converter',
  // Board-to-board navigation. Without it a focused picker cannot reach
  // another canvas, which would make the filter feel like a trap.
  'canvas_node',
])

/** Whether `type` survives the study-focus filter. */
export function isStudyFocusType(type: ModuleType): boolean {
  return STUDY_FOCUS_TYPES.has(type)
}
