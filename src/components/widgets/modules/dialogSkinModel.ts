import type { DialogData, DialogLine } from '../../../types/widgetDataCore'

/**
 * Dialog skins are different readings of one script. Speaker and cue stay
 * canonical; translations, rehearsal directions, and timecodes live in their
 * own isolated skin-state pockets.
 */
export type DialogSkinMode =
  | 'screenplay'
  | 'chat'
  | 'interview'
  | 'roleplay'
  | 'comic'
  | 'localization'
  | 'audio_transcript'

export type DialogDetailField = 'directions' | 'translations' | 'timestamps'

const SKINS = new Set<DialogSkinMode>([
  'screenplay',
  'chat',
  'interview',
  'roleplay',
  'comic',
  'localization',
  'audio_transcript',
])

const DETAIL_LIMIT = 2_000
const DETAIL_COUNT_LIMIT = 400

export function dialogSkinMode(raw: unknown): DialogSkinMode {
  return typeof raw === 'string' && SKINS.has(raw as DialogSkinMode)
    ? raw as DialogSkinMode
    : 'screenplay'
}

export function dialogSpeaker(line: Pick<DialogLine, 'character'>): string {
  return line.character.trim() || 'CHARACTER'
}

/** Stable first-appearance order makes chat sides and speaker hues predictable. */
export function dialogSpeakers(lines: readonly DialogLine[]): string[] {
  const speakers: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const speaker = dialogSpeaker(line).toLocaleUpperCase()
    if (seen.has(speaker)) continue
    seen.add(speaker)
    speakers.push(speaker)
  }
  return speakers
}

function detailMap(state: Record<string, unknown>, field: DialogDetailField): Record<string, string> {
  const raw = state[field]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const result: Record<string, string> = {}
  for (const [id, value] of Object.entries(raw).slice(0, DETAIL_COUNT_LIMIT)) {
    if (typeof value !== 'string') continue
    result[id] = value.slice(0, DETAIL_LIMIT)
  }
  return result
}

export function dialogDetail(
  state: Record<string, unknown>,
  field: DialogDetailField,
  lineId: string,
): string {
  return detailMap(state, field)[lineId] ?? ''
}

export function withDialogDetail(
  state: Record<string, unknown>,
  field: DialogDetailField,
  lineId: string,
  value: string,
): Record<string, unknown> {
  const map = detailMap(state, field)
  const bounded = value.slice(0, DETAIL_LIMIT)
  if (bounded) map[lineId] = bounded
  else delete map[lineId]

  const next = { ...state }
  if (Object.keys(map).length > 0) next[field] = map
  else delete next[field]
  return next
}

/**
 * Removing a canonical line also prunes its optional details from every skin,
 * so deleted script text cannot leave hidden persistence debris behind.
 */
export function withoutDialogLine(data: DialogData, lineId: string): DialogData {
  const nextStates: Record<string, Record<string, unknown>> = {}

  for (const [skin, rawState] of Object.entries(data.skinStates ?? {})) {
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) continue
    const state = { ...rawState }
    for (const field of ['directions', 'translations', 'timestamps'] as const) {
      const map = detailMap(state, field)
      delete map[lineId]
      if (Object.keys(map).length > 0) state[field] = map
      else delete state[field]
    }
    if (Object.keys(state).length > 0) nextStates[skin] = state
  }

  const next: DialogData = {
    ...data,
    lines: data.lines.filter((line) => line.id !== lineId),
  }
  if (Object.keys(nextStates).length > 0) next.skinStates = nextStates
  else delete next.skinStates
  return next
}

export function transcriptTimecode(index: number, stored: string): string {
  const clean = stored.trim().slice(0, 12)
  if (clean) return clean
  const seconds = Math.max(0, index) * 5
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
