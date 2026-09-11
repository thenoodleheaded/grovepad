import type { MeetingNotesData } from '../../types/spatial'
import { shortDayText } from '../../components/widgets/modules/dateSkinModel'
import {
  agendaTotalMinutes,
  decisionsDueForReview,
  meetingItemDetails,
  meetingNotesSkinMode,
  meetingPanels,
  openActionCount,
} from '../../components/widgets/modules/meetingNotesSkinModel'
import {
  compact,
  REST_COLUMN_ITEM_LIMIT,
  REST_LINE_LIMIT,
  REST_ROW_LIMIT,
  type RestColumn,
  type RestEyebrow,
  type RestTone,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Meeting Notes resting faces.
//
// One meeting, seven shapes. A folded meeting keeps the arrangement its skin
// reads the four canonical facts in — an agenda folds to its numbered topics,
// minutes to ruled ledger lines, a stand-up to its three lanes, a retro to its
// quadrants — because the arrangement IS what the skin is for. Every reading
// below comes through meetingNotesSkinModel, so a resting tile can never
// disagree with the open card, with the `actions_done` port, or with undo.
// ---------------------------------------------------------------------------

type MeetingAction = MeetingNotesData['actions'][number]

/** The skins' own names for themselves, mirroring the expanded eyebrows. */
const EYEBROWS: Record<ReturnType<typeof meetingNotesSkinMode>, string> = {
  agenda: 'Agenda',
  minutes: 'Minutes',
  stand_up: 'Stand-up',
  retrospective: 'Retro',
  one_to_one: 'One-to-one',
  decision_review: 'Decision review',
  handoff: 'Handoff',
}

const TEXT_CLAMP = 220

function proseLines(text: string | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** A lane of prose read as its own lines — real words, never a count. */
function proseColumn(
  key: string,
  label: string,
  text: string | undefined,
  tone: RestTone,
): RestColumn {
  const lines = proseLines(text)
  const visible = lines.slice(0, REST_COLUMN_ITEM_LIMIT)
  return {
    key,
    label,
    tone,
    items: visible.map((line, index) => ({
      key: `${key}-${index}`,
      label: compact(line, 18),
    })),
    overflow: Math.max(0, lines.length - visible.length),
  }
}

function actionColumn(
  key: string,
  label: string,
  actions: readonly MeetingAction[],
  tone: RestTone,
): RestColumn {
  const visible = actions.slice(0, REST_COLUMN_ITEM_LIMIT)
  return {
    key,
    label,
    tone,
    items: visible.map((action) => ({
      key: action.id,
      label: compact(action.text || 'Untitled', 18),
      done: action.done === true,
    })),
    overflow: Math.max(0, actions.length - visible.length),
  }
}

function hasColumnInk(columns: readonly RestColumn[]): boolean {
  return columns.some((column) => column.items.length > 0)
}

/**
 * The resting face for a Meeting Notes card. Always returns a model: a card
 * with nothing typed anywhere rests as its own icon.
 */
export function meetingNotesRestingFace(data: Record<string, unknown>): RestingFaceModel {
  const meeting = data as unknown as MeetingNotesData
  const skin = meetingNotesSkinMode(meeting.skin)
  const actions = Array.isArray(meeting.actions) ? meeting.actions : []
  const details = meetingItemDetails(meeting, skin)
  const panels = meetingPanels(meeting, skin)
  const notes = typeof meeting.notes === 'string' ? meeting.notes : ''
  const date = typeof meeting.date === 'string' ? meeting.date : ''
  const dateNote = date ? shortDayText(date) : undefined
  const eyebrow = (note?: string, tone?: RestTone): RestEyebrow => ({
    label: EYEBROWS[skin],
    ...((note ?? dateNote) === undefined ? {} : { note: note ?? dateNote }),
    ...(tone === undefined ? {} : { tone }),
  })

  if (skin === 'agenda' && actions.length > 0) {
    const total = agendaTotalMinutes(meeting)
    const visible = actions.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: eyebrow(total > 0 ? `${total} min` : undefined),
      rows: visible.map((action, index) => {
        const detail = details[action.id] ?? {}
        const value = detail.minutes ? `${detail.minutes} min` : detail.outcome
        return {
          key: action.id,
          // The rail's own ordinal: an agenda is read in order.
          lead: String(index + 1),
          label: compact(action.text || 'Untitled topic', 28),
          done: action.done,
          ...(value ? { value: compact(value, 16) } : {}),
        }
      }),
      overflow: Math.max(0, actions.length - visible.length),
    }
  }

  if (skin === 'minutes' && actions.length > 0) {
    const visible = actions.slice(0, REST_LINE_LIMIT)
    return {
      kind: 'lines',
      eyebrow: eyebrow(),
      lines: visible.map((action) => {
        const detail = details[action.id] ?? {}
        const right = detail.owner || (detail.due ? shortDayText(detail.due) : '')
        return {
          key: action.id,
          left: compact(action.text || 'Untitled resolution', 26),
          ...(right ? { right: compact(right, 12) } : {}),
          // An adopted resolution reads settled, not struck through.
          ...(action.done ? { tone: 'good' as const } : {}),
        }
      }),
      ...(actions.length > visible.length
        ? { total: { key: 'more', left: `+${actions.length - visible.length} more`, dim: true } }
        : {}),
    }
  }

  if (skin === 'stand_up') {
    const columns: RestColumn[] = [
      proseColumn('yesterday', 'Yesterday', panels.yesterday, 'muted'),
      proseColumn('today', 'Today', notes, 'accent'),
      proseColumn('blockers', 'Blockers', panels.blockers, panels.blockers ? 'bad' : 'muted'),
    ]
    if (actions.length > 0) columns.push(actionColumn('asks', 'Asks', actions, 'warn'))
    if (hasColumnInk(columns)) {
      return { kind: 'columns', eyebrow: eyebrow(), columns }
    }
  }

  if (skin === 'retrospective') {
    const columns: RestColumn[] = [
      proseColumn('kept', 'Went well', notes, 'good'),
      proseColumn('dropped', 'Did not', panels.improve, 'bad'),
      proseColumn('learned', 'Learned', panels.learned, 'warn'),
      actionColumn('next', 'Next', actions, 'accent'),
    ]
    if (hasColumnInk(columns)) {
      // wrap: 2 keeps the retro's 2×2 quadrants a matrix, not four columns.
      return { kind: 'columns', wrap: 2, eyebrow: eyebrow(), columns }
    }
  }

  if (skin === 'one_to_one' && actions.length > 0) {
    const today = new Date().toISOString().slice(0, 10)
    const visible = actions.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: eyebrow(panels.followUp ? `Next ${shortDayText(panels.followUp)}` : undefined),
      rows: visible.map((action) => {
        const detail = details[action.id] ?? {}
        const value = detail.owner || (detail.due ? shortDayText(detail.due) : '')
        const overdue = Boolean(detail.due) && detail.due! < today && !action.done
        return {
          key: action.id,
          label: compact(action.text || 'Untitled commitment', 28),
          done: action.done,
          ...(value ? { value: compact(value, 16) } : {}),
          ...(overdue ? { tone: 'bad' as const } : {}),
        }
      }),
      overflow: Math.max(0, actions.length - visible.length),
    }
  }

  if (skin === 'decision_review' && actions.length > 0) {
    const today = new Date().toISOString().slice(0, 10)
    const due = decisionsDueForReview(meeting, today)
    const visible = actions.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: due > 0 ? eyebrow(`${due} to revisit`, 'warn') : eyebrow(),
      rows: visible.map((action) => {
        const detail = details[action.id] ?? {}
        const value = detail.review ? shortDayText(detail.review) : detail.owner
        const revisit = Boolean(detail.review) && detail.review! <= today
        return {
          key: action.id,
          label: compact(action.text || 'Untitled decision', 28),
          done: action.done,
          ...(value ? { value: compact(value, 16) } : {}),
          ...(revisit ? { tone: 'warn' as const } : {}),
        }
      }),
      overflow: Math.max(0, actions.length - visible.length),
    }
  }

  if (skin === 'handoff' && actions.length > 0) {
    const open = openActionCount(meeting)
    const acceptedBy = panels.acknowledgedBy ? compact(panels.acknowledgedBy, 12) : ''
    const note = panels.acknowledged
      ? (acceptedBy ? `Accepted · ${acceptedBy}` : 'Accepted')
      : open > 0 ? `${open} open` : 'Awaiting sign-off'
    const visible = actions.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: eyebrow(note, panels.acknowledged ? 'good' : open > 0 ? 'warn' : undefined),
      rows: visible.map((action, index) => {
        const detail = details[action.id] ?? {}
        const value = detail.owner || (detail.due ? shortDayText(detail.due) : '')
        return {
          key: action.id,
          // The handoff's numbered steps: the next owner works them in order.
          lead: String(index + 1),
          label: compact(action.text || 'Untitled step', 28),
          done: action.done,
          ...(value ? { value: compact(value, 16) } : {}),
        }
      }),
      overflow: Math.max(0, actions.length - visible.length),
    }
  }

  // No list and no lanes: the meeting rests as whatever prose it does hold.
  // `panels` only ever carries the worn skin's own pockets.
  const spare = [
    notes,
    panels.yesterday,
    panels.blockers,
    panels.improve,
    panels.learned,
    panels.feedback,
    panels.risks,
  ].find((text) => text && text.trim())
  if (spare) return { kind: 'text', text: compact(spare, TEXT_CLAMP) }
  return { kind: 'icon' }
}
