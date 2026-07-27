import type {
  MeetingNotesData,
  MeetingNotesSkinMode,
  ModuleData,
} from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'

/**
 * Meeting Notes skins.
 *
 * One meeting is always the same four facts — when it happened, who was
 * there, what was said, and what somebody now owes. A skin never moves those
 * facts; it decides what shape they are read in. So `date`, `attendees`,
 * `notes`, and `actions` stay canonical and every shape shows all four, while
 * the extras a shape asks for (a topic's timebox, a decision's review date, a
 * stand-up's blockers) live in that skin's own isolated state. Rolling from
 * Agenda to Retrospective and back can therefore never lose a word.
 */

export const MEETING_NOTES_SKINS: readonly MeetingNotesSkinMode[] = [
  'agenda',
  'minutes',
  'stand_up',
  'retrospective',
  'one_to_one',
  'decision_review',
  'handoff',
]

/** Extras attached to one action item, isolated per skin by the action's id. */
export interface MeetingItemDetails {
  /** Agenda timebox in whole minutes, kept as typed text. */
  minutes?: string
  /** Agenda desired outcome. */
  outcome?: string
  /** Who carries the item — minutes, one-to-one, decision review, handoff. */
  owner?: string
  /** ISO date (yyyy-mm-dd). */
  due?: string
  /** Why a decision went the way it did. */
  rationale?: string
  /** ISO date (yyyy-mm-dd) a decision is revisited. */
  review?: string
}

/** Prose panels a shape asks for beyond the shared notes field. */
export interface MeetingPanels {
  /** Stand-up. */
  yesterday?: string
  blockers?: string
  /** Retrospective. */
  improve?: string
  learned?: string
  /** One-to-one. */
  feedback?: string
  followUp?: string
  /** Handoff. */
  risks?: string
  acknowledgedBy?: string
  acknowledged?: boolean
}

const ITEM_KEYS = [
  'minutes',
  'outcome',
  'owner',
  'due',
  'rationale',
  'review',
] as const

const PANEL_TEXT_KEYS = [
  'yesterday',
  'blockers',
  'improve',
  'learned',
  'feedback',
  'followUp',
  'risks',
  'acknowledgedBy',
] as const

const MAX_ACTIONS = 200
const MAX_PANEL = 4_000
const MAX_DETAIL = 500

function cleanText(raw: unknown, limit: number): string {
  return typeof raw === 'string' ? raw.slice(0, limit) : ''
}

export function meetingNotesSkinMode(raw: unknown): MeetingNotesSkinMode {
  return typeof raw === 'string' && MEETING_NOTES_SKINS.includes(raw as MeetingNotesSkinMode)
    ? raw as MeetingNotesSkinMode
    : 'agenda'
}

/** Attendees are typed as one free line; every shape that shows them as chips reads this. */
export function meetingAttendees(raw: unknown): string[] {
  return cleanText(raw, MAX_PANEL)
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 40)
}

function itemsFromState(state: WidgetSkinState): Record<string, MeetingItemDetails> {
  const raw = state.items
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, MeetingItemDetails> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_ACTIONS)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const source = value as Record<string, unknown>
    const detail: MeetingItemDetails = {}
    for (const key of ITEM_KEYS) {
      const text = cleanText(source[key], MAX_DETAIL)
      if (text) detail[key] = text
    }
    if (Object.keys(detail).length > 0) result[id] = detail
  }
  return result
}

/** Per-action extras belonging to one skin. */
export function meetingItemDetails(
  data: Pick<MeetingNotesData, 'skinStates'>,
  skin: MeetingNotesSkinMode,
): Record<string, MeetingItemDetails> {
  return itemsFromState(skinStateFor(data, skin))
}

/** Prose panels belonging to one skin. */
export function meetingPanels(
  data: Pick<MeetingNotesData, 'skinStates'>,
  skin: MeetingNotesSkinMode,
): MeetingPanels {
  const state = skinStateFor(data, skin)
  const panels: MeetingPanels = {}
  for (const key of PANEL_TEXT_KEYS) {
    const text = cleanText(state[key], MAX_PANEL)
    if (text) panels[key] = text
  }
  if (state.acknowledged === true) panels.acknowledged = true
  return panels
}

export function dataWithMeetingPanels(
  data: MeetingNotesData,
  skin: MeetingNotesSkinMode,
  patch: Partial<MeetingPanels>,
): MeetingNotesData {
  const state = skinStateFor(data, skin)
  const next: WidgetSkinState = { ...state, ...patch }
  for (const key of PANEL_TEXT_KEYS) {
    if (next[key] === '') delete next[key]
  }
  if (next.acknowledged !== true) delete next.acknowledged
  return dataWithSkinState({ ...data, skin } as ModuleData, skin, next) as MeetingNotesData
}

export function dataWithMeetingItemDetails(
  data: MeetingNotesData,
  skin: MeetingNotesSkinMode,
  actionId: string,
  patch: Partial<MeetingItemDetails>,
): MeetingNotesData {
  const state = skinStateFor(data, skin)
  const items = itemsFromState(state)
  const detail = { ...(items[actionId] ?? {}), ...patch }
  for (const key of ITEM_KEYS) {
    if (detail[key] === '') delete detail[key]
  }
  const nextItems = { ...items }
  if (Object.keys(detail).length > 0) nextItems[actionId] = detail
  else delete nextItems[actionId]

  const nextState: WidgetSkinState = { ...state }
  if (Object.keys(nextItems).length > 0) nextState.items = nextItems
  else delete nextState.items
  return dataWithSkinState({ ...data, skin } as ModuleData, skin, nextState) as MeetingNotesData
}

/**
 * Removing an action removes its extras from every skin, not just the one on
 * screen — otherwise a deleted topic's timebox would reattach to whatever new
 * item happened to reuse the id.
 */
export function removeMeetingAction(
  data: MeetingNotesData,
  actionId: string,
): MeetingNotesData {
  const nextStates = Object.fromEntries(
    Object.entries(data.skinStates ?? {}).flatMap(([skin, rawState]) => {
      if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return []
      const state = rawState as Record<string, unknown>
      const items = itemsFromState(state)
      delete items[actionId]
      const nextState: Record<string, unknown> = { ...state }
      if (Object.keys(items).length > 0) nextState.items = items
      else delete nextState.items
      return [[skin, nextState]]
    }),
  )
  return {
    ...data,
    actions: data.actions.filter((action) => action.id !== actionId),
    ...(Object.keys(nextStates).length > 0 ? { skinStates: nextStates } : {}),
  }
}

/** Total planned minutes across agenda topics. */
export function agendaTotalMinutes(
  data: Pick<MeetingNotesData, 'actions' | 'skinStates'>,
): number {
  const items = meetingItemDetails(data, 'agenda')
  return data.actions.reduce((total, action) => {
    const parsed = Number.parseInt(items[action.id]?.minutes ?? '', 10)
    return total + (Number.isFinite(parsed) && parsed > 0 ? parsed : 0)
  }, 0)
}

/** Decisions whose review date has arrived, counted against a given day. */
export function decisionsDueForReview(
  data: Pick<MeetingNotesData, 'actions' | 'skinStates'>,
  today: string,
): number {
  const items = meetingItemDetails(data, 'decision_review')
  return data.actions.filter((action) => {
    const review = items[action.id]?.review
    return Boolean(review) && review! <= today
  }).length
}

export function openActionCount(data: Pick<MeetingNotesData, 'actions'>): number {
  return data.actions.filter((action) => !action.done).length
}
